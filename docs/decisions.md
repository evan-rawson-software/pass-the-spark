# Decisions

Confirmed rulings. These override the build brief where they differ. Newest last.

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

- **The fuse:** the lead plays any domino. It doesn't add strength, so the first answer is at strength 1. Its effect never triggers; Lookout used as the fuse reveals nothing. It goes to the owner's discard pile. It counts in the chain's history.
- **Strength:** every answer, player or enemy, adds 1 and resolves at the new strength.
- **Mimic and Reflect after the fuse:** they trigger the fuse's effect for real, at the strength of the Mimic or Reflect being played.
- **"Any spark" intake:** it can be set off by Rot. That's the players' answer to Rot; there are no dedicated Rot counters.
- **Block:** soaks damage first and the rest hits health. A domino can have an "ignores block" flag.
- **Enemy reactions and lap:** for now, enemy reactions ignore lap. This is a data setting so balance runs can test both.
- **Player can't answer:** the chain ends and so does the round, even if players still hold dominoes. The next round starts with the draw, then the next lead's fuse. The enemy never fuses.
- **Rot:** the engine supports it, but content uses it sparingly or not at all.

### Enemy
- **Draws per round:** basic 3, elite 4, boss 5. Set per enemy in data.
- **Hand limit:** set per enemy in data. Defaults: basic 5, elite 6, boss 7. Every enemy discards its oldest domino to make room for each draw. Discards go to the enemy's discard pile.
- **Reshuffle:** same as players. An empty deck is reshuffled from the discard pile when it needs to draw.
- **Several matching dominoes:** the enemy plays the leftmost one that answers the current spark, or either spark when there are two.
- **Leftover dominoes at round end:** they go off at strength 1, left to right, then block resets.
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

- **Mimic:** repeats the effect of the last domino played in this chain, at the Mimic's own strength and lap. Enemy passes don't count. It copies the fuse's effect even though the fuse's own effect never triggered. It copies enemy effects toward the enemy: damage hits the enemy, and healing or block goes to the party. Mimic never hurts the party. It copies augments too (Amplify, Echo, Lookout). Mimic after Mimic repeats the original effect. Echo on Mimic makes the copied effect happen twice.
- **Trigger cap:** at most 100 triggers per domino (data setting).
- **Streak and Momentum:** dropped for now. More properties may be defined later.
- **Spark history:** the spark each domino was answered with, in order, starting with the fuse's output. For a two-output domino, only the spark its successor actually answered counts. An enemy pass adds nothing; an enemy reaction's output counts like any other. Used by Spectrum and the Auditor.
- **Spectrum:** a property any effect can have. The domino resolves at (chain strength + number of different spark types in the history so far, up to and including the spark that set it off), for itself only, then multiplied by lap as usual. The chain's strength still goes up by the usual 1. Example: at strength 5 with 3 different sparks so far, a Spectrum Jab (base 3) on lap 1 resolves at strength 8 and deals 24.

### Elite and boss specials
- **Pilfer:** dropped for now.

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
- A30 (elite and boss specials), being answered one by one.
