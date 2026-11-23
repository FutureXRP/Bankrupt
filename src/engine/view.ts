// What one player is allowed to know. The AI only ever receives this view, so it
// cannot see rival hands or the order of the draw deck (spec §14).

import { sumMoney, type Card } from './cards';
import type { RuleConfig } from './rules';
import type { GameState, PendingAttack, Phase } from './state';

export type PublicPlayer = {
  id: string;
  name: string;
  isAI: boolean;
  bank: Card[];
  total: number;
  handCount: number;
};

export type PlayerView = {
  selfId: string;
  rules: RuleConfig;
  /** Copies of each defense card in play this game (public knowledge, like the box contents). */
  defenseCopies: number;
  hand: Card[];
  players: PublicPlayer[]; // everyone, in seat order, including self
  drawCount: number;
  discardPile: Card[];
  bankruptDrawnCount: number;
  bankedThisTurn: number;
  currentPlayerId: string;
  phase: Phase;
  pendingAttack?: PendingAttack;
  pendingDraw?: { playerId: string };
  finalRound?: { triggeredByPlayerId: string; turnsRemaining: number };
  turnNumber: number;
};

/**
 * The Bankrupt count everyone is allowed to know. When Bankrupt is a trap, every
 * draw is public. When it is held and played (attack mode), draws are secret
 * and only the ones that have been played are counted.
 */
export function publicBankruptCount(state: GameState): number {
  if (state.rules.bankruptMode === 'trap') return state.bankruptDrawnCount;
  return state.players.reduce((sum, p) => sum + p.stats.bankruptPlayed, 0);
}

export function getPlayerView(state: GameState, playerId: string): PlayerView {
  const self = state.players.find((p) => p.id === playerId);
  if (!self) throw new Error(`Unknown player ${playerId}`);
  return {
    selfId: playerId,
    rules: { ...state.rules },
    defenseCopies:
      state.players.length === 2
        ? Math.min(state.deck.specialCopies, state.rules.twoPlayerDefenseCopies)
        : state.deck.specialCopies,
    hand: [...self.hand],
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      bank: [...p.bank],
      total: sumMoney(p.bank),
      handCount: p.hand.length,
    })),
    drawCount: state.drawPile.length,
    discardPile: [...state.discardPile],
    bankruptDrawnCount: publicBankruptCount(state),
    bankedThisTurn: state.bankedThisTurn,
    currentPlayerId: state.players[state.currentPlayerIndex].id,
    phase: state.phase,
    pendingAttack: state.pendingAttack ? { ...state.pendingAttack } : undefined,
    pendingDraw: state.pendingDraw ? { ...state.pendingDraw } : undefined,
    finalRound: state.finalRound ? { ...state.finalRound } : undefined,
    turnNumber: state.turnNumber,
  };
}

/**
 * The game as one player may see it, in the same shape as the full state, for
 * sending to that player's device in an invite-code game. Other hands and the
 * draw deck keep their sizes but every card in them is replaced by a blank.
 */
export function maskStateFor(state: GameState, playerId: string): GameState {
  let n = 0;
  const blank = (): Card => ({ id: `hidden-${n++}`, kind: 'money' });
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? p : { ...p, hand: p.hand.map(blank) })),
    drawPile: state.drawPile.map(blank),
    removed: [],
    refillQueue: [],
    rngState: 0,
    bankruptDrawnCount: publicBankruptCount(state),
  };
}
