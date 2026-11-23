# Pass the Spark 0.3: design

> **Status (2026-11-23):** approved, except for one open point: which of the three wizard options (see "Open" in `docs/v0.3/decisions.md`). This document is the source for how 0.3's two screens look and behave. 0.3 changes no battle rules: `docs/v0.2/design.md` stays the source for those. Rulings are in `docs/v0.3/decisions.md`. Exact positions and sizes live in data.
>
> The proposals page with the mockups: https://claude.ai/artifact/WqRUyBFHVG2FbDzuterUkJ

0.3's goal is a better map screen and a better combat screen. Both should read at a glance and look like a game, not panels.

## What both screens share

- **One stage.** The thing you act on fills the screen. Controls keep to one strip along the bottom.
- **A number sits on the thing it describes.** Enemy numbers are by the enemy, party numbers by the party.
- **One look (S5, S6, S8):**
  - a pixel font everywhere except on dominoes;
  - enemies, backgrounds and icons converted onto the wizards' pixel grid;
  - bars, plates and buttons drawn as one small pixel kit;
  - the tavern table as the setting.
- **Dominoes keep their 0.2 look (S7).**
- **The bottom strip** is the same on both screens: party health on the left, the screen's main action in the middle and right, the menu at the far end.

## The combat screen

### Layout (C1, S4)

- **The enemy stands on the table,** to the right of the arcane circle, as a sprite. Above it, in one block: tier, name, passive, health, block and the line. Its next action is a bubble by its head.
- **The party stands on the left arc of the circle.** The tree grows left to right, toward the enemy. The tree's area is the whole inside of the circle.
- **Each wizard has a small plate:** name, placements left, and a tick when Ready. An away player's wizard is dimmed, as now.
- **Teammates' hands are racks along the top (S9):** head, name, placements left, Ready, charms, and the hand. Pointing at a rack enlarges it, as the tabs do now. Your own seat has no rack.
- **The bottom strip:** party health and block with the "if it fires" preview, your hand, your deck and used piles, and Ready (Fire in single player) with "n of m ready". Round, playback speed and the menu sit at its left end.
- **Gone:** the left column, the big block tile, the hand's frame, the seat tabs.

### The line and the cascade (C3, S10)

- **The line is a second bar under the enemy's health.** It is empty while building. In the cascade the combo total fills it, and it breaks when the total reaches the line.
- **The combo number sits beside that bar,** not over the tree.
- **The enemy's bubble says what the line is worth** before the cascade ("at the line: 10"), and shows the cut when the enemy is staggered.
- **The camera moves the stage only:** circle, tree, wizards and enemy. The enemy's block, the racks and the bottom strip never move.
- Everything else about the cascade stays: the hit-by-hit count, tier words and colours, the slam, the final spell, skip, playback speed and reduced flashing.

### Wizards (S11, S12)

- A new style after the designer's reference: a hooded cloak seen from the front, with flat tones, a bold outline and darkness under the hood. The 8 colours and the wardrobe stay; hats become hood and hat shapes, robes become cloaks.
- They react to what happens in the round (the list is S12).

## The map screen

### Layout (M1, S13)

- **The whole act is on one screen,** running left to right: floor 1 on the left, the boss on the right. No scrolling.
- **Roads never cross.** They are dotted trails. The road already taken is solid; the roads that can be taken next are gold.
- **Stops:** the ones that can be picked now are larger and gold. Stops that can no longer be reached are faded. Visited stops carry a tick.
- **Text is dark ink on the paper.**

### The scroll (M2, S8, S16)

- The map is a scroll unrolled on the tavern table.
- **The boss stands at the end of the road** as a sprite, with its name, for the whole act.
- **A vote is a small flag** in the player's colour on the stop they chose. There are no party pieces on the map. The current stop keeps a "You are here" mark.
- **The bottom strip:** party health; one plate per player with head, name, coins, deck size and charms; who has voted and who the table is waiting for.

### Before you choose (M3, S14)

- **Pointing at a stop opens a card:** what it is, the enemies it can be, what winning gives, the coins, and how many stops away it is. A hidden floor's card says the stop is unknown.
- **Pointing also draws every road onward from that stop.**
- **The boss's card,** by the boss: health, line and passive.
- Clicking a player's plate opens their deck.

## Online and single player

- **Online:** nothing changes in who can do what. Every screen shows the same stage, racks, flags and cards.
- **Single player:** the hand in front belongs to the seat being played; every other seat has a rack, and clicking a rack brings that seat to the front. On the map one click chooses for every seat, so no flags show.
