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

## Events
Check each event screen once in single player and once online, including a 4-player room.
- [ ] Lost Courier: the rare domino shows, votes appear live, a split vote shows the drawn result and odds.
- [ ] Toll Bridge: Pay is hidden when a player is short; the fight gives all-rare offers; Turn back shows "?" on the next floor.
- [ ] Spark Shrine: the blessed spark is marked in battle and adds 2 strength; the marker is gone after the boss.
- [ ] Tinker's Bench: flip and repaint previews match the result.
- [ ] Wishing Well: each prize comes up at least once; a two-output domino asks which spark counts.
- [ ] Mirror Pond and Twin Forge: previews match the result in the deck viewer.
- [ ] Sleeping Giant: the meter shows the chance before each decision; only the current player can act online.
- [ ] Watch for: online, an enemy holding two copies of the same domino briefly shows the wrong card leaving its hand.

## The fun question
- [ ] After the evening: was building a chain together fun? What was the best moment, and the most boring one?
