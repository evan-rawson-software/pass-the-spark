# Pass the Spark: build brief

Written 2026-11-18 as a handoff from a design conversation to a coding session. "Pass the Spark" and every domino, spark, enemy and event name are placeholders. All numbers are starting values to tune.

This brief is self-contained. Where it marks something **Assumption**, the designer has not confirmed it; ask before building on it if it matters.

## Kickoff prompt

Paste this into the coding session along with this file and `chain_sim.py`:

> Read `pass-the-spark-build-brief.md` in full before doing anything. It is the design for a 2D online co-op game. Start with milestone 1 only: a headless, deterministic rules engine for combat with unit tests, using `chain_sim.py` as a reference for the chain rules. Do not start on UI or networking yet. Before writing code, list any rule in the brief you find ambiguous and ask me about it.

## What the game is

A turn-based co-op deckbuilder for 3-4 friends online. Each round the whole party builds one chain of dominoes. A domino is set off by the spark of the domino before it, performs an effect, and gives off its own spark for the next seat. The enemy sits in the turn order with a hidden hand and must react when a spark sets off one of its dominoes.

## Hard requirements

- 2D.
- Online co-op, supporting at least 3 players (design target 3-4). No solo mode is required.
- Turn-based and slow-paced. No real-time play, no reflex tests.
- Fully cooperative. No traitors, no individual scores that affect the run.
- Friendly tone: a broken chain should read as bad luck on the draw, not one player's mistake.
- Screens must look like a game (one table scene with a small HUD), not a website of panels.
- Engine: **Assumption** Godot 4, host-authoritative, Steam lobbies and relay. Confirm with the designer.

## Combat rules

### Terms

- **Spark:** a type passed along the chain. Basic sparks: Ember, Tide, Gale. Rare sparks: Storm, Void. Enemy-only spark: Rot.
- **Domino:** has an intake (one or more sparks that set it off), an effect, and an output (one or more sparks it gives off).
- **Seat order:** a fixed cycle of all players plus the enemy for the whole battle.
- **Lead:** the player who starts the round's chain. The lead rotates each round.
- **Strength:** the chain's current strength. **Assumption:** the first answer is played at strength 1 and each player answer adds 1; Amplify effects add more.
- **Lap:** **Assumption** starts at 1 and increases by 1 each time the turn returns to the lead's seat.

### Battle setup

- One enemy per fight.
- Every player has their own deck, hand and discard pile. Played dominoes go to their owner's discard; a deck that runs out is reshuffled from its discard.
- Party health is one shared pool.
- Party seating rotates every battle so each player takes a turn sitting just before the enemy. **Assumption:** rotate the player order by one seat each battle and keep the enemy's position in the cycle fixed.

### A round

1. **Draw.** Each player draws 3 dominoes, up to a hand limit of 10. Unspent dominoes stay in hand between rounds.
2. **Enemy draws.** **Assumption:** at the start of the round, 2 for a basic enemy, 3-4 for an elite, 5 for a boss. Its hand limit is 5; at the limit it discards its oldest domino to make room.
3. **Open hands.** Players can see each other's hands. The enemy's hand is hidden.
4. **Fuse.** The lead plays any domino as the fuse. Its effect is wasted; its output becomes the current spark.
5. **Pass.** The spark moves to the next seat in order. One domino per turn.
6. **Player's turn.** If the player holds any domino the current spark sets off, they must play one, and they choose which. Its effect resolves at the current strength and lap, then its output becomes the current spark. If they hold none, the chain ends.
7. **Enemy's turn.** If the enemy holds a domino the spark sets off, it must play it. If it holds none, the spark passes on unchanged and the chain continues. The enemy never ends the chain by failing to react.
8. **End.** When the chain ends, the round ends, even if players still hold dominoes.

Because playing is compulsory, the only way to stop a chain on purpose is to play a domino whose output the next player cannot answer.

### Effects and scaling

- A player domino's effect is multiplied by strength and by lap. **Assumption:** value = base x strength x lap.
- An enemy reaction is multiplied by strength only, not by lap. **Assumption:** an enemy reaction does not raise strength.
- After an enemy reaction, its domino's output becomes the current spark and the next player must answer that.
- Block built during a chain absorbs enemy damage until the round ends, then resets.
- There are no finishers. Every domino should have a real effect and improve what follows.

