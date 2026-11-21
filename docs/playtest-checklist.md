# Playtest checklist

Things automated tests don't cover. Run through what you can at a playtest and note anything odd in a GitHub issue (what you did, what you expected, what happened, browser).

## Browsers
- [ ] Host and join in Chrome.
- [ ] Join from Firefox.
- [ ] Join from Safari (Mac).
- [ ] Host from Firefox or Safari at least once.

## Rooms
- [ ] A full 4-player room plays a whole battle.
- [ ] A 3-player room plays a whole battle.
- [ ] Single player with 3 and with 4 seats.

## Networks
- [ ] Players on different home networks (not all on one Wi-Fi).
- [ ] One player on a phone hotspot.
- [ ] A player who can't connect at all: note their network type (work, school, mobile). This decides whether we need a relay.
- [ ] Turn a joiner's Wi-Fi off for 10 seconds mid-battle, then back on. Do they recover?

## Drops and reloads
- [ ] A joiner closes their tab and reopens the link: same seat, same hand.
- [ ] A joiner drops on their own turn: "Waiting for…", then the host can play for them after 60 seconds.
- [ ] The host reloads mid-battle: everyone carries on.
- [ ] The host reloads in the middle of an enemy turn playing out.
- [ ] The host reloads in the lobby: away seats, kick, Start refused while anyone is away.
- [ ] Browser back then forward on a joiner.
- [ ] A player on a different build joins or reconnects to a live host: they see "refresh the page" at once.
- [ ] Overwrite the host's saved room (`pass-the-spark-hosted-CODE`) in local storage with garbage and reload the host link: "Couldn't resume the saved game." shows and the page offers to join.
- [ ] A joiner navigates away and presses Back: the page reloads and rejoins its seat.

## The run
- [ ] Play a run to the boss: votes, rewards, rest, upgrades, Trader, deck viewer.
- [ ] Host reloads on the map, on a reward screen and in the Trader.

## Combat
The board is a tree: the opener is the root, every domino adds branches, and caps end them.
- [ ] The opener goes in the opener slot; after that a domino can only go on an open end whose spark it accepts. Open ends show their spark and the charge arriving there.
- [ ] Hover or pick a domino: legal ends light up and the preview (charge, and for a cap its value and how many times it goes off) matches what happens in the cascade.
- [ ] Pass skips your turn this round. When everyone passes in a row, or every end is capped, the cascade goes off by itself. There is no manual set off: the pass that completes the round reads "Pass and fire".
- [ ] A junction splits the path into two ends (three with Hall of Mirrors); a junction is refused when it would take the board over the open-end limit.
- [ ] "If it fires now" (damage, block, coins) follows the board as you build and matches what the cascade then does.
- [ ] Ends left without a cap fizzle: they dim and sputter, and their charge does nothing.
- [ ] The enemy's intent shows above the board and plays out after the cascade, against the block the party just gained; later intents show under it (two ahead with Spyglass).
- [ ] Block: the party's block from caps protects against the intent that follows and resets at round end; the enemy's block absorbs the next cascade's damage and then resets.
- [ ] Win in the middle of a cascade: it stops the moment the enemy is at 0 health and the battle ends.

### Cascade spectacle
- [ ] Building: the tree glows brighter and warmer as dominoes and charge pile up, a low hum rises with each play, and the "if it fires now" numbers tick up instead of jumping.
- [ ] A small tree (3 to 4 dominoes) gives a short, clean cascade: charge runs out from the opener step by step, caps pop their numbers, then a quick tally and the enemy's turn.
- [ ] A large tree with junctions: each junction splits the glow into both branches at once, amplifiers flare (bigger for bigger changes), Echo and Spectrum have their own flare, and the branches fire together.
- [ ] Big caps shake the screen; only the very biggest add lightning between dominoes and a brief slow motion. Damage numbers stack up above the enemy's health.
- [ ] The tally shows the cascade's total damage, block and coins before the enemy acts.
- [ ] At 4x playback a large cascade finishes in a few seconds; at 0.5x it is still readable.
- [ ] Online: every screen plays the same cascade, and a slow screen never holds the others up.

