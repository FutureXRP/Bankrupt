# BANKRUPT

**Build your fortune. Protect your bank. Bankrupt your friends.**

A browser version of BANKRUPT, an original 2–4 player card game. Players bank matching money cards, rob and
bankrupt each other, and defend with Vault Lock and Sheriff. When the sixth Bankrupt card is drawn, everyone
gets one last turn and the richest bank wins.

The full design is in [`build.md`](./build.md). This repository is the playable browser MVP (Milestone 2 of
that document).

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open the address it prints. Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the rules, AI and simulation tests |
| `npm run build` | Type-checks and builds a static site into `dist/` |
| `npm run preview` | Serves the built site locally |

The build uses relative paths, so `dist/` can be dropped onto any static host.

## What is in the game

- The exact 80-card deck and setup: deal from the 74 non-Bankrupt cards, then shuffle the six Bankrupt cards in.
- One action per turn: bank a matching set, play Bank Thief, play Bankrupt, or discard when stuck.
- Vault Lock and Sheriff as one-use reactions, with a prompt when you are attacked.
- The Bankrupt Draw Counter, the Final Round, scoring and tie-breaks.
- Play vs Computer with 1–3 opponents at Casual, Competitive or Expert level. The computer only ever sees
  what a human in its seat would see.
- Local pass-and-play for 2–4 people on one device, with a privacy screen between turns.
- An unfinished solo game is saved in the browser and can be continued from the menu.
- How to Play, Settings (computer speed, sound, reduced motion, text size) and Credits screens.

Not built yet: online rooms, the step-by-step interactive tutorial (there is a rules page and a practice
match instead), final illustrations and card-flight animations, and browser end-to-end tests in the repo.

## Rules waiting for the creator's approval

The spec marks ten decisions as still needing sign-off (§25). The game uses the recommended playtest default
for each. The ones most likely to change are switches in [`src/engine/rules.ts`](./src/engine/rules.ts):

| # | Decision | Default in the game | How to change it |
|---|---|---|---|
| 2 | Smallest set that can be banked | 2 matching cards | `minBankSetSize` |
| 4 | What Bank Thief takes | One card the thief chooses | `thiefSteals`: `chosen_card`, `random_card` or `matching_group` |
| 7 | Discarding when a move is available | Not allowed | `discardOnlyWhenStuck` |
| 9 | When the sixth Bankrupt is drawn | Everyone gets one final turn | `endTrigger`: `final_circuit` or `immediate` |
| — | Declining to play a defense | Allowed | `allowDeclineDefense` |

The others are fixed in the engine for now: 80 cards (#1), one action per turn (#3), Vault Lock and Sheriff
as one-use reactions (#5, #6), refill to six at the end of the turn (#8), and ties going to the most banked
cards and then shared (#10). A Vault Lock that stays on the table would need new engine work.

The creator credit shown on the menu and Credits screen is a placeholder in
[`src/ui/branding.ts`](./src/ui/branding.ts) until she chooses how she wants to be named.

## How the code is organised

```text
src/engine/   Rules only, no interface: cards, setup, actions, reactions, endgame, invariants
src/ai/       Casual, Competitive and Expert opponents, working from a player's-eye view
src/ui/       React screens, card faces, sounds, saved settings
tests/        The acceptance tests from spec §22, plus 3,000 simulated games
```

The engine is independent of the interface, so the same rules can later drive an online server or a mobile app.
