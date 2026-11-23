// Setup (spec §4): separate the Bankrupt cards, deal from the other 74,
// then shuffle the six Bankrupt cards into what is left.

import { SPECIAL_COPIES, buildDeck } from './cards';
import { nextRandom, shuffled } from './rng';
import { DEFAULT_RULES, type RuleConfig } from './rules';
import type { Difficulty, GameState, Player } from './state';

export type SeatConfig = { name: string; isAI: boolean; difficulty?: Difficulty };

export type GameOptions = {
  players: SeatConfig[];
  seed: number;
  rules?: Partial<RuleConfig>;
  dealerIndex?: number;
};

export function createGame(options: GameOptions): GameState {
  const count = options.players.length;
  if (count < 2 || count > 4) throw new Error('BANKRUPT is for 2 to 4 players.');
  const rules: RuleConfig = { ...DEFAULT_RULES, ...options.rules };

  const deck = buildDeck();
  const bankrupts = deck.filter((c) => c.kind === 'bankrupt');
  const removed: typeof deck = [];
  let others = deck.filter((c) => c.kind !== 'bankrupt');
  if (count === 2 && rules.twoPlayerDefenseCopies < SPECIAL_COPIES) {
    for (const kind of ['vault_lock', 'sheriff'] as const) {
      removed.push(...others.filter((c) => c.kind === kind).slice(rules.twoPlayerDefenseCopies));
    }
    others = others.filter((c) => !removed.includes(c));
  }

  let rngState = options.seed >>> 0;
  const first = shuffled(others, rngState);
  rngState = first.rngState;
  const pile = first.items;

  const players: Player[] = options.players.map((seat, i) => ({
    id: `p${i + 1}`,
    name: seat.name,
    isAI: seat.isAI,
    difficulty: seat.isAI ? (seat.difficulty ?? 'casual') : undefined,
    hand: [],
    bank: [],
    stats: { bankruptPlayed: 0, bankruptBlocked: 0, thiefPlayed: 0, thiefBlocked: 0, largestBank: 0 },
  }));

  for (let round = 0; round < rules.handSize; round++) {
    for (const p of players) p.hand.push(pile.pop()!);
  }

  const second = shuffled([...pile, ...bankrupts], rngState);
  rngState = second.rngState;

  let dealerIndex = options.dealerIndex;
  if (dealerIndex === undefined) {
    const r = nextRandom(rngState);
    rngState = r.state;
    dealerIndex = Math.floor(r.value * count);
  }
  const currentPlayerIndex = (dealerIndex + 1) % count;

  return {
    rules,
    players,
    drawPile: second.items,
    discardPile: [],
    removed,
    dealerIndex,
    currentPlayerIndex,
    turnNumber: 1,
    phase: 'action',
    bankruptDrawnCount: 0,
    bankedThisTurn: 0,
    rngState,
    actionLog: [
      {
        id: 0,
        turn: 1,
        kind: 'setup',
        text: `${players[dealerIndex].name} dealt. ${players[currentPlayerIndex].name} goes first.`,
      },
    ],
  };
}
