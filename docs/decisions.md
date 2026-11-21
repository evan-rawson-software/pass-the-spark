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
- **Seats:** join order, and the host can reorder them in the lobby. The host can start with 3 or 4 players (fewer only through the debug panel). Start begins a run, and the map decides each enemy (#49).
- **Single player:** kept as a start-screen option.
- **Dropped player:** they rejoin by reopening the link, and their browser remembers their seat. The game pauses on their turn with "Waiting for [name]". After a delay, the host can take that seat's turns until they return.
- **Host drops:** the host's browser saves the room after every step. Everyone uses the same link (`?room=CODE`). A browser that has a saved hosted room with that code resumes as host; any other browser joins as a player. Resuming works only in the same browser on the same device. No host migration. There is no separate host link (`&host=1`); the saved room alone decides who resumes as host (#35).
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

## 2026-11-19: Review of milestones 3 and 4

Choices the coders made where the spec was silent, now confirmed:
- **Play-for delay:** 60 seconds, counted from when the game starts waiting on the away player's turn, not from when they dropped. If they drop on their own turn, it starts at once. This is not a turn timer: connected players never have one.
- **Host lost:** clients retry for 2 minutes, then show "Host disconnected" with a way back to the start screen.
- **Host reloads in the lobby:** restored seats show "(away)" until their players return. The host can kick them, and Start is refused while anyone is away.
- **Client auto-rejoin:** only when the browser has both a seat token and a saved name for that room. Otherwise it shows the join form.
- **Saved room from another build:** ignored. That browser joins as a player.
- **Small ones:** the final floor on victory is 11. Reflect has no upgrade. An upgraded Mimic's +1 strength also applies to copied Lookout reveals. Seat cap 4. Names capped at 24 characters.

Follow-ups:
- **Enemy deck sizes:** normal 6, elite 8, boss 10, so bosses no longer play almost their whole deck each round. The extra dominoes may repeat existing ones. Content only.
- **Lead in a round with no chain** (no player holds a domino): the scheduled lead stays the lead for that round, and rotation moves on as normal. `roundStart.lead` reporting the scheduled lead is correct.
- **Balance:** a separate milestone later. Random-play win rates against bosses are not a target until then.
- **Online edge cases:** a client reconnecting to a host on a different build gets the "refresh the page" message; a corrupt saved room is dropped with a notice and that browser joins as a player; a page restored from the back/forward cache reloads. A host that reloads on a new build still ignores its old save and does not reopen the room, so its players see "Host disconnected" after 2 minutes; the "refresh" message only comes from a live host on a different build (#83).
- **Hand testing:** done by people at playtests, using `docs/playtest-checklist.md`.
- **Hosted relay:** parked until a playtester can't connect. The likely fix is a TURN server, which is a cost and credentials decision for the designer.
- **Online behaviour in issues:** every issue with a player choice states what happens online and in single player.

## 2026-11-19: Milestone 5 (events)

### Votes (changes milestone 4)
- **Who votes:** only party-wide choices are voted on: route votes and the party-vote events (Toll Bridge, Spark Shrine, Lost Courier). Every other event choice is personal: each player chooses for themselves, all at the same time.
- **Settling a vote:** a unanimous vote wins. Otherwise the result is drawn at random from the votes cast, weighted by count (3 votes for A and 1 for B gives A a 75% chance), with the run's seeded RNG. This replaces "most votes wins, ties broken at random" for route votes too.
- **Single player:** one person makes each party-wide choice once, with no voting. Personal choices are still made for each seat, since each seat has its own deck and coins.
- **Wording:** the option to decline an event is called "Skip".

### Spark pools (changes milestone 4)
- **Groups:** basic sparks are Ember, Tide and Gale. Advanced sparks are Storm and Void.
- **By rarity:** a full chain needs a mix of rarities.

  | Rarity | Intake | Output |
  | --- | --- | --- |
  | Common | one basic spark | basic |
  | Uncommon | one basic spark | basic or advanced |
  | Rare | one advanced spark, or "any" | basic |

- Uncommons can still give off one or two sparks. Rares keep "any" as an intake.
- Left-side upgrades take the second intake spark from the domino's rarity intake pool, excluding the original, so a rare Storm intake can only add Void.
- Enemy dominoes and the starter deck are hand-authored and unaffected.

### Events: general
- **How often:** about 1 in 5 random map stops (event weight in data). An event stop is always an event; the Toll Bridge's optional fight is the only fight that comes from one.
- **No repeats:** an event doesn't repeat within a run until every event has appeared; then the pool refills. The Twin Forge is about a quarter as likely as the others. Weights in data.
- **Text and art:** 1-2 sentences of placeholder story text per event, stored in data for the designer to rewrite. A code-drawn placeholder illustration.
- **Kinds:** party vote (Toll Bridge, Spark Shrine, Lost Courier); personal (Tinker's Bench, Wishing Well, Mirror Pond, Twin Forge); push your luck, taken in turn (Sleeping Giant). Every personal event offers Skip.
- **Numbers:** every coin amount, chance and damage value lives in data.
- **Adding a spark:** anything keyed by spark (such as the Wishing Well's prizes) must cover every basic and advanced spark. The content validator enforces it.

### The events
- **The Toll Bridge (vote):**
  - Pay 15 coins each. Only offered when every player has 15. Paying just lets the party go on.
  - Hard fight: a random elite from the act. It pays the normal elite coins, and every player's reward offer is all rare.
  - Turn back: free, but the stops on the next floor show as "?" until the party reaches one.
- **The Tinker's Bench (personal), one action:**
  - Flip: free. Only for dominoes with exactly one intake spark and one output spark. The intake and output sparks swap; the effect and its upgrades stay.
  - Repaint: 20 coins. Change one spark on either half to another spark of the same group (basic to basic, advanced to advanced) that the domino's rarity allows on that half. An "any" intake can't be repainted. A spark already on that half can't be chosen.
- **The Wishing Well (personal):** turn over a random domino from your deck. Its output spark decides the prize; with two outputs, the player picks which one counts.
  - Ember: coins.
  - Tide: remove a domino from your deck for free (the brief's healing prize is replaced: healing comes from rest sites).
  - Gale: a free upgrade, or coins if nothing in the deck can be upgraded.
  - Storm or Void: a rare offer (3 rares, pick one or skip).
- **The Sleeping Giant (push your luck, in turn):**
  - Starts at the lead and goes round in seat order. Each player grabs 30 coins or stops; a player who stops is out. It ends when everyone has stopped or the Giant wakes.
  - The wake chance starts at 10% and rises by 10% after each grab. It is shown before every decision. The wake check happens on the grab: a grab that wakes it gets no coins.
  - Waking deals 10 damage to the party and ends the grabbing. It can end the run.
- **The Spark Shrine (vote):** bless Ember, Tide or Gale, or skip. Advanced sparks can't be blessed.
  - Every answer made with the blessed spark adds 2 strength instead of 1, player and enemy answers alike.
  - The blessing lasts through the act's boss fight, then ends. A new blessing replaces an old one.
- **The Lost Courier (vote):** one generated rare domino is shown to everyone. The vote options are each player's name (that player takes it; you can vote for yourself) or 15 coins each.
- **The Mirror Pond (personal):** add an exact copy of one of your dominoes to your deck, upgrades and output included.
- **The Twin Forge (rare, personal):**
  - Pick two dominoes: the first gives its intake and effect (with their upgrades and traits), the second its output. Both are removed and the welded domino is added.
  - Welding may break the rarity spark pools; that's allowed. The weld's rarity is the higher of the two, and its name is generated.
  - Needs a deck of at least 6, so the deck stays at the minimum of 5.

### Coder choices during milestone 5 (confirmed)
- **Sleeping Giant:** turn order starts at the lead and follows the party's player order, not the battle's rotated seats.
- **Tinker's Bench:** a domino with an "any" intake can't be flipped. A flip may put a spark on a half that the rarity pools wouldn't allow (like a weld). Repaint options for starter dominoes use the common pool.
- **Twin Forge:** the weld's name is built from the two dominoes, with no randomness. The weld keeps the first domino's upgrades only. A weld of two starters has no rarity.
- **Wishing Well:** the free Tide removal doesn't raise the Trader's removal fee. Skip at any stage, even after turning a domino over, means no prize. Each player's turned domino and prize are visible to everyone.
- **Toll Bridge:** "all rare" rewards after the hard fight are a fixed rule, not a data value. Turning back on the last floor hides nothing (the boss is always shown). A next floor with only one stop is entered straight away, so "?" never shows.
- **Spark Shrine:** the blessing stays set if the party loses a non-boss fight; the run is over, so it has no effect.
- **Event data:** the validator requires every event's numbers, including a Spark Shrine strength of at least 1.

## 2026-11-19: Milestone order

After milestone 5 (events): 6 charms plus acts 2 and 3; 7 balance pass and playtest fixes; 8 progression and polish (experience bar, unlocks, chain spectacle, audio, art); 9 Godot port with Steam. Balance comes before polish so playtests can answer "is building a chain together fun?" early.

## 2026-11-19: Milestone 6 (charms, acts 2 and 3)

### Content rule
- **No combat effect ever takes coins away** (no enemy, boss or passive steals or taxes gold).

### Charms
- **What:** a personal passive that lasts the whole run. Hand-authored in data (`data/charms.json`), not generated. A charm is set off by its owner's actions, but its effect may help the party (for example party block).
- **Pools:** a normal pool (elite offers and the Trader) and a rare pool (boss offers only).
- **Getting them:**
  - After an elite fight, each player is offered 1 random normal charm: take it or skip.
  - After a boss fight, each player picks 1 of 3 rare charms, or skips. Only the act 1 and act 2 bosses offer charms; beating act 3's boss ends the run.
  - The Trader stocks 3 normal charms per player, priced in data.
  - These come on top of the usual domino offer.
- **Limits:** no cap on how many a player holds. A player never holds two of the same charm (offers and stock skip charms they own); two players can hold the same one. No selling, gifting or upgrading.
- **Display:** a row of charm icons by each player's name (party display and deck viewer), each with its own hover tooltip. Everyone sees everyone's charms.
- **Normal charms** (all numbers in data, to tune later):
  1. Ember Lens: your effects set off by Ember are worth +2.
  2. Tide Lens: the same for Tide.
  3. Gale Lens: the same for Gale.
  4. Deep Pockets: your hand limit is +2.
  5. Early Riser: you draw 1 extra domino at the start of each round.
  6. Spark Starter: when you play the opener, its effect triggers at strength 1.
  7. Spyglass: your Lookouts reveal 1 extra domino.
  8. Bulwark: your block effects are worth +2.
  9. Resonance: your Echoes add 1 extra trigger.
  10. Lap Runner: when your answer completes a lap, the party gains 3 block.
  11. Coin Purse: you get +5 coins after every battle.
  12. Haggler: your Trader prices are 20% lower.
- **Rare charms:**
  1. Prism: your Spectrum effects count 1 extra distinct spark.
  2. Overcharge: your effects count the lap as 1 higher.
  3. First Echo: the first domino you play each round triggers twice.
  4. Keystone: your answers add 2 strength instead of 1.
  5. Hall of Mirrors: your Mimics copy at +2 strength.
  6. Lightning Rod: your dominoes set off by Storm or Void trigger twice.

### Acts
- **Structure:** 3 acts, each 10 floors plus a boss, with the same map rules to start. Each act has its own map rules, enemy pools, reward and Trader rarity odds and coin payouts in data. Later acts have better odds and pay more; numbers are tuned in the balance milestone.
- **Between acts:** the party heals at the start of each new act by a percentage of missing health (data, starting at 100%). Coins, decks, charms, seat rotation, lead order and the events-seen list carry over. The Spark Shrine blessing still ends with each act's boss.
- **Enemies:** acts 2 and 3 each get 3 new normal enemies and 2 new elites. They are placeholder content, tougher than act 1's, using only existing effects. Decks: normal 6, elite 8, boss 10.
- **Bosses:** one of two per act, picked at random and shown from the start of the act.
  - Act 1: the Auditor or the Glutton.
  - Act 2: the Hoarder or the Smolder.
  - Act 3: the Long Night or the Warden of Locks.
- **The Hoarder:** gains block equal to the current strength whenever the lap goes up.
- **The Smolder:** its leftovers at round end go off at the chain's final strength instead of strength 1, but never less than 1.
- **The Long Night:** its reactions and leftovers scale with lap, as if `enemyReactionsScaleWithLap` were on for this boss.
- **The Warden of Locks:** each round one basic spark is locked, picked at random (seeded) and shown at round start.
  - Player dominoes can't be set off by the locked spark; an "any" intake can't answer it either.
  - The enemy can still react to it, and dominoes can still give it off. If it's the only spark passed to a player, they can't answer and the chain ends. With a two-spark output, they can answer the other spark.
- **Screens:** the map shows "Act N of 3"; a short act-transition screen shows the heal and the next boss with its passive; the run-end screen shows how far the party got.

### Coder choices during milestone 6 (confirmed)
- `PlayPreview.lap` is the chain's lap and leaves out Overcharge's +1 (preview values include it).
- Lap Runner's block is not a block effect, so Bulwark and other block bonuses don't apply. It fires only when the lap goes up after its holder's answer: not for the opener, not after an enemy reaction, and not once the battle is over.
- When the lap goes up, passives run in this order: Glutton, Hoarder, Lap Runner.
- Spark Starter's opener leaves chain strength at 0 unless its effect raises it, and gets no Lens bonus. A Mimic gets the Lens bonus of the spark that set it off.
- First Echo is used up by the holder's first effect that triggers each round.
- Lightning Rod's sparks (Storm, Void) are listed in `charms.json`.
- The act-start heal is one global `actStartHealPercent`, rounded up.
- The act transition is an engine phase (`act`) where each player presses Continue.
- The Warden of Locks' lock applies only to players' answers. Enemy reactions, the opener and Mimic ignore it.
- The Toll Bridge's hard fight counts as an elite fight, so it also offers a normal charm.
- Charm rolls changed the runs that old seeds produce. That's fine.

## 2026-11-19: Milestone 7 (balance pass and playtest fixes)

### Simulation
- **Bot player:** the sims get a simple co-op bot alongside random play. It sees what a real player sees (its own hand, teammates' open hands, the enemy's revealed dominoes). Among legal moves it prefers one the next seat can answer, then the highest value. Sims report random and bot results side by side.
- **Whole-run sim:** the bot plays full runs. It takes the rarest domino offered, always takes charms, rests below half health and upgrades otherwise, buys at random at the Trader, and picks event choices at random. It reports run win rate, how far runs get and where they die.
- **Charm strength:** the run sim reports win rate by charm held.

### Screens
- One issue covers the unchecked M6 screens: Playwright screenshots at 1920×1080 with 4 players and many charms, fixing any overlaps. Boss passive display names move into data. The debug panel's "give a charm" lasts for the rest of the run when used in a run.

### Balance
- **Targets** (bot playing full runs, 3 and 4 players): about 70% clear act 1, about 45% clear act 2, about 20-25% win the run. Real players should do better than the bot.
- **Who tunes:** the coders tune data values only (enemy health and damage, party health, coins, prices, charm and event numbers) to reach the targets, and post before-and-after tables. Any rule change comes back to the designer.
- **Enemy lap scaling:** `enemyReactionsScaleWithLap` stays off. Only the Long Night scales with lap.
- **Warden of Locks:** re-measure with the bot. If players still average under 2 answers per chain against it, bring options to soften it to the designer; don't change the rule in tuning.
- **Party size (#126):** 4-player parties came out 25-35 points stronger than 3-player ones, and no single set of data numbers fit both. Enemy health now scales by party size: a multiplier per party size (1-4 players) in data, applied to every enemy's starting health, rounded up. Tuning then aims at the targets for 3 and 4 players separately.
- **Final tuning accepted (#126):** with 500 bot runs per party size, 3 players reach 68.0% / 44.6% / 22.6% (clear act 1 / clear act 2 / win) and 4 players 72.0% / 52.4% / 23.4%. The 4-player act 2 rate (52.4% against about 45%) is accepted as is.
- **Playtest:** the designer playtests again once M7 is done.

### Playtest feedback (first playtest)
- **Single player setup:** no name inputs; seats are named Player 1-4. The seed box is filled with a random seed when the screen opens (still editable).
- **Map screen:** drop "The party's choice". "Act N of 3" replaces "Route: floor N" as the heading.
- **Single player votes:** no vote display. The chosen stop opens straight away. The same goes for single player event votes.
- **First-round draw:** players draw 5 at the start of round 1 of each battle (`playerFirstDraw` in data), then 3 per round as before. This replaces the M1 ruling that round 1 draws like any other round. Enemies draw as usual. Early Riser's +1 applies to the first draw too.
- **Combat top bar:** drop the "Spark" readout next to the turn order; the current spark already shows as an icon in the middle of the table.
- **Draw animation:** drawing at round start is animated: dominoes slide from each seat's deck into its hand, staggered, everyone at once. Enemy draws arrive face down, its oldest-domino discard and any reshuffle are shown briefly. Shortened by playback speed.
- **Combat side clutter:** the bottom-right list of player names (the combat charm list, which reads like a second turn order) goes; each player's charm icons sit by their own name plate instead. The bottom-left last-action text goes too.
- **Enemy tier:** shown as an icon beside the enemy's name (the same icons as the map's fight, elite and boss stops), with a hover tooltip, instead of the BASIC / ELITE / BOSS text under the name.
- **Map boss passive:** the map shows the boss's name with its passive icon(s); the passive text moves into a hover tooltip.
- **Coins:** every coin amount on screen shows a gold coin icon and the number instead of the word "coins". Story text in events stays prose.
- **Menu:** a menu button at the top right replaces the "Sound" button. It holds sound settings, playback speed and leaving the game, on every screen.
- **Decks:** no Decks button. Clicking any player's name opens the deck viewer on that player. The current player's deck shows face down to the left of their hand; clicking it opens their deck.
- **Effect icons drawn in code:** every effect icon is drawn in code, not generated, in one consistent style: block (blue shield, also in the HUD), damage (red sword), Lookout (eye), heal, Amplify, Echo, Mimic and Reflect. Generated effect files are removed from the art manifest.
- **Map readability:** the map is too cramped on one screen. It gets more height (bigger gaps between floors, bigger stops) and scrolls vertically; headings, party display and side panels stay fixed.
- **Hover highlight:** hovering a playable domino in your hand highlights the dominoes that could answer it in the next seat's hand: teammates' dominoes, and the enemy's revealed ones. Which dominoes count comes from the engine. When the next seat is the enemy and none of its revealed dominoes could react, the matching dominoes of the player after the enemy are highlighted too, more faintly (the spark would pass on to them if the enemy can't react).

## 2026-11-19: Milestone 8 (progression and polish)

### Scope
- The web game gets progression, a spectacle prototype and sound effects, to answer "does it feel good?" before the port. Real art and final screen polish go into the Godot version (M9). Asset files (sounds, images) carry over; screen code doesn't.
- **Art:** the designer generates art locally (Stable Diffusion, with a local Claude Code session), following `docs/art-assets.md`. The web game shows a generated image wherever one exists (listed in `public/art/manifest.json`) and falls back to the code-drawn version otherwise. The same files carry over to Godot.
- **Art process:** the art session only adds files under `public/art/` (and updates the manifest and `docs/art-assets.md`). It works on its own branch and merges through a pull request, never pushing to main directly, and never touches game code.

### Progression
- **Saved per browser:** each player's profile (experience, level, unlocks) lives in their own browser. No accounts. Online, a joining player sends their unlocks to the host. In single player, one profile covers all seats.
- **Experience:** earned by every run, win or lose: points per floor cleared, a bonus per boss beaten and a bonus for winning. All amounts and level thresholds in data.
- **Unlocks:** new players start with damage, block and Amplify in their generated offers. Each level unlocks one more thing in a fixed order set in data, about 8 levels in all, so everything is unlocked after roughly 10-15 runs. Unlockable: Lookout, advanced sparks, Echo, two-spark outputs, ignores block, Spectrum, Mimic, the "any" intake. Charms are not unlocked; all are available from the start.
- **Whose unlocks:** each player's reward offers, Trader stock and Wishing Well rare offer come from their own unlocks. The Lost Courier's shared domino may use anything any party member has unlocked. Unlocks only shape generated dominoes: the starter deck, enemies and existing dominoes are unaffected.
- **Fixed at run start:** each player's unlocks are stored in the run when it starts, so saves and seeds stay deterministic. Experience is handed out at the run end screen to every seat.
- **Screens:** the start screen shows your level and experience bar; the run end screen shows experience gained and any new unlock. A "reset progress" option, and a debug "unlock all".
- **Balance:** M7 tunes with everything unlocked. Early runs with fewer unlocks will be somewhat harder; check at a playtest.

### Spectacle
- **Heat ladder** (the brief's, tiers and thresholds in data): links 1-3 clacks and a rising tick; 4-6 spark trails and glowing dominoes; lap 2 a light sweep and a dimmed room; 7-10 screen shake and stacking damage numbers; lap 3+ slow motion and lightning between dominoes; at chain end the dominoes topple back along the line, tallying the total. The combo meter grows bigger and redder with heat. Every trigger effect gets its own short animation.
- **Also in M8:** a rolling animation for drawn votes, a "doesn't scale with lap" symbol on such effects, and a ping (click and hold a domino to highlight it for the whole party).
- **Pacing:** all spectacle is played back on each player's own screen from events and never delays the host. Higher playback speeds shorten it. No reduce-motion option.

### Sound
- Free CC0 sound effects (for example Kenney's packs): clacks, ticks, hits, lightning, UI clicks. No music yet. Master and effects volume sliders and a mute, saved per browser. Licences recorded in the repo.

## 2026-11-20: Combat redesign coming; Godot port on hold

- The designer is redesigning the core combat rules: the chain becomes a branching tree that goes off all at once in a cascade when it ends. A design doc and a new milestone will follow.
- The Godot port (M9) is on hold until then.
- No further combat-screen layout work; the combat board will be rebuilt.

## 2026-11-20: Combat redesign (branching cascade)

- **The combat rules are replaced** by `docs/design-branching-cascade.md` (approved). Read it first. It supersedes the earlier combat rulings in this file and in the brief wherever they conflict. That includes: chain rules (strength per answer, laps, the opener's limits), the enemy's dominoes, hands, reactions and leftovers, Lookout, Mimic, Reflect, the hidden enemy hand, and the boss passives as written for M4 and M6.
- **Deliberate reversals** of the brief's "decided against" list: finishers (caps), an option to end the chain (setting it off), and enemy intents outside dominoes.
- **Still in force:** the run, map, events, rewards, coins, Trader, rest sites, progression, online play, single player, the screens' general rules, and everything else not about how a battle plays. Where the design doc changes one of those (charms, events, upgrades, generation, unlocks), the doc wins.
- **Order of work:** engine and sim prototype first, with no screens; then a playable board screen and a playtest; then spectacle, content and re-tuning; then the Godot port.
- **Balance:** #126 tuned the old rules before the hold landed. Re-tuning comes after the redesign. The Godot port waits.
- **Cascade feel (M10):** after M9, a milestone of more combat effects and animations, so a chain going off feels amazing. The Godot port moves to M11.
- **Branch:** M9 work goes to an integration branch, `cascade`, with each issue's PR targeting it. `main` (and GitHub Pages) keeps the current game playable until `cascade` is playable end to end, then it merges.
- **Red builds on `cascade` (#180):** `cascade` may fail typecheck and tests while the rules are being replaced, until #185 and #186 land. Each M9 PR keeps its own files and the tests it adds or rewrites passing, adds no new failures outside areas still waiting on a later issue, and lists the remaining known failures in its description. The old enemy dominoes move unchanged to a temporary `data/enemy-dominoes.json` (with a small legacy check) that #182 deletes. `cascade` must be fully green before it merges into `main`.
- **Overcharge (#184):** your Double amplifiers multiply by 1 more (×2 becomes ×3, an upgraded ×2.5 becomes ×3.5), so the Double upgrade still matters. Charm bonuses (Lenses, Bulwark) are part of a cap's value, so every extra trigger repeats them.
- **Spark Shrine (#185):** every domino attached to the blessed spark adds +1 charge after its own change, caps included (a cap there goes off at charge + 1). The opener is never blessed, since its intake is ignored.
- **#183 gate passed (2026-11-21):** the designer reviewed the sim report. Screen work (#186) starts now. Placeholder tuning (starter caps, enemy health and intents, the Hoarder's block) runs in parallel as data-only work, so the playtest is winnable.
- **First M9 playtest (2026-11-21):** the designer played the new combat board on `cascade` (single player, before the #203 tuning) and passed it: "looks good". #187 (cascade spectacle) can start; #203 (placeholder tuning) still runs.

## 2026-11-20: Milestone 10 (cascade feel)
Rulings F1–F10, all as recommended. M10 builds on the basic spectacle from #187.
- **F1 Scope:** visual and sound only. No new dominoes, rules or numbers. New domino content is a separate step after the playtest.
- **F2 Timing:** starts after the M9 playtest, so it polishes what felt flat in real play. The re-tune can run alongside it.
- **F3 Effects travel to their target:**
  - damage caps fire a bolt or slash that flies to the enemy and hits;
  - block caps send shields to the party's block counter, which grows as each lands;
  - coin caps send coins to their owner's coin count.
- **F4 Enemy reactions:**
  - a flinch on every hit, a stagger on big hits;
  - a health bar that drains with a delayed "ghost" bar;
  - a dramatic death on the killing blow (shatter or dissolve, with a brief freeze-frame);
  - a lunge when it carries out its intent, with the party's side shaking as it takes the hit.
- **F5 Build-up:**
  - a running counter that pumps with each cap;
  - pitch rising with each cascade step;
  - the tree's glow growing;
  - short callout words at heat thresholds (for example "Blaze!", "Inferno!"), with wording and thresholds in data.
- **F6 Camera:** on big boards, zoom out to frame the whole tree, then push in on the biggest cap as it goes off. Small boards keep the camera still.
- **F7 Comfort and pacing:** the menu gets a screen-shake toggle and a reduced-flashing toggle. A click skips the cascade to its result, on your own screen only (never the host's). Playback speed stays.
- **F8 Art:** particles and effects are drawn in code. Optional textures from the art session come through the manifest, with code fallbacks. Tuning values live in data, so the Godot port can match them.
- **F9 Music:** not in M10. Sound effects are in scope.
- **F10 Seat colours:** each player gets a seat colour (in data). Their dominoes glow in it as the charge passes through, so everyone sees their part in a big chain.
- **Branch:** M10 PRs target `main` if `cascade` has merged by then, otherwise `cascade`.

## 2026-11-21: Two-player games
Rulings W1–W7, all as recommended. Built in #205.
- **W1 Where:** in M9, on `cascade`, after the placeholder tuning (#203).
- **W2 Rules:** identical at every party size. Only data scales.
- **W3 What scales:** enemy health (the existing table) and a new enemy-attack percentage by party size (4 values, 100 by default), applied to each hit after growth, rounded up. Party health stays at 90.
- **W4 Target:** 2 players aim for the same win rates as 3 players. Sims report 2, 3 and 4 players. Final numbers come in the post-redesign re-tune.
- **W5 Lobby and single player:** the host can start with 2 to 4 players. Single player offers 2, 3 or 4 seats. This replaces the earlier "3 or 4" rulings (M2 screens, M3 seats, M4 single player).
- **W6 Layout:** at 2 players, the teammate's hand sits on one side and the board gets the extra room.
- **W7 The run:** unchanged. A 1–1 vote is a coin flip through the existing weighted tie-break.

## 2026-11-21: Domino look (D1–D8)
From the research page "Domino Looks" (how other roguelike deckbuilders draw cards). All as recommended. Built in #217 and #218, in M10.
- **D1 Silhouettes:** amplifiers end in an arrow, junctions split into two prongs, caps end in a rounded seal. No grey "missing half".
- **D2 Socket in, outputs out:** the intake is a notch in the left edge, ringed in its spark's colour. Flow reads left to right.
- **D3 Face colour:** bone for amplifiers, steel for junctions, a light tint of the effect's colour for caps.
- **D4 Fixed spots:** a big number in the centre, the owner stripe on top, trait sigils top right, the upgrade star bottom left, the rarity gem bottom right.
- **D5 Live numbers:** hovering or dragging over an end shows the real result (green, or red if lower) with the sum; "If set off now" shows the change.
- **D6 Board:** small tiles joined by fuses in the spark's colour, with a charge badge on each fuse. Open ends are ghost rings. The cascade burns along the fuses.
- **D7 Hand:** fanned and sorted by kind, with hover lift. Teammates' hands are small silhouettes.
- **D8 When:** in M10. #189–#191 were already in review, so this comes after them and keeps their effects working.
- **Next player's highlight (restored):** while you hover or drag a domino, the next player's hand highlights what they could play after it, as in the old game. This replaces the line in #186 that dropped it. The engine answers which dominoes are playable.
- **Art:** dominoes are drawn in code. The face art `tiles/starter`, `common`, `uncommon` and `rare` retires in #217; `tiles/hidden` stays for face-down piles.
- **Playback speed control (#220):** in combat, the four speed buttons become one small button showing the current speed, which opens a list of speeds. The menu setting is unchanged.

## 2026-11-21: Coin caps removed; set-off preview on the health bars
- **Coin caps removed (#221):** players don't gain coins during a battle. Gold comes only from outside combat (battle rewards, events, the Trader). Coin caps leave the generation pools and the unlock order (the other unlocks keep their thresholds). This overrides the coin caps in `docs/design-branching-cascade.md`. A small rules change inside M10, by exception.
- **Set-off preview (#222):** the "If set off now" widget is removed. Instead:
  - **P1:** the enemy's health bar shows the damage as a ghost segment with the number, and its block is used up first;
  - **P2:** a lethal chain shows a skull marker and a glowing Set off button;
  - **P3:** the party's block counter shows the projected gain, and the party health bar shows a ghost of the damage still taken from the intent;
  - **P5:** all of it updates live while a domino is hovered or dragged over an end;
  - **P6:** the numbers come from the engine's preview;
  - **P7:** a new M10 issue.
  - (P4, coins by name plates, was dropped with coin caps.)

## 2026-11-21: Combat layout (L1–L8)
From the research page "Combat Table" (how other deckbuilders lay out combat). All as recommended. Built in #228, then #229, in M10. The screen reads top to bottom as the enemy, the board, then the party.
- **L1 The enemy as one unit:** portrait at the top centre; name, tier and passive chips beside it (full text on hover); the intent as a speech bubble at its head; the health bar right under it.
- **L2 Party bar at the bottom:** party health and block above your hand, the same width as the enemy bar and facing it.
- **L3 Turn-order rail:** every seat in turn order down the left, with seat colour, LEAD/YOU/NEXT tags, charms, counts and their hand as small dominoes. The next player's highlight shows there. It replaces the side hands, the turn-order row and "Round N".
- **L4 Board:** no frame box; the background is dimmed with a vignette.
- **L5 Your hand:** fanned at the bottom centre between your deck and discard piles. The hand frame, name tag and prompt line go.
- **L6 Utilities:** round, playback speed and menu in one small top-right cluster.
- **L7 Actions:** a big Set off button bottom right, with Pass above it and "Your turn" over both.
- **L8 Order:** #218's unbuilt screen work is folded into #229; #218 closes as superseded, and its engine preview stays.

## 2026-11-21: Combat UI direction: Spotlight (U1–U3)
From the research page "Combat UI Directions" (round 2), all as recommended. This replaces the arrangement in "Combat layout (L1–L8)": L4 (no board frame, dimmed background), L5 (fanned hand) and L7 (Set off bottom right) stay. L1, L2, L3 and L6 move into the new arrangement. #228 (PR #230) merges as built; its parts are rearranged by the Spotlight issue.
- **U1 Spotlight:** one column down the left holds, top to bottom, the enemy card (portrait, name, tier, passive chips, health bar), its intent, the set-off tally, party health and block, and a footer (round, playback speed, menu). Seat tabs in turn order run across the top of the rest of the screen, each with that player's hand as small dominoes and the next player's highlight. The board fills the middle; your hand is fanned at the bottom; Pass and Set off sit bottom right.
- **The tally:** two large tiles in the column, damage and block, showing what setting off now would do (from `previewSetOff`), with a line under them such as "Ogre 170 → 158 · party takes 6". They update live while you hover or drag a domino. The previews on the health bars (#222) stay.
- **U2:** #228 and #229 are not rewritten. #230 merges; #229 is built into the Spotlight board area (see its comment); the Spotlight issue rearranges the screen after both.
- **U3 Tally during the cascade:** each cap's effect flies into its tally tile, which counts up with a ping that rises in pitch. When the cascade ends, the damage total flies into the enemy as one big hit and the block total into the party's block. This changes #189's per-cap flights for caps (screens only; the engine is unchanged). Built in M10.

## 2026-11-21: Cascade hype: combo number, slam and big sounds (H1–H9)
From the playable "Cascade Hype Demo" (research: Vampire Survivors' chests, Balatro's flaming score, fighting-game combo counters, Peggle's Extreme Fever). All as recommended. Screens and sound only; no rule or number changes. Built in M10 after #231.
- **H1 Combo number:** during the cascade, one big damage number sits in the middle of the board area, with block beside it in blue and a hit count under it ("7 HITS"). Each damage cap's spark flies into the number, which rolls up and punches bigger; block caps feed the block number. It replaces #191's running counter. The column tally (#231) stays still during the cascade and shows the next preview afterwards.
- **H2 Tiers:** set by the running damage as a share of the enemy's health when the cascade starts (10%, 25%, 50%, 75%; in data). Each tier makes the number bigger and changes its colour (white, yellow, orange, red, purple), with a callout word, a burst, a flash, a background tint and a rising stinger. These callouts replace #191's.
- **H3 Lethal:** once the damage so far would take the enemy's health to 0 (after its block), the number catches fire, with a "LETHAL!" callout and a fire whoosh.
- **H4 The slam:** after the last cap, the number charges up (longer at higher tiers), then flies into the enemy as one hit, with a freeze, flash, boom and shake that scale with the tier. The enemy's health bar drops once, at the slam, and the block total flies to the party's block. This replaces #232, which closes.
- **H5 Fanfare:** after the slam, a chest-style jingle with a shower of sparkles, longer and bigger at higher tiers and biggest on a kill, when the enemy shatters.
- **H6 Bigger board effects:** a burst from each cap that fires, short freezes that grow with the tier, the background glowing in the tier's colour, and shake that grows. All follow the shake and reduced-flashing settings.
- **H7 Sound:** real sound files from Kenney's CC0 packs (Music Jingles for stingers and fanfares, Casino Audio for coin showers, Impact Sounds for booms), layered and listed in `data/sound.json`. The per-cap ping climbs a musical scale instead of a plain pitch rise.
- **H8 Pacing:** caps fire faster as the cascade goes on; the finale adds at most about 2 seconds at the top tier; skipping jumps to the final numbers and a short slam.
- **H9 Issues:** #232 closes as superseded. One issue covers the visuals (H1–H6, H8) and one the sounds (H7); they share cue names, so they can be built side by side.

## 2026-11-21: Cascade sounds are generated clips (amends H7)
The designer compared the Kenney packs with generated clips in the Cascade Sound Picker and chose generated clips for all 17 `combo:*` cues.
- **What they are:** original sounds rendered for this game, with no third-party material.
- **How they ship:** as ordinary `.ogg` files under `public/audio/generated/`. The game plays them like any other clip; there is no live synthesis.
- **What changes:** this replaces H7's "real sound files from Kenney's CC0 packs" and #235's "no synthesized sound", for the `combo:*` cues only. Every other cue keeps its current file.
- **What stays:** the per-cap ping still climbs the pentatonic scale.

## 2026-11-21: Playtest fixes (P1–P8, S1–S3)
From the designer's first playtest of the branching cascade with the new combat screen. All as recommended. Built in M11 (playtest fixes).
- **P1 Starter caps:** Strike (Ember and Tide) goes from 3 to 7 damage, and Smash (Ember and Tide) from 10 to 8. The two were too far apart. Guards stay at 3 block.
- **P2 Fight rewards:** fights and elites offer only uncommon and rare dominoes. The old common share moves to uncommon in every act. Boss rewards stay all rare.
- **P3 Trader:** the trader stops selling commons too; the common share moves to uncommon. Commons stay in the data, but nothing offers them.
- **P4 Stronger reward caps:** damage caps in reward pools beat the starters: uncommon 8–10 (was 4–6), rare 11–14 (was 6–9). Block caps are unchanged.
- **P5 No manual set off:** the "set off" choice is removed. The cascade fires only when every player passes in a row, or when no open ends are left (both triggers already existed). Pass becomes the main button.
- **P6 A pass that fires:** when your pass would complete the round of passes, the button reads "Pass and fire" and carries the lethal glow (#222). The tally's label becomes "If it fires now".
- **P7 Balance check:** after P1–P5, run the battle and run sims and report win rates against the numbers before. The designer decides whether to re-tune enemy health; no tuning in these PRs.
- **P8 Milestones:** a new "M11: Playtest fixes"; the Godot port becomes M12. M9 and M10 close.
- **S1 Sound spike:** the local art session compares ways to make sounds: local AI models (such as Stable Audio Open in ComfyUI), curated free libraries (Sonniss GDC bundles, Freesound CC0), a dedicated sound-effect generator (jsfxr or ChipTone), and a hosted paid AI generator. Candidates for four cues go in a picker for the designer, with a short report.
- **S2 Paid tools:** the hosted paid generator is included in the comparison; buy it only if it clearly wins.
- **S3 Scope:** the spike picks the method only. Replacing the game's sounds is a follow-up issue.

## 2026-11-21: Re-tune after the playtest fixes, and remaking the sounds (T1–T2, R1–R5)
From the sim results on #245 and the sound spike (`docs/sound-spike.md`), where the designer picked jsfxr on all four test cues. All as recommended. Built in M11.
- **T1 Re-tune:** a data-only re-tune to the balance targets from M7: with the bot playing full runs, about 70% clear act 1, about 45% clear act 2 and about 20–25% win, for 3 and 4 players, with 2 players aiming for the same as 3 (W4). The same rules as M7 apply: coders change data values only and post before-and-after tables; any rule change comes back to the designer.
- **T2 Fix the bot first:** the sim bot reads the starter Strike's value from the data instead of a written-in constant, and scores a pass as firing only when `passFires` says it does. Tuning starts after that.
- **R1 Who:** the local art session remakes the sounds, running the picker rounds with the designer.
- **R2 Recipes in the repo:** the build tool and every recipe live in `tools/sound/`, outside the game build, so any sound can be tweaked and re-rendered later. `jsfxr` (public domain) is allowed as a dev dependency, plus the Python libraries the build script needs, listed in a requirements file.
- **R3 Scope:** all the game's sound cues, in one consistent style made with the layered jsfxr recipe. The Kenney files and the earlier generated clips are deleted once nothing uses them, and `public/audio/CREDITS.md` is updated.
- **R4 Two picking rounds:** first combat (every cue except the menu and run ones), then the menu and run cues (`click`, `voteRoll`, `coins`, `buy`, `rest`). Each round puts two candidates per cue in the picker on the `sound-spike` branch; the designer picks; a PR ships the picks.
- **R5 Loudness:** every clip is matched to −14 LUFS (as in the spike), and the volumes in `data/sound.json` are reset so the mix is balanced.