Augments to support: Amplify (adds extra strength), Echo (the next domino triggers twice), Mimic (repeats the previous domino's effect), Streak (pays off when recent sparks were all the same), Spectrum (pays off per different spark in the chain), Momentum (pays off per lap completed). Spread (hit every enemy) is out while fights have one enemy.

### The enemy

- Enemies act only through their dominoes. They have no separate attack.
- Its hand is an ordered row, oldest on the left. When several of its dominoes answer a spark, it plays the leftmost.
- At round end, every domino still in its hand goes off at base strength. Those dominoes stay in its hand and go off again every round until the party sets them off during a chain. **Assumption:** they resolve left to right, after which block resets.
- Information the players get, all on the main screen with no pop-ups:
  - The enemy's full deck list is always visible. Decks are small (about six dominoes).
  - Dominoes the enemy has played stay face up until its deck reshuffles.
  - When a spark passes the enemy with no reaction, mark that spark as safe until the enemy next draws.
  - Scouting dominoes reveal one domino in its hand, shown in its place in the row.
- Tiers:
  - Basic enemies hold basic dominoes only (plain hits, heals, blocks). The simulation shows their dominoes should give off basic sparks, not Rot.
  - Elites add special dominoes. In: **Pilfer** (takes one domino from the hand of the player who passed it the spark; the enemy holds it face up and can react with it; returned when the fight ends) and **Reflect** (repeats the previous domino's effect against the party).
  - Bosses add at least one passive the party must play around. In: **The Auditor** (passing the same spark twice in a row costs 2 strength) and **The Glutton** (heals every time the chain completes a lap).
- **Assumption:** the party wins when the enemy's health reaches 0 and loses when party health reaches 0.

### Starting deck

Every player starts with the same ten dominoes.

| Domino | Copies | Set off by | Effect | Gives off |
| --- | --- | --- | --- | --- |
| Jab | 2 | Ember | Deal 3 | Tide |
| Splash | 2 | Tide | Deal 2 | Gale |
| Kindle | 2 | Gale | Deal 2 | Ember |
| Brace | 1 | Ember | Block 4 | Gale |
| Shelter | 1 | Gale | Block 4 | Tide |
| Parry | 1 | Tide | Block 4 | Ember |
| Lookout | 1 | Ember | Reveal one enemy domino | Ember |

Example dominoes beyond the starter: Bellows (Ember; Amplify +2; Gale), Echo stone (Gale; Echo; Tide), Mimic (Ember or Tide; Mimic; Gale), Drumbeat (Gale; Streak hit; Gale), Prism (any basic spark; Spectrum; Storm), Flywheel (Storm; Momentum; Ember or Tide), Riposte (an enemy's spark; heavy hit; Gale).

Example basic enemy, the Ogre: two Bellow (Ember; hits the party), two Gulp (Tide; heals itself), two Stomp (Gale; hits the lead player).

Rarity rules: common dominoes take one basic spark in and give one basic spark out. Rarer dominoes may take two sparks or any spark, give off two sparks (the next seat answers either), or use rare sparks that few dominoes accept.

## Outside battle

- **Structure:** a run-based deckbuilder with a branching map in the style of Slay the Spire. Stops: regular fights, elite fights, rest sites, question-mark events, a Trader, and a boss at the end of each act.
- **Boss preview:** the act's boss and its passive are visible on the map from the start of the act.
- **Route:** **Assumption** the party votes at each fork; ties are broken at random.
- **Rewards:** after every battle each player gets their own offer of three dominoes and picks one, all at the same time. Passives ("charms") are personal. **Assumption:** charms come from elite and boss fights.
- **Coins:** personal. Every battle pays coins (normal least, elite more, boss most) and players start a run with some.
- **Rest sites:** each player chooses to rest (heal shared party health) or upgrade one domino.
- **Upgrades:** each of a domino's three parts can be upgraded once: intake (add a second basic spark that sets it off), effect (stronger), output (add a second basic spark it gives off). Upgrades only add basic sparks. Fallback if this makes chains too reliable: effect plus one widened half.
- **Trader:** sells dominoes, removes a domino for a fee, and lets players hand a domino to a teammate. **Assumption:** it also sells upgrades.
- **Meta-progression:** an experience bar filled by every run, win or lose, unlocking new kinds of dominoes. No feat-based unlocks. Each player's offers come from their own unlocks, so nothing depends on the host.

### Events

| Event | Kind | Choices |
| --- | --- | --- |
| The Toll Bridge | Party vote | Pay 15 coins each; or fight a hard fight for a rare domino offer; or turn back (next stop's type is hidden). |
| The Tinker's Bench | Personal | Flip a domino so its halves swap; or repaint one half to another basic spark for 20 coins; or walk on. |
| The Wishing Well | Gamble | Flip the top domino of your deck; the spark it gives off decides the prize (coins, healing, an upgrade, or a rare offer). |
| The Sleeping Giant | Push your luck | In turn order each player may grab 30 coins or stop. Each grab raises a visible chance that it wakes; if it wakes it deals 10 damage to the party and the grabbing ends. |
| The Spark Shrine | Party vote | Bless one basic spark until the next boss: it adds 1 extra strength, and enemy reactions to it hit harder. |
| The Lost Courier | Party vote | Choose which player takes a rare domino; or take 15 coins each. |
| The Mirror Pond | Gamble | Copy one of your dominoes; the copy gives off a random basic spark. |
| The Twin Forge (rare) | Personal | Weld two dominoes into one that keeps the first's intake and effect and the second's output. |

## Presentation

- **Combat screen:** a table fills the screen. The enemy sits at the top with its hand in front of it; teammates sit at the sides with their open hands; the player's hand runs along the bottom, with playable dominoes raised and lit.
- **The chain is on the table:** dominoes laid end to end, so each one's output half sits against the next one's intake half. A glowing empty slot marks whose turn it is.
- **Icons over text:** each spark has its own colour and its own shape. Details live in a tooltip on the hovered domino.
- **HUD:** turn order, the enemy's deck and what it reacts to, chain strength and lap. The party health bar sits at the top right on every screen.
- **Chain spectacle:** one "heat" value from strength and lap drives all effects, which must get bigger and brighter as the chain grows. Proposed ladder: links 1-3 clack and a rising tick; 4-6 spark trails and glowing dominoes; lap 2 a light sweep and a dimmed room; 7-10 screen shake and stacking damage numbers; lap 3+ slow motion and lightning between dominoes; on the chain's end the dominoes topple back along the line, tallying the total. Include reduce-motion and playback-speed options from the start.
- **Other screens designed as wireframes:** victory and domino choice; map with party votes; rest site; upgrade (three tappable parts with a before-and-after preview); Trader; deck viewer (any player's deck, grouped by intake spark); event (illustration left, story and choices right); a push-your-luck event variant with a wake-chance meter.

## Simulation findings

`chain_sim.py` is a small Monte Carlo model of the chain rules. Treat it as a reference for rule order, not as production code.

- With a draw of five, chains ran a typical 13 links for three players and 17 for four, and almost never broke. Hand size, not matching, set the length. This is why the draw is now three.
- With a draw of three, typical chains are about 7 and 9 links, and over half of turns offer only one playable domino. Whether that feels acceptable is the first thing to playtest.
- A basic enemy whose dominoes gave off Rot ended 95-99% of rounds after one or two links.
- Strength multiplied by lap gives very large numbers (over 1,000 damage in a four-player round under the draw-five rules). Health and damage values need setting with that in mind.

## Suggested build order

This order is a suggestion from the design session, not a decision.

1. **Rules engine, headless.** Deterministic combat from a seed, with unit tests for every rule in "Combat rules". Port the simulation onto it so balance runs use the real rules.
2. **Combat on one machine.** The combat screen with hot-seat play for three players against the Ogre.
3. **Online co-op.** Host plus two clients running the same fight. Only choices and a seed need to cross the wire. Save state between rounds so a dropped player can rejoin.
4. **The run.** Map, rewards, rest site, upgrades, Trader, events, one act and one boss.
5. **Progression and polish.** Experience bar, unlocks, chain spectacle.

The first playtest question is whether building a chain together is fun for an evening with placeholder art.

## Open questions

- Does open hands plus a fixed order let one player call every play? The hidden enemy hand is the current answer.
- Is the share of forced turns under a draw of three acceptable?
- How many dominoes does each enemy tier draw per round?
- Does the Trader sell upgrades?
- Run length, stops per act, prices, health and damage numbers.
- Has a co-op chain deckbuilder like this already been made? No prior-art search has been done.

## Decided against

Do not reintroduce these without asking.

- An auto-battler version with priority lists, a rehearsal phase and lantern oil.
- Finishers and a cash-out pot; residue or debuffs left on enemies; a Cloak effect; plain splitters.
- An End Chain button or any way to decline a playable domino.
- A separate enemy attack or intent outside its dominoes.
- Chain-resetting enemy effects (Shatter) and hidden-hands boss passives (The Mute).
- Feat-based unlocks; shared coins; party-wide passives (possible later).
- Poker themes, real-time play, mechanics-heavy boss choreography.
- Events cut: Pass It On, The Practice Yard.

## Parked for later

Banked sparks that reignite a broken chain; turn-order tricks (reverse, skip); hand tricks (drawing or passing mid-chain); planting dominoes in the enemy's hand; a fluke meter and blooper replay; classes; several enemies per fight; a charm that lets one player keep the seat before the enemy.
