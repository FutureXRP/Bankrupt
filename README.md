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

- The original setup: deal six cards each from the non-Bankrupt cards, then shuffle the six Bankrupt cards in.
- A deck that grows with the table (see below), so games last about as long for 2, 3 or 4 players.
- One action per turn: bank a matching set, play Bank Thief, or discard one card. Then refill to six cards.
- Bankrupt as a trap: whoever draws it loses their bank unless they play Vault Lock. Sheriff stops Bank Thief.
- The Bankrupt counter, scoring and tie-breaks.
- A choice of Original, Bankrupt Attack or Piggy Bank rules on the setup screen (see below).
- Two optional extras, both on by default: a power-up shop, and Bank Swap and Lawyer cards (see below).
- Play vs Computer with 1–3 opponents at Casual, Competitive or Expert level. The computer only ever sees
  what a human in its seat would see.
- Play with Friends: one player hosts and gets an invite code; up to three others join from their own
  devices (see below).
- Pass & Play for 2–4 people on one device, with a privacy screen between turns.
- An unfinished solo game is saved in the browser and can be continued from the menu.
- How to Play, Settings (computer speed, sound, reduced motion, text size) and Credits screens.

Not built yet: matchmaking with strangers, a step-by-step interactive tutorial (there is a rules page and a practice
match instead), final illustrations and card-flight animations, and browser end-to-end tests in the repo.

## Play with Friends (invite codes)

- The host taps **Play with Friends → Host a Game** and gets a five-character code and an invite link.
- Up to three others tap **Join Game** and type the code, or just open the link. The host can fill empty
  seats with computer players, picks the rules, and starts the game.
- The host's device runs the game and checks every move. Each guest is only ever sent their own cards; other
  hands and the deck arrive blanked out.
- If a guest drops out mid-game, a computer player takes over their seat within about 15 seconds. They can
  take the seat back by joining again with the same code and name.
- If the host leaves, the game ends for everyone.

How it connects: the devices talk to each other directly (WebRTC, via the `peerjs` library). To find each
other they use PeerJS's free public connection service, so there is no server to run or pay for. The
trade-offs are that the game depends on that service being up, and that a few networks (some schools,
offices and mobile carriers) block direct connections. Everyone on the same home Wi-Fi is the easy case.

## Deck size

There are always six Bankrupt cards. The rest of the deck grows with the number of players, because the game
ends on the sixth Bankrupt and a bigger table empties the deck faster:

| Players | Deck | Each money value | Vault Lock / Bank Thief / Sheriff | Average rounds (was, with 80 cards) |
|---|---|---|---|---|
| 2 | 80 cards | 14 | 6 each | about 13 |
| 3 | 117 cards | 21 | 9 each | about 14 (was 8) |
| 4 | 154 cards | 28 | 12 each | about 15 (was 5) |

Round counts are from 1,500 simulated games per row under Original rules. The shuffle itself was checked over
20,000 deals: Bankrupt cards land evenly through the deck. Setting `deckScale: 'fixed'` in the rules file goes
back to 80 cards at every table size.

## Three rule sets

All three live in [`src/engine/rules.ts`](./src/engine/rules.ts).

**Original** (the default) is the creator's game:

- Nobody holds or plays Bankrupt. The player who **draws** one loses their whole bank, unless they play a
  Vault Lock from their hand. An empty bank loses nothing.
- The game ends the moment the sixth Bankrupt is drawn.

**Bankrupt Attack** turns Bankrupt into a weapon:

- A drawn Bankrupt goes into your hand. On your turn you can play it on another player to wipe out their
  whole bank; they can block it with a Vault Lock.
- Drawing one is secret: nothing is announced and the on-screen counter only counts Bankrupts that have been
  played. Once the sixth has been drawn, everyone gets one last turn, so the last ones can still be played.

**Piggy Bank** is the Original with a softer landing, chosen after simulating 3,000 computer-vs-computer
games per setup:

| Change | What the simulation showed (Original → Piggy Bank) |
|---|---|
| A bankrupted player keeps their smallest pile (a one-pile bank is still lost entirely) | Players finishing on $0: about 23% → about 1%, together with the next change |
| After the sixth Bankrupt, everyone gets one last turn | Turns each in a 4-player game: about 5 → about 6 |
| A 2-player game leaves 2 Vault Locks and 2 Sheriffs in the box | Turns with nothing to play in 2-player games: about 19% → about 7% |

Simulations measure balance, not fun. Whether Piggy Bank rules stay is the creator's call.

## Extras

Both are switches on the setup screen (and in the host's lobby for invite-code games), on by default, and
work with any of the three rule sets.

**Power-up shop.** At the start of your turn, before you play, you may spend money from your own bank on one
power-up. All of it is pretend in-game money; nothing is ever bought with real money.

| Power-up | Price | What it does |
|---|---|---|
| Double Up | $100 | The match you bank this turn is worth double |
| Big Heist | $200 | Your Bank Thief this turn steals the whole bank, not one card; a Sheriff still stops it |
| Insurance | $100 | The next time you go bankrupt, you get half of it back |
| Inside Tip | $25 | Secretly peek at the top 3 cards of the deck |
| Overtime | $100 | Take another turn right after this one |

Paying takes exactly the price out of the bank: loose cash first, then the smallest money cards, with any
overpayment returned as cash. Cash (from change, doubled matches and insurance payouts) counts toward winning
and is lost to Bankrupt, but an ordinary Bank Thief can only take cards. Prices and effects live in
[`src/engine/shop.ts`](./src/engine/shop.ts). The prices are first guesses and have not been balance-tested.

**Bank Swap and Lawyer cards.** Play a Bank Swap on another player to trade whole banks, cash included. Only
a Lawyer stops it (Sheriff does not). Holding a Bank Swap never forces you to play it. The extra adds the same
number of each card:

| Players | Bank Swaps | Lawyers | Deck with this extra on |
|---|---|---|---|
| 2 | 2 | 2 | 84 cards |
| 3 | 3 | 3 | 123 cards |
| 4 | 4 | 4 | 162 cards |

## Rules still to confirm with the creator

These follow the first design document's suggestions and have not been confirmed. Each is a switch in the
rules file:

| Decision | In the game now | Switch |
|---|---|---|
| Smallest set that can be banked | 2 matching cards | `minBankSetSize` |
| What Bank Thief takes | One card the thief chooses | `thiefSteals`: `chosen_card`, `random_card` or `matching_group` |
| Discarding when a move is available | Allowed (creator's rule): you may always discard one card as your turn | `discardOnlyWhenStuck` |
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
src/net/      Invite-code play: host and guest connections and the messages between them
src/ui/       React screens, card faces, sounds, saved settings
tests/        Rules tests for all three rule sets and the variants, plus 3,000 simulated games
```

The engine is independent of the interface, so the same rules can later drive an online server or a mobile app.
