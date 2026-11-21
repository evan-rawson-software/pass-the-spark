"""Monte Carlo model of the Pass the Spark chain rules with a draft starting deck.

Rules modelled (as recorded in the design doc on 2026-11-18):
- one chain per round, fixed seat order, one domino per turn, enemy has a seat
- the lead's first domino is a fuse (effect wasted); the lead rotates each round
- draw 3 per round up to a hand limit of 10; unspent dominoes carry over (DRAW; the first run used 5)
- a player who can answer must; the chain ends when a player cannot answer
- the enemy must react with its leftmost matching domino; if it has none the spark passes on
- enemy draws 2 per round (basic enemy), hand limit 5, discards its oldest at the limit
- enemy dominoes left in hand at round end go off at base strength and stay in hand
- strength = number of answers so far; lap number multiplies player effects only
"""
import random
import statistics
import sys

# name, set off by, gives off, base value, kind
STARTER = [
    ("Jab", "E", "T", 3, "hit"), ("Jab", "E", "T", 3, "hit"),
    ("Splash", "T", "G", 2, "hit"), ("Splash", "T", "G", 2, "hit"),
    ("Kindle", "G", "E", 2, "hit"), ("Kindle", "G", "E", 2, "hit"),
    ("Brace", "E", "G", 4, "block"), ("Shelter", "G", "T", 4, "block"), ("Parry", "T", "E", 4, "block"),
    ("Lookout", "E", "E", 0, "scout"),
]
ENEMY_BASIC = [("Bellow", "E", "T"), ("Bellow", "E", "G"), ("Gulp", "T", "E"), ("Gulp", "T", "G"), ("Stomp", "G", "E"), ("Stomp", "G", "T")]
ENEMY_ROT = [(n, i, "R") for n, i, _ in ENEMY_BASIC]
HAND_MAX, DRAW, E_LIMIT, E_DRAW = 10, 3, 5, 2


class Player:
    def __init__(self, deck):
        self.deck = list(deck)
        random.shuffle(self.deck)
        self.hand, self.discard = [], []

    def draw(self, n):
        for _ in range(n):
            if len(self.hand) >= HAND_MAX:
                return
            if not self.deck:
                self.deck, self.discard = self.discard, []
                random.shuffle(self.deck)
            if not self.deck:
                return
            self.hand.append(self.deck.pop())


def lookahead(hands, order, pos, spark, depth, memo):
    """Longest continuation counting player answers only, assuming the enemy passes."""
    if depth == 0:
        return 0
    n = len(order)
    p = pos
    while True:
        p = (p + 1) % n
        if order[p] != "E":
            break
    who = order[p]
    key = (tuple(tuple(sorted((d[1], d[2]) for d in h)) for h in hands), p, spark, depth)
    if key in memo:
        return memo[key]
    seen, best = set(), 0
    for i, d in enumerate(hands[who]):
        if d[1] != spark or (d[1], d[2]) in seen:
            continue
        seen.add((d[1], d[2]))
        nh = list(hands)
        nh[who] = hands[who][:i] + hands[who][i + 1:]
        best = max(best, 1 + lookahead(nh, order, p, d[2], depth - 1, memo))
    memo[key] = best
    return best


