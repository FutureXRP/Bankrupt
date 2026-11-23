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
  hand: Card[];
  players: PublicPlayer[]; // everyone, in seat order, including self
  drawCount: number;
  discardPile: Card[];
  bankruptDrawnCount: number;
  bankedThisTurn: number;
  currentPlayerId: string;
  phase: Phase;
  pendingAttack?: PendingAttack;
  finalRound?: { triggeredByPlayerId: string; turnsRemaining: number };
  turnNumber: number;
};

export function getPlayerView(state: GameState, playerId: string): PlayerView {
  const self = state.players.find((p) => p.id === playerId);
  if (!self) throw new Error(`Unknown player ${playerId}`);
  return {
    selfId: playerId,
    rules: { ...state.rules },
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
    bankruptDrawnCount: state.bankruptDrawnCount,
    bankedThisTurn: state.bankedThisTurn,
    currentPlayerId: state.players[state.currentPlayerIndex].id,
    phase: state.phase,
    pendingAttack: state.pendingAttack ? { ...state.pendingAttack } : undefined,
    finalRound: state.finalRound ? { ...state.finalRound } : undefined,
    turnNumber: state.turnNumber,
  };
}
