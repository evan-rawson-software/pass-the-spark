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

### Still open
- The fuse (A10), Rot, empty-handed players (A11), which enemies discard at their hand limit (A14), and A16 onward.
