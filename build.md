# BANKRUPT

> **Correction from the creator (after this document was written).** Bankrupt is **not** an attack card.
> Nobody holds or plays it. The player who **draws** a Bankrupt card loses their own bank, unless they play a
> Vault Lock from their hand. The game ends the moment the sixth Bankrupt is drawn — there is no Final Round.
> Wherever the sections below describe Bankrupt as a card played on an opponent, or a final circuit of turns,
> this correction wins. The game in this repository follows the correction; see the README.

## Complete Game Rulebook & Digital Product Specification

**Version:** 1.0 — Playtest Draft  
**Original concept:** Invented by the user's daughter  
**Genre:** Competitive, turn-based, take-that, money-banking card game  
**Players:** 2–4  
**Recommended age:** 8+ (provisional; validate through playtesting)  
**Target session:** 15–30 minutes (estimate; validate through playtesting)  
**Platforms:** Physical deck, responsive web browser, then optional iOS/Android  
**Design principle:** Preserve the original game first; test refinements as optional variants.

> **Status key:** **[RECOVERED]** = stated in the earlier game discussion summarized in this conversation. **[PROPOSED]** = a concrete rule introduced here to fill a gap, subject to your daughter's approval. **[TO CONFIRM]** = important choice that should be validated against her original intentions. When a section contains both, only the explicitly identified parts are established.

---

# 1. Game Vision

**BANKRUPT** is a fast, competitive card game in which players collect and bank matching money cards while using special cards to steal rival fortunes or wipe out their savings. The richest bank at the end wins, but visible wealth invites attacks.

**Core experience:**
- Build your bank using matching denominations.
- Decide when to bank valuable cards and when to hold them.
- Steal from rivals with **Bank Thief**.
- Attempt to wipe out rivals with **Bankrupt**.
- Defend against bankruptcy with **Vault Lock** and against theft with **Sheriff**.
- Watch the six Bankrupt cards: their appearance brings the game toward its finale.

**Player promise:** Simple to learn, tense at every turn, visually satisfying, and fun to replay.

**Not the same as:** A real-money gambling product. BANKRUPT uses fictional in-game currency, with no wagering or cash-out functionality.

---

# 2. Components & Exact Card Inventory

The original numbers add up to **80 physical cards**. The **74-card deck** referenced in the earlier discussion can be understood as the **74 non-Bankrupt cards** used for the initial deal, plus **6 Bankrupt cards** shuffled in afterward. This interpretation matches both the quantities and the original setup sequence; **confirm this with the creator**.

| Card | Count | Type | Face value | Primary function |
|---|---:|---|---:|---|
| $5 | 14 | Money | $5 | Bank matching sets |
| $25 | 14 | Money | $25 | Bank matching sets |
| $50 | 14 | Money | $50 | Bank matching sets |
| $100 | 14 | Money | $100 | Bank matching sets |
| Bankrupt | 6 | Attack | — | Empty a target player's bank if unblocked |
| Vault Lock | 6 | Defense | — | Block a Bankrupt attack |
| Bank Thief | 6 | Attack | — | Steal money from an opponent's bank |
| Sheriff | 6 | Defense | — | Block a Bank Thief attack |
| **TOTAL** | **80** | | | |

**Totals:** 56 money cards; 24 action/defense cards; **$2,520** total printed money value.

**[RECOVERED]** Card names, quantities, denominations, Bankrupt / Vault Lock and Bank Thief / Sheriff relationships, six-card hand, and non-recyclable discard pile.  
**[TO CONFIRM]** Whether the intended printed product contains 80 cards, and whether the phrase “74-card deck” meant only the initial non-Bankrupt cards.

---

# 3. Objective & Win Condition

**[RECOVERED]** Finish with the most money **banked**, not the most money held in your hand.

**[PROPOSED]** The bank is public and consists of money cards placed face-up in front of each player. Money held in the hand does **not** score. Once all six Bankrupt cards have been drawn from the draw deck, the **Final Round** begins (section 11). After the Final Round, calculate the banked totals. Highest total wins.

**[PROPOSED] Tie rules:** If totals tie, the tied player with the greatest number of banked money cards wins. If still tied, the game ends in a shared victory. Do not use a random winner.

---

# 4. Game Setup