def battle(P, enemy_cards, policy, rounds, S, depth=6):
    players = [Player(STARTER) for _ in range(P)]
    order = list(range(P))
    order.insert(random.randrange(P + 1), "E")
    e_deck = list(enemy_cards)
    random.shuffle(e_deck)
    e_hand, e_disc = [], []
    for r in range(rounds):
        for pl in players:
            pl.draw(DRAW)
        for _ in range(E_DRAW):
            if not e_deck:
                e_deck, e_disc = e_disc, []
                random.shuffle(e_deck)
            if not e_deck:
                break
            if len(e_hand) >= E_LIMIT:
                e_disc.append(e_hand.pop(0))
                S["expired"] += 1
            e_hand.append(e_deck.pop())
        lead = r % P
        hands = [pl.hand for pl in players]
        lead_pos = order.index(lead)

        def pick(who, pos, options):
            if policy == "random" or len(options) == 1:
                return random.choice(options)
            memo, best, best_i = {}, -1, options[0]
            for i in options:
                d = hands[who][i]
                nh = [list(h) for h in hands]
                nh[who].pop(i)
                v = lookahead(nh, order, pos, d[2], depth, memo)
                if v > best:
                    best, best_i = v, i
            return best_i

        fuse_i = pick(lead, lead_pos, list(range(len(hands[lead]))))
        fuse = hands[lead].pop(fuse_i)
        players[lead].discard.append(fuse)
        spark, pos, links, lap, dmg, block, reacts, react_str = fuse[2], lead_pos, 0, 1, 0, 0, 0, 0
        while True:
            pos = (pos + 1) % len(order)
            who = order[pos]
            if pos == lead_pos:
                lap += 1
            if who == "E":
                hit = next((i for i, d in enumerate(e_hand) if d[1] == spark), None)
                if hit is not None:
                    d = e_hand.pop(hit)
                    e_disc.append(d)
                    reacts += 1
                    react_str += max(1, links)  # enemy reactions scale with strength only, not lap
                    spark = d[2]
                continue
            legal = [i for i, d in enumerate(hands[who]) if d[1] == spark]
            if not legal:
                break
            kinds = {(hands[who][i][1], hands[who][i][2], hands[who][i][0]) for i in legal}
            S["turns"] += 1
            S["forced"] += len(kinds) == 1
            i = pick(who, pos, legal)
            d = hands[who].pop(i)
            players[who].discard.append(d)
            links += 1
            if d[4] == "hit":
                dmg += d[3] * links * lap
            elif d[4] == "block":
                block += d[3] * links * lap
            spark = d[2]
        S["links"].append(links)
        S["by_round"][r].append(links)
        S["laps"].append(lap)
        S["dmg"].append(dmg)
        S["block"].append(block)
        S["reacts"].append(reacts)
        S["react_str"].append(react_str)
        S["leftover"].append(len(e_hand))
        S["hand_sizes"].append(sum(len(h) for h in hands) / P)
        S["rot_break"] += spark == "R"


def run(P, enemy_cards, policy, battles, rounds=6):
    S = {"links": [], "laps": [], "dmg": [], "block": [], "reacts": [], "react_str": [], "leftover": [], "hand_sizes": [],
         "turns": 0, "forced": 0, "expired": 0, "rot_break": 0, "by_round": [[] for _ in range(rounds)]}
    for _ in range(battles):
        battle(P, enemy_cards, policy, rounds, S)
    L = sorted(S["links"])
    n = len(L)
    return {
        "mean": statistics.mean(L), "median": L[n // 2], "p90": L[int(n * 0.9)], "max": L[-1],
        "zero": sum(1 for x in L if x == 0) / n, "short": sum(1 for x in L if x <= 2) / n,
        "lap2": sum(1 for x in S["laps"] if x >= 2) / n, "lap3": sum(1 for x in S["laps"] if x >= 3) / n,
        "forced": S["forced"] / max(1, S["turns"]), "dmg": statistics.mean(S["dmg"]), "block": statistics.mean(S["block"]),
        "reacts": statistics.mean(S["reacts"]), "leftover": statistics.mean(S["leftover"]),
        "expired": S["expired"] / n, "hand": statistics.mean(S["hand_sizes"]), "rot_break": S["rot_break"] / n,
        "by_round": [statistics.mean(x) for x in S["by_round"]],
    }


if __name__ == "__main__":
    random.seed(7)
    print("players enemy  policy  | links: mean med p90 max | 0 links  <=2 | lap2+ lap3+ | forced | dmg/rd block/rd | reacts left expired | hand")
    for P in (3, 4):
        for ename, ecards in (("basic", ENEMY_BASIC), ("rot", ENEMY_ROT)):
            for policy, battles in (("random", 3000), ("smart", 400)):
                r = run(P, ecards, policy, battles)
                print(f"{P:^7} {ename:^6} {policy:^7} | {r['mean']:5.1f} {r['median']:3d} {r['p90']:3d} {r['max']:3d} | {r['zero']:6.0%} {r['short']:5.0%} | "
                      f"{r['lap2']:5.0%} {r['lap3']:5.0%} | {r['forced']:6.0%} | {r['dmg']:6.0f} {r['block']:6.0f} | "
                      f"{r['reacts']:5.2f} {r['leftover']:4.1f} {r['expired']:5.2f} | {r['hand']:4.1f}")
                print("          links by round:", " ".join(f"{x:4.1f}" for x in r["by_round"]), f"| rounds ended by Rot: {r['rot_break']:.0%}")
                sys.stdout.flush()
