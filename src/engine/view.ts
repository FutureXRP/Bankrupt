// What one player is allowed to know. The AI only ever receives this view, so it
// cannot see rival hands or the order of the draw deck (spec §14).

import { twoPlayerDefenseCount, type Card } from './cards';
import type { RuleConfig } from './rules';
import { bankTotal, type TurnBuffs } from './shop';
import type { GameState, PendingAttack, Phase } from './state';

export type PublicPlayer = {
  id: string;
  name: string;
  isAI: boolean;
  bank: Card[];
  bonus: number;
  insured: boolean;
  total: number; // money cards plus loose cash
  handCount: number;
};

export type PlayerView = {
  selfId: string;
  rules: RuleConfig;
  /** Copies of each defense card in play this game (public knowledge, like the box contents). */
  defenseCopies: number;
  /** Copies of the Lawyer card in play this game. */
  lawyerCopies: number;
  hand: Card[];
  players: PublicPlayer[]; // everyone, in seat order, including self
  drawCount: number;
  discardPile: Card[];
  bankruptDrawnCount: number;
  bankedThisTurn: number;
  buffs: TurnBuffs;
  /** Deck cards this player has seen with Inside Tip (first drawn first). */
  peek: Card[];
  currentPlayerId: string;
  phase: Phase;
  pendingAttack?: PendingAttack;
  pendingDraw?: { playerId: string };
  finalRound?: { triggeredByPlayerId: string; turnsRemaining: number };
  turnNumber: number;
};

/**
 * The Bankrupt count that drives the countdown, and that everyone may know.
 * When Bankrupt is a trap, it is the number drawn (every draw is public). When
 * it is held and played (attack mode), draws are secret: it is the number that
 * have been played or discarded, i.e. the Bankrupt cards in the discard pile.
 */
export function publicBankruptCount(state: GameState): number {
  if (state.rules.bankruptMode === 'trap') return state.bankruptDrawnCount;
  return state.discardPile.filter((c) => c.kind === 'bankrupt').length;
}

export function getPlayerView(state: GameState, playerId: string): PlayerView {
  const self = state.players.find((p) => p.id === playerId);
  if (!self) throw new Error(`Unknown player ${playerId}`);
  return {
    selfId: playerId,
    rules: { ...state.rules },
    defenseCopies:
      state.players.length === 2
        ? twoPlayerDefenseCount(state.deck, state.rules.twoPlayerDefenseCopies)
        : state.deck.specialCopies,
    lawyerCopies: state.deck.swapCopies,
    hand: [...self.hand],
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      bank: [...p.bank],
      bonus: p.bonus,
      insured: p.insured,
      total: bankTotal(p),
      handCount: p.hand.length,
    })),
    drawCount: state.drawPile.length,
    discardPile: [...state.discardPile],
    bankruptDrawnCount: publicBankruptCount(state),
    bankedThisTurn: state.bankedThisTurn,
    buffs: { ...state.buffs },
    peek: [...self.peek],
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
/** How much of the action log a guest's device is sent (it only shows the last few lines). */
export const GUEST_LOG_LENGTH = 30;

export function maskStateFor(state: GameState, playerId: string): GameState {
  let n = 0;
  const blank = (): Card => ({ id: `h${n++}`, kind: 'money' });
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? p : { ...p, hand: p.hand.map(blank), peek: [] })),
    drawPile: state.drawPile.map(blank),
    // Only the top of the discard pile is ever shown; the rest keeps its size.
    discardPile: state.discardPile.map((card, i) => (i === state.discardPile.length - 1 ? card : blank())),
    actionLog: state.actionLog.slice(-GUEST_LOG_LENGTH),
    removed: [],
    refillQueue: [],
    rngState: 0,
    bankruptDrawnCount: publicBankruptCount(state),
  };
}