1. Choose **2, 3, or 4 players**. **[RECOVERED]**
2. Separate the **6 Bankrupt** cards from the other **74 cards**. **[RECOVERED]**
3. Shuffle the 74 non-Bankrupt cards and deal **6 face-down cards** to each player. **[RECOVERED]**
4. Shuffle all 6 Bankrupt cards into the remaining undealt draw deck. **[RECOVERED]**
5. Place the draw deck face-down and start an empty discard pile. **[PROPOSED]**
6. Each player starts with an empty bank and a displayed score of **$0**. **[PROPOSED]**
7. Select the dealer, and the player to the dealer's left takes the first turn. **[RECOVERED]**
8. Set the **Bankrupt Draw Counter** to **0 / 6**. **[PROPOSED]**

**Important:** Initial hands cannot contain Bankrupt cards because those cards are inserted *after* dealing.

---

# 5. Areas of Play

Each player has:

- **Hand:** Up to 6 cards, private to that player. **[RECOVERED]**
- **Bank:** Public, face-up money cards with an automatically calculated dollar total. **[RECOVERED]**

Shared areas:

- **Draw deck:** Face-down; cannot be reshuffled after depletion. **[RECOVERED]**
- **Discard pile:** Face-up used cards, rejected money, and money destroyed by bankruptcy. Never returns to the draw deck. **[RECOVERED for no reshuffle; PROPOSED for exact discard handling]**
- **Bankrupt Counter:** Tracks distinct Bankrupt cards drawn from the deck, not Bankrupt cards played. **[PROPOSED interpretation]**

---

# 6. Turn Structure

**[PROPOSED executable turn sequence based on recovered mechanics]**

1. **Start turn.** The active player sees their current hand, all bank totals, and the last action.
2. **Choose one primary action:**
   - **Bank matching money** — play a set of at least two same-denomination money cards from the hand into the public bank; or
   - **Play Bank Thief** — target an opponent who has at least one banked money card; or
   - **Play Bankrupt** — target an opponent with money in their bank; or
   - **Discard one card** — permitted when no legal primary action is possible.
3. **Resolve any defense** immediately when an attack is declared.
4. **Discard the played action card** and any consumed defense card; move or discard money cards as specified by the effect.
5. **Refill hand** from the draw deck, one card at a time, until the player has 6 cards or the draw deck is empty. Each Bankrupt drawn increments the Bankrupt Draw Counter.
6. **Check Final Round trigger**, then pass the turn clockwise.

**Hand limit:** Never intentionally deal beyond 6. Reactions may temporarily reduce a defending player's hand; that player refills only at the end of their own next turn, not immediately.

**[TO CONFIRM]** The earlier discussion says money cards of matching denominations are banked and unusable hands must discard before drawing. It did *not* establish whether one primary action per turn is mandatory, whether matching requires at least 2 cards, or whether all matching cards must be played at once. These settings are the recommended starting playtest rules, not historical facts.

---

# 7. Banking Money

**[RECOVERED]** Players bank matching money cards of the same denomination, including larger groups. Money placed in the bank remains face-up and accumulates over multiple turns.

**[PROPOSED] Exact implementation:**

- A banking action must contain **2 or more** money cards of the **same** value.
- The player chooses how many matching cards to bank, from 2 up to all matching cards held.
- All selected cards move from the hand to that player's bank as one action.
- One primary action can bank only **one denomination**.
- Banked cards stay face-up and visibly grouped by denomination.

**Examples:**
- Two $100 cards bank **$200**.
- Three $25 cards bank **$75**.
- Four $5 cards bank **$20**.
- A $100 and a $50 cannot be banked together because the denominations differ.

**[TO CONFIRM]** Whether a single money card can ever be banked, whether sets must be exactly pairs, and whether one turn can bank several denominations.

---

# 8. Special Cards

## 8.1 BANKRUPT — Attack (6 cards)

**[RECOVERED core effect]** Attempts to empty another player's bank.

**[PROPOSED exact resolution]**
1. Attacker plays Bankrupt and chooses one opponent with a nonempty bank.
2. Defender may respond with **one Vault Lock** card from their hand.
3. If Vault Lock is played, both Bankrupt and Vault Lock go to discard. The bank remains unchanged.
4. Otherwise, **every money card in the defender's bank** goes to the discard pile; defender's bank total becomes $0.
5. The Bankrupt card goes to the discard pile whether successful or blocked.

