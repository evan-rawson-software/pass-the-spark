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
- **Enemy reactions and lap:** for now, enemy reactions ignore lap. This is a data setting so balance runs can test both.
- **Player can't answer:** the chain ends.
- **Rot:** the engine supports it, but content uses it sparingly or not at all.

### Enemy
- **Draws per round:** basic 3, elite 4, boss 5. Set per enemy in data.
- **Hand limit:** every enemy discards its oldest domino to make room for each draw. Discards go to the enemy's discard pile.
- **Reshuffle:** same as players. An empty deck is reshuffled from the discard pile when it needs to draw.
- **Several matching dominoes:** the enemy plays the leftmost one that answers the current spark, or either spark when there are two.
- **Leftover dominoes at round end:** they go off at strength 1, left to right, then block resets.
- **Ogre outputs:** the same as `chain_sim.py`.
- **Stomp:** hits the whole party for now. Tier mechanics come later.
- **Block and healing:** enemy block lasts until the round ends, like party block. Healing stops at maximum health, for both sides.

### Lookout
- It reveals the enemy's hidden dominoes left to right; the player doesn't choose.
- It reveals more as strength grows, at roughly 1 domino per 2 strength (exact formula to be tuned).
- It does nothing if every domino in the enemy's hand is already revealed.
- A revealed domino stays revealed until it leaves the hand.

### Win and loss
- The party wins when enemy health reaches 0 and loses when party health reaches 0. Both are checked straight away, even mid-chain.
- There's no round limit. An anti-stall rule may be added after playtesting.

### UI notes for later milestones
- A big combo meter during combat shows strength × lap and grows bigger and redder as the chain grows.

### Still open
- A26, A27, follow-ups from 2026-11-19, A28-A30.
