# Decisions

Confirmed rulings. These override the build brief where they differ. Newest last.

**Terminology:** "single player" means one person controlling all 3-4 party seats on one screen. The brief and older issues called this "hot-seat". Online play is the multiplayer mode.

**Terminology:** the "opener" is the domino the lead plays to start each round's chain. The brief called it "the fuse".

## 2026-11-19

### Platform and scope
- The web MVP comes first, in TypeScript, deployed to GitHub Pages. A Godot port comes later.
- Milestone 1 (headless rules engine) includes the core chain rules, the starter deck, enemies of every tier (basic, elite, boss), the elite and boss specials, and all augments.
- All numbers live in data files. Balance comes later.
- Tests stay lean (see CLAUDE.md).

### Chain rules
- **Strength:** the first answer plays at strength 1, and every answer adds 1. Enemy reactions count as answers and raise strength too (this changes the brief's assumption).
- **Effect value:** base × strength × lap for player dominoes. Enemy reactions are scaled by strength only.
- **Lap:** starts at 1 and goes up by 1 each time the turn comes back to the lead's seat.
- **First lead:** player 1 (the host). The lead rotation carries over between battles: the next battle starts with whoever would have led next.
- **Opening hand:** none. Round 1 starts with the normal draw of 3.
- **Drawing:** everyone draws at the start of the round. Players stop at the hand limit of 10, and any remaining draws are lost. An empty deck is reshuffled from its discard pile.
- **Two-spark outputs:** the next seat may answer either spark, not both.

- **The opener** (called "the fuse" in the brief): the lead plays any domino. It doesn't add strength, so the first answer is at strength 1. Its effect never triggers; Lookout used as the opener reveals nothing. It goes to the owner's discard pile. It counts in the chain's history.
- **Strength:** every answer, player or enemy, adds 1 and resolves at the new strength.
- **Mimic and Reflect after the opener:** they trigger the opener's effect for real, at the strength of the Mimic or Reflect being played.
- **"Any spark" intake:** it can be set off by Rot. That's the players' answer to Rot; there are no dedicated Rot counters.
- **Block:** soaks damage first and the rest hits health. A domino can have an "ignores block" flag.
- **Enemy reactions and lap:** for now, enemy reactions ignore lap. This is a data setting so balance runs can test both.
- **Player can't answer:** the chain ends and so does the round, even if players still hold dominoes. The next round starts with the draw, then the next lead's opener. The enemy never plays an opener.
- **Lead with an empty hand:** the lead is skipped and the next player in seat order plays the opener instead. That player counts as that round's lead: lap goes up when the spark returns to their seat, and the next round's lead is the player after them. If no player holds a domino, the round goes straight to round end.
- **Rot:** the engine supports it, but content uses it sparingly or not at all.

### Enemy
- **Draws per round:** basic 3, elite 4, boss 5. Set per enemy in data.
- **Hand limit:** set per enemy in data. Defaults: basic 5, elite 6, boss 7. Every enemy discards its oldest domino to make room for each draw. Discards go to the enemy's discard pile.
- **Reshuffle:** same as players. An empty deck is reshuffled from the discard pile when it needs to draw.
- **Several matching dominoes:** the enemy plays the leftmost one that answers the current spark, or either spark when there are two.
- **Leftover dominoes at round end:** they go off at strength 1, left to right, then block resets. Each one that goes off is revealed: it shows face up and stays revealed in players' views (like a Lookout reveal) until it leaves the hand.
- **Ogre outputs:** the same as `chain_sim.py`.
- **Stomp:** hits the whole party for now. Tier mechanics come later.
- **Block and healing:** enemy block lasts until the round ends, like party block. Healing stops at maximum health, for both sides.

### Lookout
- It reveals the enemy's hidden dominoes left to right; the player doesn't choose.
- Dominoes revealed = strength ÷ 2, rounded up (1, 1, 2, 2, 3…). Lap is ignored.
- It does nothing if every domino in the enemy's hand is already revealed.
- A revealed domino stays revealed until it leaves the hand.

### Win and loss
- The party wins when enemy health reaches 0 and loses when party health reaches 0. Both are checked straight away, even mid-chain.
- There's no round limit. An anti-stall rule may be added after playtesting.

### Augments
- **Amplify +N:** adds N strength for the rest of the chain, on top of its normal +1 as an answer. N is flat and doesn't scale. Amplify has no other effect. Enemy reactions benefit from the higher strength, but enemies don't carry Amplify dominoes.
- **Echo:** the next domino played, by anyone including an enemy reaction, triggers its whole effect twice. Both triggers resolve at the same strength and lap, and the second doesn't add strength. Echoes compound: each trigger of an Echo adds one extra trigger to the next domino (Echo → 2 triggers, Echo + Echo → 3, three Echoes → 4). If the chain ends first, Echo is wasted. Echo has no other effect. Echo carries past an enemy that doesn't react, to the next domino actually played.

- **Mimic:** repeats the effect of the last domino played in this chain, at the Mimic's own strength and lap. Enemy passes don't count. It copies the opener's effect even though the opener's own effect never triggered. It copies enemy effects toward the enemy: damage hits the enemy, and healing or block goes to the party. Mimic never hurts the party. It copies augments too (Amplify, Echo, Lookout). Mimic after Mimic repeats the original effect. Echo on Mimic makes the copied effect happen twice.
- **Trigger cap:** at most 100 triggers per domino (data setting).
- **Streak and Momentum:** dropped for now. More properties may be defined later.
- **Spark history:** the spark each domino was answered with, in order, starting with the opener's output. For a two-output domino, only the spark its successor actually answered counts. An enemy pass adds nothing; an enemy reaction's output counts like any other. Used by Spectrum and the Auditor.
- **Spectrum:** a property any effect can have. The domino resolves at (chain strength + number of different spark types in the history so far, up to and including the spark that set it off), for itself only, then multiplied by lap as usual. The chain's strength still goes up by the usual 1. Example: at strength 5 with 3 different sparks so far, a Spectrum Jab (base 3) on lap 1 resolves at strength 8 and deals 24.

### Elite and boss specials
- **Pilfer:** dropped for now.
- **Reflect (elite):** Mimic in reverse. It repeats the last domino played in this chain (enemy passes don't count; after the opener it repeats the opener's effect), at its own strength without lap, like any enemy reaction. The effect is turned against the party: damage hits the party, and healing or block goes to the enemy. If the previous domino was the enemy's, it repeats unchanged. It copies augments: Amplify adds the bonus again, Echo sets up an Echo, Lookout does nothing, and after a Mimic it repeats what the Mimic copied. Echo on Reflect makes the reflected effect happen twice. At round end it repeats the last domino played in the round's chain at strength 1, or does nothing if none was played. It has no other effect.
- **The Auditor (boss passive):** when a player domino is answered with the same spark as the previous entry in the spark history, the party takes damage after that domino resolves. Enemy dominoes and enemy passes don't trigger it, but a pass doesn't break a repeat either: a player answering with the same spark as the previous entry still triggers it when an enemy pass came in between. Default damage is the current strength (data setting). Block absorbs it. Strength is never reduced. Likely to be revisited.
- **The Glutton (boss passive):** heals a flat amount (data setting) the moment the spark returns to the lead's seat and lap goes up, even if the lead then can't answer. Capped at maximum health.

### Hidden information
- The engine produces each player's own view of the game: all player hands visible, the enemy's hand hidden apart from revealed dominoes.
- Safe sparks are not tracked or shown.

### Example dominoes
- The brief's example dominoes beyond the starter deck are illustrations only, not confirmed content. Placeholder content will be proposed in issues.

### UI notes for later milestones
- Effects that ignore lap could carry a symbol on the domino.
- Each spark type has its own colour (and shape), so Spectrum counts are easy to read.
- Every trigger effect (Echo, Mimic, Reflect) gets a cool animation.
- A big combo meter during combat shows strength × lap and grows bigger and redder as the chain grows.

### Still open
- Nothing blocking milestone 1. Balance numbers are placeholders.

## 2026-11-19: Milestone 2 (combat on one machine)

- **Tech:** Phaser plus Vite. Screen code only draws engine state and submits choices; no rules live in it. Only the engine and data port to Godot; screens get rebuilt there.
- **Art:** drawn by code for now (two-halved tiles, each spark with its own colour and shape, effect icon plus number). Sprites later.
- **Hand layout:** the active hand is large, front and centre; teammates' hands are smaller at the sides; whoever's turn it is gets a highlight. In single player the front hand follows whoever's turn it is. Online, it will be your own hand.
- **Animations:** basic only in M2 (domino into chain, effect triggers, floating numbers, health bars, combo meter). The full heat ladder comes in milestone 5.
- **Screens:** a placeholder start screen (3 or 4 players, pick any enemy) and end screen (victory or defeat, play again). Both get replaced in milestone 4.
- **Pacing:** enemy turns, passes and round-end leftovers play out automatically with short delays, scaled by a playback-speed setting. Player turns wait for a click.
- **Platform:** desktop browser, mouse, 16:9 scaled to fit. No touch, no keyboard play, no accessibility options for now (reduce-motion included).
- **Audio:** later.
- **Debug panel:** yes.
- **Tooltips:** yes. Hovering a domino shows name, intake, effect with its current value, and output.

## 2026-11-19: Milestone 3 (online co-op)

- **Connection:** peer-to-peer in the browser (WebRTC via PeerJS and its free public broker). The host's browser is the server. A hosted relay is added only if friends can't connect. Replaced by Steam in the Godot port.
- **Authority:** the host runs the engine. Clients send only choices; the host sends each player their own view (`getView`) and events (`getEventsView`).
- **Joining:** the host creates a room with a short code and a shareable link. Friends open it, type a name and join. No accounts.
- **Seats:** join order, and the host can reorder them in the lobby. The host picks the enemy and can start with 3 or 4 players (fewer only through the debug panel).
- **Single player:** kept as a start-screen option.
- **Dropped player:** they rejoin by reopening the link, and their browser remembers their seat. The game pauses on their turn with "Waiting for [name]". After a delay, the host can take that seat's turns until they return.
- **Host drops:** the host's browser saves the room after every step. Everyone uses the same link (`?room=CODE`). A browser that has a saved hosted room with that code resumes as host; any other browser joins as a player. Resuming works only in the same browser on the same device. No host migration.
- **No turn timer. No chat or pings yet.**
- **Version check:** a client on a different build is refused with a "refresh the page" message.
- **Debug panel online:** host only.
- **Tests:** only where they matter. For M3, one in-memory host-and-clients test.

## 2026-11-19: Tooling

- **Sim chain length:** count every answer, player and enemy, and not the opener. That's the number of times strength went up from answers. Report player answers separately as well.
- **Content:** stays in JSON (portable to Godot), checked by a hand-written validator when loaded (#37).
- **Headless engine:** enforced by a DOM-free engine tsconfig and a CI check (#38).

## 2026-11-19: Milestone 4 (the run)

- **Run rules:** in the headless engine, deterministic from a seed and host-authoritative, like combat.
- **Map:** one act of 10 floors plus the boss, generated from the seed, with 3-4 branching paths.
  - Floors 1-3 are always normal fights. Elites appear only from floor 5.
  - Rest sites: always on floors 6 and 10 (floor 10 is right before the boss). Random rest sites are rare, can appear from floor 4 but never on floor 9, and no path has more than 3 rest sites in total.
  - Traders: at most 2 on any path, and at least 1 per act.
  - Events: none until milestone 5 (their share is 0 in data).
  - The mix of other stops is set in data.
- **Acts:** M4 builds one act. The run will eventually have 3 acts, and winning means beating all 3 bosses, so the run structure takes the act list from data.
- **Route votes:** the party votes at each fork; ties are broken at random (seeded). Online, votes are simultaneous and visible live; in single player they're taken in turn. A rolling animation for ties can come later.
- **Seating:** the enemy's seat stays fixed (last). Players rotate one seat per battle. The lead order still carries over between battles.
- **Health:** party health carries over between battles. Reaching 0 loses the run; beating the final boss wins it.
- **Saving:** the host's saved room covers the whole run.
- **Rewards:** after every battle, each player gets their own offer of 3 dominoes, picks one or skips, and everyone picks at the same time. Rarity: common, uncommon, rare. Elites give better odds; the boss always offers rares. Offers come from everything until unlocks exist.
- **Generated dominoes:** dominoes outside the starter deck are generated at runtime from pools, not hand-authored. A domino's left side (intake) and right side (effect + output) are each drawn from the pool for its rarity. Generation uses the run's seeded RNG. May be revisited.
  - Common: intake is one basic spark. Right side is damage or block, giving off one basic spark.
  - Uncommon: intake is one basic spark. Right side is a stronger damage or block, Amplify, Echo or Lookout. Any uncommon right side may give off one or two basic sparks.
  - Rare: intake is one spark (basic, Storm or Void) or "any". Right side adds Mimic and Spectrum, and outputs may include Storm or Void.
  - No generated domino has a dual intake. Dual intakes come only from upgrades.
  - No generated domino heals. Party healing comes from rest sites, with one exception: Mimic copying an enemy heal still heals the party.
  - Spectrum and "ignores block" can be rolled as traits at the uncommon and rare tiers.
  - Names are generated from effect and spark (for example "Tide Strike").
  - Base values per effect and rarity live in data. The starter deck stays as written in the brief.
- **Enemies:** hand-authored, not generated. For M4: 4 normal enemies, 2 elites, and the act boss (chosen at random from the Auditor and the Glutton, and shown on the map from the start).
- **Enemy content:** the 3 extra normal enemies and the extra elite for M4 are placeholder content added with the run state machine (#46).
- **Charms:** not in M4.
- **Coins:** personal. Every battle pays some (normal < elite < boss), and players start with some. All amounts in data.
- **Rest sites:** each player chooses rest or upgrade. Each resting player heals the shared party health by a data-set amount, and those heals add up.
- **Upgrades:** each side of a domino can be upgraded once, so at most 2 upgrades per domino.
  - Left side: a single-spark intake becomes dual. The player picks the second spark from the spark pool for that domino's rarity, excluding the original spark.
  - Right side: the effect is upgraded (stronger). It never adds an output spark. Numbered effects get +50%, rounded up. Amplify +1. Echo +1 extra trigger. Lookout +1 domino revealed. Mimic copies at +1 strength. All in data.
  - A domino whose intake is already "any" can't take a left-side upgrade.
  - Upgrades come only from rest sites.
- **Trader:** each player has their own stock of 5 generated dominoes, priced by rarity, and can pay to remove a domino. The removal fee starts low and rises by a set step each time. All prices in data. No gifting to teammates, and no selling upgrades. Charms come to the Trader later.
- **Events:** moved to the next milestone.
- **Screens:** map with live votes, victory and domino choice, rest site, upgrade (before-and-after preview), Trader, deck viewer (any player's deck, grouped by intake spark). Party health at the top right on every screen. Event screens come next milestone.
- **Single player:** keeps working. One person plays the whole run by controlling 3 or 4 seats.

### UI notes for later milestones
- A rolling animation for tied route votes.