**Not allowed:** Targeting yourself, attacking an empty bank, blocking with Sheriff, or transferring bankrupt funds to the attacker.

**UI feedback:** Alarm animation, target bank flashing, Vault Lock defense window, falling bank balance for an unblocked hit.

## 8.2 VAULT LOCK — Defense (6 cards)

**[RECOVERED core effect]** Protects banked money from Bankrupt.

**[PROPOSED exact resolution]** Vault Lock is a **one-use reaction card** held in the hand. It blocks one Bankrupt attack, then is discarded. It does not stay on the table or provide permanent protection.

**[TO CONFIRM]** The original intent may have been a persistent lock on the bank; compare both variants in testing before finalizing.

## 8.3 BANK THIEF — Attack (6 cards)

**[RECOVERED core effect]** Steals money from another player's bank.

**[PROPOSED exact resolution]**
1. Attacker plays Bank Thief and targets a player with a nonempty bank.
2. Defender may respond with **Sheriff**.
3. If Sheriff is played, both cards are discarded and no money moves.
4. Otherwise, attacker selects **one visible money card** from the defender's bank and transfers it directly into the attacker's bank.
5. Recalculate both bank totals and discard the Bank Thief card.

**Example:** If the victim has $100 + $50 + $25 banked, the attacker can choose the $100 card, reducing the victim by $100 and increasing the attacker by $100.

**[TO CONFIRM]** The original discussion did not specify theft amount. Alternatives to playtest: steal a random banked card, steal one chosen card, steal an entire matching bank group, or steal a capped dollar amount. **Choosing one visible card** is the default in this specification.

## 8.4 SHERIFF — Defense (6 cards)

**[RECOVERED core effect]** Blocks Bank Thief.

**[PROPOSED exact resolution]** Sheriff is a **one-use reaction** from the defender's hand, discarded after blocking one Bank Thief. Sheriff does not block Bankrupt.

---

# 9. Discard & Drawing Rules

- **[RECOVERED]** When a player cannot use the cards in their hand, they discard before drawing.
- **[PROPOSED]** If no Bank set, Bank Thief attack, or Bankrupt attack is legal, the player selects **exactly one** card to discard as their action.
- **[PROPOSED]** Defenses in the hand are not normally playable as an active turn action; they are saved to react to attacks or can be discarded when no legal primary action exists.
- **[PROPOSED]** After the turn's action and any reactions, the active player draws up to the six-card maximum.
- **[RECOVERED]** Discards are never reshuffled into a new deck.
- **[PROPOSED]** When no cards remain in the draw deck, turns continue without refills until the Final Round ends.

**Important edge case:** A player with six money cards that do not make a pair, and no usable attack cards, discards one card and then draws one replacement. They cannot discard multiple cards on the same turn under the default rules.

---

# 10. The Bankrupt Draw Counter

**[RECOVERED]** The end of the game depends on **all six Bankrupt cards being drawn**. This is different from all six being played.

**[PROPOSED] Exact counter logic:**
- A Bankrupt card increments the counter **only when it leaves the draw deck and enters a player's hand**.
- Cards dealt at setup never include Bankrupt.
- A Bankrupt card played later **does not** increment the counter again.
- A discarded Bankrupt does not reduce the counter.
- Display `Bankrupt cards revealed: X / 6` to all players; the players holding those cards remain private.
- When the sixth Bankrupt is drawn, flag the Final Round.

**Privacy:** The counter reveals only how many have been drawn, not which player is holding which card.

---

# 11. Final Round & Game End

**[RECOVERED]** The game ends when all six Bankrupt cards have been drawn.

**[PROPOSED fairness clarification]** Rather than stop *immediately* when the sixth Bankrupt enters a player's hand during refill (which could prevent that card from being used), grant **one final turn to every player**, starting with the player immediately after the player who drew the sixth Bankrupt and finishing with the player who drew it. This creates a complete last circuit around the table.

During Final Round:
- Use the same actions and defenses as normal.
- There are no extra draws if the deck is empty.
- The Bankrupt counter stays at 6/6.
- Once the last player completes their final turn, **end the game immediately**, score the banks, and show the winner.

