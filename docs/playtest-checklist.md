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
Everyone builds at the same time on a budget of placements; the cascade goes off when every player is Ready (docs/v0.2/design.md).
- [ ] The opener goes in the opener slot; after that a domino can only go on an open end whose spark it accepts. Open ends show their spark and the charge arriving there.
- [ ] Hover or pick a domino: legal ends light up and each shows that domino's own value there (the charge an amplifier or junction passes on, or a cap's value). No total is ever shown while building.
- [ ] Every domino on the board shows its own number: the charge on each fuse, and each placed cap's value on the cap. Take one back or place another and the numbers follow.
- [ ] A junction splits the path into two ends (three with Hall of Mirrors); a junction is refused when it would take the board over the open-end limit.
- [ ] The left column shows "Block if it fires" (the party's block) and the party's health ghost from the intent; the enemy's health bar shows no damage ghost, no skull and no damage total. With `combat.showDamageTotal` set to true in data/presentation.json the old "If it fires now" tally comes back.
- [ ] The intent card shows the enemy's line under its intent ("Line 120").
- [ ] Ends left without a cap fizzle: they dim and sputter, and their charge does nothing.
- [ ] The enemy's intent plays out after the cascade, against the block the party just gained; later intents show under it (two ahead with Spyglass).
- [ ] Block: the party's block from caps protects against the intent that follows and resets at round end; the enemy's block absorbs the next cascade's damage and then resets.
- [ ] Win in the middle of a cascade: it stops the moment the enemy is at 0 health and the battle ends.

### The new round
- [ ] Round start: every hand draws up to its hand size (placements + 2: 8 at 2 players, 5 at 4), round 1 too, with the draw animation. A hand of 8, and with Deep Pockets 10, stays a straight row and never overlaps.
- [ ] Seat tabs: no turn order, no arrows, no LEAD, NEXT or "YOU · NOW" tags and no turn highlight. Each tab shows the name and colour, a pip for each placement that fills as the seat places, a Ready mark, deck and discard, and the hand as small dominoes. Your own tab says YOU.
- [ ] Your hand is live at any time while you have placements and are not Ready; with no placements left, or while Ready, it is dimmed and can't be dragged.
- [ ] Take back: your own domino with nothing hanging from it shows a take-back control on hover, and dragging it onto your hand row takes it back; it slides to your hand and the pip empties. A teammate's domino has no control. A junction is offered only when both of its outputs are empty. The opener too, when nothing hangs from it.
- [ ] Ready: the button reads "Ready", turns green and reads "Not ready" on hover, and "2 of 4 ready" sits beside it. While you are Ready you can't place or take back. A teammate placing or taking back doesn't change your Ready. The cascade goes off when the last player is Ready, and also on an empty board (only the enemy acts). The button is dimmed while a domino is being dragged.
- [ ] Single player (2, 3 and 4 seats): a click on a seat tab brings that seat's hand to the front, framed in its colour, and placements count against that seat; there is no Pass; one "Fire" button makes every seat Ready and the cascade goes off.
- [ ] Online, two tabs: both players place at once and each sees the other's domino drop onto the board and the pips fill; both drag onto the same end: the loser's ghost snaps back, their domino is still in their hand, and a short note shows by their hand (only theirs).
- [ ] Online: toggle Ready on and off; the count follows; the cascade goes off on the last Ready.
- [ ] Online, a player's tab closes: their tab shows "Waiting for [name]"; after 60 seconds it reads "Ready (away)", the cascade goes off if everyone else is Ready, and the host can click that tab to place, take back and toggle Ready for them. At the next round their seat is Ready again (until they return).
- [ ] The board camera fits a tree of 12 or more dominoes (Hall of Mirrors, the open-end limit of 4). The skip and playback-speed controls still work.

### Cascade spectacle
- [ ] Building: the tree glows brighter and warmer as dominoes and charge pile up, a low hum rises with each play, and the "if it fires now" numbers tick up instead of jumping.
- [ ] A small tree (3 to 4 dominoes) gives a short, clean cascade: charge runs out from the opener step by step, caps pop their numbers, then a quick tally and the enemy's turn.
- [ ] A large tree with junctions: each junction splits the glow into both branches at once, amplifiers flare (bigger for bigger changes), Echo and Spectrum have their own flare, and the branches fire together.
- [ ] Big caps shake the screen; only the very biggest add lightning between dominoes and a brief slow motion. Damage numbers stack up above the enemy's health.
- [ ] The combo counter shows the cascade's damage and block as it goes off (the total is hidden until then), before the enemy acts.
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
- [ ] Deep Pockets raises your hand size by 2 and Early Riser by 1 (neither adds placements); the hand refills at round start.
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
