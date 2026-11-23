// Game state model (spec §18.2).

import type { AttackKind, Card } from './cards';
import type { RuleConfig } from './rules';

export type Difficulty = 'casual' | 'competitive' | 'expert';

export type PlayerStats = {
  bankruptPlayed: number;
  bankruptBlocked: number; // this player's Bankrupt attacks that were blocked
  thiefPlayed: number;
  thiefBlocked: number; // this player's Bank Thief attacks that were blocked
  largestBank: number; // most money banked in a single turn
};

export type Player = {
  id: string;
  name: string;
  isAI: boolean;
  difficulty?: Difficulty;
  hand: Card[]; // private to owner
  bank: Card[]; // public
  stats: PlayerStats;
};

export type Phase = 'action' | 'reaction' | 'theft_selection' | 'bankrupt_draw' | 'finished';

export type LogKind =
  | 'setup'
  | 'bank'
  | 'attack' // an attack was declared and is waiting on a decision
  | 'bankrupt' // a Bankrupt landed
  | 'thief' // a Bank Thief landed
  | 'block'
  | 'discard'
  | 'pass'
  | 'draw'
  | 'final'
  | 'end';

export type LogEntry = {
  id: number;
  turn: number;
  kind: LogKind;
  text: string;
  actorId?: string;
  targetId?: string;
};

export type PendingAttack = {
  kind: AttackKind;
  attackerId: string;
  targetId: string;
  cardId: string;
};

export type GameState = {
  rules: RuleConfig;
  players: Player[];
  drawPile: Card[]; // top of the deck is the END of the array
  discardPile: Card[];
  removed: Card[]; // cards left in the box for this game (2-player variant)
  dealerIndex: number;
  currentPlayerIndex: number;
  turnNumber: number;
  phase: Phase;
  bankruptDrawnCount: number;
  bankedThisTurn: number; // dollars the active player has banked so far this turn
  pendingAttack?: PendingAttack;
  /** Trap mode: this player drew Bankrupt, holds a Vault Lock, and must decide whether to use it. */
  pendingDraw?: { playerId: string };
  finalRound?: { triggeredByPlayerId: string; turnsRemaining: number };
  rngState: number;
  actionLog: LogEntry[];
  winnerIds?: string[];
};

export type Action =
  | { type: 'bank'; playerId: string; cardIds: string[] }
  | { type: 'attack'; playerId: string; cardId: string; targetId: string }
  | { type: 'discard'; playerId: string; cardIds: string[] }
  | { type: 'pass'; playerId: string }
  /** bank_then_attack turns only: stop after banking without attacking. */
  | { type: 'end_turn'; playerId: string }
  /** The defender's answer to an attack. cardId null = do not block. */
  | { type: 'defend'; playerId: string; cardId: string | null }
  /** The thief's pick from the victim's bank. */
  | { type: 'steal'; playerId: string; cardId: string };

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      hand: [...p.hand],
      bank: [...p.bank],
      stats: { ...p.stats },
    })),
    drawPile: [...s.drawPile],
    discardPile: [...s.discardPile],
    removed: [...s.removed],
    pendingAttack: s.pendingAttack ? { ...s.pendingAttack } : undefined,
    pendingDraw: s.pendingDraw ? { ...s.pendingDraw } : undefined,
    finalRound: s.finalRound ? { ...s.finalRound } : undefined,
    actionLog: [...s.actionLog],
    winnerIds: s.winnerIds ? [...s.winnerIds] : undefined,
  };
}

/** Who has to make a decision right now, or null when the game is over. */
export function actorId(state: GameState): string | null {
  switch (state.phase) {
    case 'action':
      return state.players[state.currentPlayerIndex].id;
    case 'reaction':
      return state.pendingAttack!.targetId;
    case 'theft_selection':
      return state.pendingAttack!.attackerId;
    case 'bankrupt_draw':
      return state.pendingDraw!.playerId;
    default:
      return null;
  }
}