**[TO CONFIRM]** Whether the original game intended instant ending on draw, end of the current turn, or a final full circuit. Default: final full circuit, because it makes the final Bankrupt usable and offers equal participation.

---

# 12. Fully Worked Example

There are three players: **Ava**, **Ben**, and **Chloe**.

1. Ava has `$100, $100, $25, Sheriff, $5, Vault Lock`. She banks the matching two $100 cards. Ava's visible bank becomes **$200**; she refills to six.
2. Ben has a Bank Thief and targets Ava, who holds Sheriff. Ava plays Sheriff; the theft fails. Both played action cards go to discard. Ava's bank stays at $200.
3. Chloe plays Bankrupt against Ava. Ava uses Vault Lock, discarding it. The bank survives.
4. On a later turn, Ben plays Bank Thief on Ava after she has no Sheriff. Ben selects one visible $100 card: Ava drops to $100 banked, Ben increases by $100.
5. When the sixth Bankrupt card is eventually drawn from the deck, the game announces the Final Round. Each player gets one additional turn, after which the highest bank wins.

This example illustrates the **proposed** exact interaction rules; it is not presented as a verbatim record of the original tabletop game.

---

# 13. Modes

## 13.1 Solo vs. AI — Launch Priority

**[RECOVERED]** One human can play against up to three computer-controlled opponents. AI hands must remain face-down and their turns must be slow enough to follow.

**[PROPOSED configuration]**
- Player count: one human + 1, 2, or 3 AI opponents.
- Difficulty: **Casual**, **Competitive**, **Expert**.
- AI turn animation: adjustable `Fast / Normal / Slow`, default **Normal**, with visible action log.

## 13.2 Local Pass-and-Play

**[PROPOSED]** Two to four players share one device. Between turns, display a privacy screen (“Pass to Ben — tap when ready”) so the next player's hand is not visible to previous players.

## 13.3 Online Private Multiplayer

**[PROPOSED future feature]** Create a private room and share a six-character join code. Support 2–4 players, reconnects, spectators disabled by default, and server-authoritative rules.

## 13.4 Optional Future Modes (not launch requirements)

- Quick Play matchmaking
- Private tournament brackets
- Ranked seasonal competition
- Family-friendly cosmetics and custom card backs
- House-rules lobby toggles once the base rules are stable

---

# 14. Artificial Intelligence Design

AI **must not see opponents' private hands** or future draw deck order. It can use only public bank cards, public discard history, Bankrupt Draw Counter, and its own hand.

## 14.1 Casual AI
- Banks available matching pairs most of the time.
- Uses thief on a randomly selected bank with visible money.
- Sometimes holds Bankrupt for a larger target.
- Blocks threats when holding the proper defense.
- Discards cards using simple priorities.

## 14.2 Competitive AI
- Scores every legal action by immediate bank value, threat reduction, card economy, and opponent bank size.
- Considers whether to target the current leader.
- Saves powerful attacks for worthwhile banks.
- Preserves defense cards when the counter suggests several attacks remain.

## 14.3 Expert AI
- Estimates unseen-card probabilities using remaining deck composition and public discards.
- Anticipates potential counterplay and endgame timing.
- Avoids spending Bankrupt on low-value banks unless strategically justified.
- Balances guaranteed gains versus attacking the leader.
- Uses deterministic decision scoring with limited random variation to avoid repetitive play.

**AI reaction policy:** If the matching defense is available, default to blocking; any strategic decision not to block must be explained by an explicit rule and tested.

**Fairness guarantee:** AI difficulties affect decision quality, **never** card distribution or access to hidden information.

---

# 15. User Experience & Screen Requirements

## 15.1 Main Menu
- BANKRUPT logo
- `Play vs Computer`
- `Local Multiplayer`
- `Online Private Room` (disabled / coming later until implemented)
- `How to Play`
- `Settings`
- `Credits` (highlight original game creator)

## 15.2 Game Setup
- Player count selector: 2–4
- Human/AI seats
- AI difficulty selector
- Optional tutorial toggle
- `Start Game`

## 15.3 Game Board

