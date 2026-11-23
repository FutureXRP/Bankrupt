# BANKRUPT

**Build your fortune. Protect your bank. Bankrupt your friends.**

A browser version of BANKRUPT, an original 2–4 player card game. Players bank matching money cards and rob
each other with Bank Thief, while six Bankrupt cards hide in the deck. Draw one and your own bank is wiped out,
unless you hold a Vault Lock. When the sixth Bankrupt is drawn the game is over and the richest bank wins.

**Play it:** https://futurexrp.github.io/Bankrupt/

The first design document is in [`build.md`](./build.md). The creator has since corrected how Bankrupt works;
the correction is noted at the top of that file and this game follows it.

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
- One action per turn: bank a matching set, play Bank Thief, or discard when stuck. Then refill to six cards.
- Bankrupt as a trap: whoever draws it loses their bank unless they play Vault Lock. Sheriff stops Bank Thief.
- The Bankrupt counter, scoring and tie-breaks.
- A choice of Original, Bankrupt Attack or Piggy Bank rules on the setup screen (see below).
- Play vs Computer with 1–3 opponents at Casual, Competitive or Expert level. The computer only ever sees
  what a human in its seat would see.
- Local pass-and-play for 2–4 people on one device, with a privacy screen between turns.
- An unfinished solo game is saved in the browser and can be continued from the menu.
- How to Play, Settings (computer speed, sound, reduced motion, text size) and Credits screens.

Not built yet: online rooms, a step-by-step interactive tutorial (there is a rules page and a practice
match instead), final illustrations and card-flight animations, and browser end-to-end tests in the repo.

## Three rule sets

All three live in [`src/engine/rules.ts`](./src/engine/rules.ts).

**Original** (the default) is the creator's game:

- Nobody holds or plays Bankrupt. The player who **draws** one loses their whole bank, unless they play a
  Vault Lock from their hand. An empty bank loses nothing.
- The game ends the moment the sixth Bankrupt is drawn.

**Bankrupt Attack** turns Bankrupt into a weapon:

- A drawn Bankrupt goes into your hand. On your turn you can play it on another player to wipe out their
  whole bank; they can block it with a Vault Lock.
- After the sixth Bankrupt is drawn, everyone gets one last turn, so the last ones can still be played.

**Piggy Bank** is the Original with a softer landing, chosen after simulating 3,000 computer-vs-computer
games per setup:

| Change | What the simulation showed (Original → Piggy Bank) |
|---|---|
| A bankrupted player keeps their smallest pile (a one-pile bank is still lost entirely) | Players finishing on $0: about 23% → about 1%, together with the next change |
| After the sixth Bankrupt, everyone gets one last turn | Turns each in a 4-player game: about 5 → about 6 |
| A 2-player game leaves 2 Vault Locks and 2 Sheriffs in the box | Turns with nothing to play in 2-player games: about 19% → about 7% |

Simulations measure balance, not fun. Whether Piggy Bank rules stay is the creator's call.

## Rules still to confirm with the creator

These follow the first design document's suggestions and have not been confirmed. Each is a switch in the
rules file:

| Decision | In the game now | Switch |
|---|---|---|
| Smallest set that can be banked | 2 matching cards | `minBankSetSize` |
| What Bank Thief takes | One card the thief chooses | `thiefSteals`: `chosen_card`, `random_card` or `matching_group` |
| Discarding when a move is available | Not allowed | `discardOnlyWhenStuck` |
| Choosing not to play a Vault Lock or Sheriff | Allowed | `allowDeclineDefense` |
| Ties | Most banked cards wins, then shared | fixed in the engine |

Two variants that were tried and shelved also remain as switches: `turnStyle: 'bank_then_attack'` and
`stuckDiscardLimit`.

The creator credit shown on the menu and Credits screen is a placeholder in
[`src/ui/branding.ts`](./src/ui/branding.ts) until she chooses how she wants to be named.

## How the code is organised

```text
src/engine/   Rules only, no interface: cards, setup, actions, reactions, endgame, invariants
src/ai/       Casual, Competitive and Expert opponents, working from a player's-eye view
src/ui/       React screens, card faces, sounds, saved settings
tests/        Rules tests for all three rule sets and the variants, plus 3,000 simulated games
```

The engine is independent of the interface, so the same rules can later drive an online server or a mobile app.