## Events
Check each event screen once in single player and once online, including a 4-player room.
- [ ] Lost Courier: the rare domino shows, votes appear live, a split vote shows the drawn result and odds.
- [ ] Toll Bridge: Pay is hidden when a player is short; the fight gives all-rare offers; Turn back shows "?" on the next floor.
- [ ] Spark Shrine: the blessed spark is marked in battle and every domino attached to it adds +1 charge after its own change (a cap there goes off at charge + 1); the marker is gone after the boss.
- [ ] Tinker's Bench: flip and repaint previews match the result.
- [ ] Wishing Well: each prize comes up at least once; a two-output domino asks which spark counts.
- [ ] Mirror Pond and Twin Forge: previews match the result in the deck viewer.
- [ ] Sleeping Giant: the meter shows the chance before each decision; only the current player can act online.

## Charms
Check once in single player and once online with 4 players.
- [ ] Win an elite: a charm is offered beside the dominoes. Taking it adds its icon by your name; Skip works; the run doesn't stall.
- [ ] Win a boss: 3 rare (diamond) charms, pick 1 or skip.
- [ ] Online: everyone picks at once; a teammate's row shows "choosing a charm", then "took" or "skipped".
- [ ] Hover each icon: one tooltip with the right description. Icons show on the map, rest, Trader, event, reward, deck viewer and combat screens.
- [ ] Combat with 4 players: the charm list in the right column overlaps nothing.
- [ ] Many charms on one player: the icons don't squeeze into each other.
- [ ] A charm firing in combat bursts its icon. Lens and Bulwark values match the tooltip and are part of the cap's value, so every extra trigger repeats them.
- [ ] Deep Pockets raises the hand limit; Early Riser draws one more at round start.
- [ ] Keystone: each of your amplifiers adds +1 charge after its own change. Overcharge, Resonance and Prism change Double, Echo and Spectrum as their tooltips say.
- [ ] Spark Starter: your opener adds +1 charge to the branch.
- [ ] First Echo: only the first cap to go off each round goes off twice. Lightning Rod doubles caps set off by Storm or Void, and stacks with First Echo.
- [ ] Junction Runner: the party gains 3 block each time one of your junctions lights up in the cascade, and not for anyone else's.
- [ ] Hall of Mirrors: your junction opens a third end that repeats the first output spark.
- [ ] Trader: 3 charms per player at 40 (32 with Haggler); Buy greys out without the coins.

## Acts and bosses
- [ ] Win the act 1 boss: rewards, then the transition screen with the heal and the act 2 boss; Continue opens "Act 2 of 3".
- [ ] Online: each player presses Continue on the transition screen and the others show "Waiting for ...". Reload a client and the host there: it comes back the same.
- [ ] Lose in act 2: the run end screen says "Reached act 2 of 3, floor N".
- [ ] The map boss tooltip shows during a route vote and isn't covered.
- [ ] Hoarder: when the cascade starts it gains block for every domino on the board, before any cap goes off.
- [ ] Auditor: the party takes damage when a cap goes off with the same spark as the cap before it, and for each extra trigger of a repeated cap.
- [ ] Glutton: it heals at the end of every round.
- [ ] Smolder: its attacks grow every round, and the intent card shows the grown values.
- [ ] Long Night: its attack grows for every different cap the party sets off, and the intent card follows.
- [ ] Warden of Locks: the padlock and "X locked" show at round start; open ends of that spark can't be attached to.
- [ ] Warden of Locks with a Spark Shrine blessing: the lock row and the blessing line don't overlap.

## The fun question
- [ ] After the evening: was building a cascade together fun? What was the best moment, and the most boring one?