**Visible simultaneously:**
- All player names and their face-up banks
- Bank totals in large, readable type
- Human player's six-card hand, readable and selectable
- All opponents' hands **face-down**, with visible card counts
- Draw and discard piles
- Bankrupt Draw Counter (0/6 through 6/6)
- Current turn indicator
- Last-action log
- Primary controls (`Bank`, `Attack`, `Discard`, `End Turn` as applicable)

**Interactions:**
- Select a matching card group to bank.
- Play Bank Thief or Bankrupt by selecting card and target opponent.
- For theft, choose a visible bank money card after defense window closes.
- When attacked, prompt for Vault Lock or Sheriff if available; allow declining the defense only if the rule set permits it.
- Visually animate cards moving among hand, bank, and discard.

## 15.4 Endgame Screen
- Winner and final amount
- Ranking of players
- Total banked for each player
- Bankrupt attacks used / blocked
- Thief attacks used / blocked
- Largest single-bank turn
- `Play Again` and `Return to Menu`

---

# 16. Visual Direction

**[RECOVERED]** High-contrast, vibrant, colorful, illustrated cards rather than text-only placeholders.

**[PROPOSED art direction]** A playful, family-friendly heist-meets-board-game look: expressive bank/vault illustrations, thick iconography, saturated colors, clean currency numerals, crisp vector-inspired art, and lively but controlled animations.

| Card | Suggested look | Accessibility cue |
|---|---|---|
| $5 | Green money card | Large `5` and money symbol |
| $25 | Blue money card | Large `25` and money symbol |
| $50 | Purple money card | Large `50` and money symbol |
| $100 | Gold money card | Large `100` and money symbol |
| Bankrupt | Red cracked bank / warning emblem | `BANKRUPT` and break icon |
| Vault Lock | Steel-blue locked vault | `VAULT LOCK` and padlock |
| Bank Thief | Orange masked thief / money bag | `BANK THIEF` and bag icon |
| Sheriff | Teal sheriff badge | `SHERIFF` and star badge |

**Brand rule:** Never rely on color alone to identify a card; every card has its name or denomination and a distinct symbol.

**Animation design:** 250–600 ms for routine movements; longer (up to ~1.2 s) for dramatic Bankrupt and blocked-attack sequences. Include a reduced-motion setting.

**Audio:** Optional original card shuffles, coin counts, vault latch, sheriff whistle, theft sting, bankruptcy alarm, win celebration. Include volume and mute controls. No audio should be necessary to understand the game.

---

# 17. Functional Requirements — Digital Version

**Launch must-have:**
1. Correct 80-card inventory.
2. Accurate initial 74-card setup and six Bankrupt insertions.
3. Fair seeded shuffle for testability and standard random shuffle for play.
4. 2–4 players, including AI seats.
5. Private player hands and visible banks.
6. One-action turn flow plus reactions.
7. Match validation for deposits.
8. Bankrupt / Vault Lock resolution.
9. Bank Thief / Sheriff resolution.
10. No discard-pile recycling.
11. Correct sixth-Bankrupt final-round trigger.
12. Exact scoring and tie handling.
13. Game log and understandable animations.
14. Responsive desktop / mobile browser layout.
15. How-to-play tutorial and rule reference.
16. Save or restore a local unfinished solo game (recommended).
17. Accessibility: keyboard navigation, screen-reader names, reduced motion, scalable type.

**Later:** Realtime online rooms, matchmaking, avatar customization, achievements, iOS / Android native wrappers or apps.

---

# 18. Suggested Technical Architecture

**[PROPOSED, implementation-agnostic]** Build the **game engine independent of the user interface** so the same rules can drive browser, mobile, AI, and online versions.

```text
BANKRUPT
├── game-engine/
│   ├── cards             # Card definitions, counts, unique IDs
│   ├── setup             # Separate/deal/reinsert/shuffle
│   ├── state             # Players, deck, discard, banks, current turn
│   ├── actions           # Bank, thief, bankrupt, discard, draw
│   ├── reactions         # Vault Lock, Sheriff
│   ├── validators        # Rules, target checks, hand limit
│   ├── endgame           # Sixth draw, final circuit, scoring
│   └── tests             # Unit and scenario tests
├── ai/
│   ├── casual
│   ├── competitive
│   └── expert
├── ui/
│   ├── screens
│   ├── cards
│   ├── table
│   ├── animations
│   └── accessibility
├── multiplayer/          # Future: authoritative server
└── assets/
    ├── illustrations
    ├── audio
    └── branding
```

**Recommended web stack:** TypeScript for type-safe rules, React for UI, a lightweight state management layer, a test runner such as Vitest, and Playwright for browser end-to-end tests. Online play later requires an authoritative server, room membership, reconnect handling, and server-side validation.

## 18.1 Card Model

```ts
type MoneyValue = 5 | 25 | 50 | 100;
type CardKind = 'money' | 'bankrupt' | 'vault_lock' | 'bank_thief' | 'sheriff';

type Card = {
  id: string;           // unique per physical card, e.g. "money100-07"
  kind: CardKind;
  value?: MoneyValue;   // present only for money
};
```

## 18.2 Game State Model

```ts
type Player = {
  id: string;
  name: string;
  isAI: boolean;
  hand: Card[];          // private to owner
  bank: Card[];          // public
};

type GameState = {
  players: Player[];
  drawPile: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  phase: 'action' | 'reaction' | 'theft_selection' | 'refill' | 'final_round' | 'finished';
  bankruptDrawnCount: number;
  pendingAttack?: { kind: 'bankrupt' | 'bank_thief'; attackerId: string; targetId: string };
  finalRound?: { triggeredByPlayerId: string; turnsRemaining: number };
  actionLog: string[];
  winnerIds?: string[];
};
```

**Implementation caution:** On the sixth Bankrupt draw, set `turnsRemaining = playerCount`, then count **one completed additional turn per player**. The trigger player is last in this final circuit. Decrement only after a final-circuit turn concludes, not during the trigger turn.

## 18.3 Core Invariants

- There are exactly **80 unique card IDs** across all zones at every moment.
- No card exists in two zones simultaneously.
- Initial dealt hands contain no Bankrupt cards.
- A public bank contains only money cards.
- Every hand has 0–6 cards.
- Bankrupt Draw Counter never decreases or exceeds 6.
- No discard card returns to the draw pile.
- Total money value of cards across all zones remains $2,520 (unless deliberately introducing new mechanics, which are not in this specification).
- Every attack has at most one matching defense response.
- No player acts out of turn except to resolve a defense.

---

# 19. Edge Cases to Handle

| Situation | Required behavior (proposed) |
|---|---|
| Target has empty bank | Cannot play Bankrupt or Bank Thief on that target |
| Target has both types of defense | Only Vault Lock stops Bankrupt; only Sheriff stops Bank Thief |
| Target has multiple matching defenses | Can play at most one to stop the attack |
| Bank Thief target bank has one card | May steal that one card if Sheriff does not stop it |
| Victim loses last bank card to thief | Victim bank score becomes $0 |
| Bankrupt attack is blocked | Neither player loses banked money |
| Current player has no legal active move | Discard exactly one card and refill as available |
| Current player has 0 cards and no draw pile | Pass; no artificial cards are created |
| Sixth Bankrupt is drawn in a multi-card refill | Finish that refill, then initiate final circuit |
| Sixth Bankrupt drawn while deck is emptied | Final circuit still happens; draws simply stop |
| Player uses a reaction outside their turn | Defense resolves immediately; their hand remains smaller until their own turn |
| Multiple players tie on total | Use proposed tie policy in section 3 |
| App refreshes during a turn | Restore a validated local solo save; later server restores multiplayer |
| Player disconnects during online game | Pause with reconnect grace period; apply transparent room policy |

---

# 20. Rules Tutorial

**Tutorial scene 1 — The goal:** “Build the biggest bank before the final Bankrupt card ends the game.”

**Scene 2 — Matching money:** Give the player two $25 cards; ask them to bank the pair for $50.

**Scene 3 — Public banks:** Show the other players' bank totals. “Money in the bank counts toward winning — and can be attacked.”

**Scene 4 — Bank Thief:** Target an opponent and choose one banked card to steal.

**Scene 5 — Sheriff:** Simulate a thief attack; play Sheriff to stop it.

**Scene 6 — Bankrupt:** Demonstrate losing every card in the bank if the attack succeeds.

**Scene 7 — Vault Lock:** Use Vault Lock to cancel a Bankrupt attack.

**Scene 8 — Six-card hand:** Explain refill and discarding an unusable card.

**Scene 9 — Countdown:** Show the Bankrupt Draw Counter and explain the final circuit.

**Scene 10 — Play:** Start a complete practice match against one Casual AI.

---

# 21. Playtesting Program

**Test A — Original creator review:** The daughter reviews card counts, matching rules, theft amount, defense persistence, and ending sequence. No changes become “official” without her sign-off.

**Test B — 2-player tabletop:** Check whether Bankrupt and Bank Thief feel too strong with only one possible target.

**Test C — 3-player tabletop:** Check leader targeting, kingmaking, and how long turns take.

**Test D — 4-player tabletop:** Check wait time, reaction frequency, and whether blocked attacks feel worthwhile.

**Test E — New-player usability:** Teach the game from the printed rules, without a verbal explanation. Record every question or rule misinterpretation.

**Test F — Digital fairness:** Compare action availability, card tracking, AI hidden-information constraints, and exact outcome against physical play.

**Record for each match:** player count, minutes, final scores, number of banks built, Bankrupt successes, Bankrupt blocks, Thief successes, Sheriff blocks, cards left when final round starts, and a 1–5 fun rating.

**Balance areas to watch:**
- Six Bankrupt cards may make rebuilding too difficult.
- A one-card theft may disproportionately favor taking $100 cards.
- One-action turns may be slow when players hold many mismatched cards.
- One-use Vault Lock vs permanent Vault Lock is a major balance choice.
- Finishing when the sixth Bankrupt is drawn can leave players holding powerful unused attacks; the proposed final circuit mitigates this.

---

# 22. Quality Assurance & Acceptance Tests

1. Build the deck and verify exactly 14 of each money value and 6 of each action/defense card.
2. Deal 4 × 6 setup cards; verify zero Bankrupt cards in starting hands.
3. Place all 6 Bankrupt cards into the remaining draw deck; verify no duplicates.
4. Bank 3 × $50; bank total must increase by $150.
5. Attempt to bank $25 and $50 together; reject the action.
6. Bankrupt an unprotected $175 bank; the victim's bank becomes $0.
7. Bankrupt a $175 bank protected by Vault Lock; bank stays $175.
8. Steal a $100 card from a $125 bank; victim becomes $25 and attacker gains $100.
9. Play Sheriff against Bank Thief; all bank totals remain unchanged.
10. Draw five Bankrupt cards; ensure no finale yet.
11. Draw sixth Bankrupt; final circuit schedules exactly one new turn for each player.
12. Confirm counter remains 6 even if one or more Bankrupt cards are discarded.
13. Exhaust draw deck; ensure no reshuffle and no negative counts.
14. Attempt a seventh card in a hand; prevent it.
15. End tied game; validate tie policy deterministically.
16. Run an AI match; verify AI has no access to opponents' hands or draw order.
17. Assert zone/card/value invariants after each action in automated simulated games.
18. Confirm a blocked attack consumes both attack and defense cards exactly once.
19. Check physical and digital rule text for perfect alignment.
20. Simulate several thousand seeded games and check that no game deadlocks.

---

# 23. Commercial & Brand Considerations

**Suggested positioning:** “Build your fortune. Protect your bank. Bankrupt your friends.”

**Audience:** Family game nights, preteens/teens, casual card-game fans, local multiplayer groups.

**Physical product:**
- 80 cards in a sturdy tuck box or small premium box
- 1 concise quick-start instruction sheet
- 1 full instruction booklet / QR code to video rules
- No game board required

**Digital launch:** A polished free browser prototype can test demand. If later monetized, prioritize a one-time purchase, optional cosmetic themes, or a clearly disclosed premium edition. Avoid pay-to-win cards, real-money stakes, and randomized purchases that affect gameplay.

**Creator credit:** Display your daughter's chosen creator name in the box, title screen, and credits after her approval.

**IP note:** Original artwork, branding, written rules, and code can be valuable creative assets, but a game's underlying rules are not automatically protected by copyright. Before a commercial launch, check name availability, trademark conflicts, illustration rights, and any ownership arrangement for a minor creator with appropriate legal guidance. Do not claim that the name BANKRUPT is available without a search.

---

# 24. Development Roadmap

## Milestone 1 — Rules Lock
**Deliverables:** Creator-approved decisions on the items in section 25; clean rulebook; final card count; physical paper prototype.

## Milestone 2 — Playable Browser MVP
**Deliverables:** Full core engine, simple illustrated card faces, human-vs-AI play, 2–4 seats, rules-complete endgame, scoring, sound toggles, test coverage.

## Milestone 3 — Premium Presentation
**Deliverables:** Final custom illustration set, polished animation, full onboarding, responsive mobile layout, accessible interactions, playtesting analytics.

## Milestone 4 — Local & Online Multiplayer
**Deliverables:** Pass-and-play; private rooms; authoritative server; reconnects; matchmaking only if warranted by user demand.

## Milestone 5 — Physical & App Release
**Deliverables:** Print-ready files, box and rulebook, pilot production samples, platform packaging, publishing/legal checklist, launch page, store listings.

**Release gate:** Do not spend significantly on printing or distribution until the original creator signs off and independent new players can play from the rules alone.

---

# 25. Decisions for the Original Creator

The following are the **only major items still requiring confirmation** before this becomes the official rulebook:

| # | Question | Recommended playtest default |
|---|---|---|
| 1 | Is it 80 total cards, with 74 used before Bankrupt insertion? | **Yes** |
| 2 | Must money be banked in pairs/groups of the same denomination? | **Yes, minimum 2** |
| 3 | Can a player take more than one primary action per turn? | **No, exactly 1** |
| 4 | What exactly does Bank Thief take? | **One selected visible bank card** |
| 5 | Is Vault Lock a one-use reaction or persistent bank protection? | **One-use reaction** |
| 6 | Is Sheriff a one-use reaction? | **Yes** |
| 7 | Can a player discard even if a legal play exists? | **No, only if no legal active action** |
| 8 | Is the draw/refill step at the end of each turn? | **Yes, refill up to 6** |
| 9 | When the sixth Bankrupt is drawn, does play stop immediately? | **Final full circuit** |
| 10 | What happens on equal bank totals? | **Most bank cards, then shared win** |

These defaults form a **fully coherent playtest version**, not a claim that every detail was part of the daughter's first design.

---

# 26. One-Page Quick Rules

**OBJECT:** Have the most money in your bank when the game ends.

**DECK:** 14 each of $5, $25, $50, $100; 6 each of Bankrupt, Vault Lock, Bank Thief, Sheriff. **80 cards total.**

**SETUP:** Remove 6 Bankrupt cards, shuffle the other 74, deal 6 cards to each player, then shuffle the Bankrupt cards into the remaining draw deck. Start with empty banks. Play left of the dealer first.

**YOUR TURN:** Take **one** action:
- Bank **2 or more matching money cards** from your hand, **or**
- Play **Bank Thief** to steal one banked money card from an opponent, **or**
- Play **Bankrupt** to empty an opponent's bank, **or**
- If you cannot make a legal move, discard one card.

**DEFENSE:** When attacked, play **Sheriff** to cancel Bank Thief or **Vault Lock** to cancel Bankrupt. Each defense is discarded after use.

**DRAW:** At the end of your turn, refill to **6 cards** if the deck has enough. Never reshuffle discarded cards.

**COUNTDOWN:** Each Bankrupt card **drawn from the deck** counts toward **6 / 6**, whether it is later played or not.

**FINISH:** When the sixth Bankrupt is drawn, everybody gets one final turn. Most **banked** money wins. Unbanked cards do not count.

**NOTE:** This quick guide uses the proposed defaults in section 25. Confirm them with the creator before publishing as the official rules.

---

# 27. Final Product Definition

**BANKRUPT** is an 80-card strategic family competition for 2–4 players. Players bank matching money, attack rivals' public fortunes with Bankrupt and Bank Thief, and defend with Vault Lock and Sheriff. A six-card hand, no discard recycling, and a six-Bankrupt draw countdown create the game's tension. The first digital release should be a polished browser game with honest AI opponents, visible bank totals, animated card actions, and accurate scoring. The original creator retains final say on all unconfirmed mechanics.

**Specification status:** **Ready to prototype and playtest; not yet creator-approved for commercial publication.**
