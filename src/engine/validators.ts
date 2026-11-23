// Rule checks shared by the engine, the AI and the interface.

import { DEFENSE_FOR, MONEY_VALUES, isAttackKind, type Card, type MoneyValue } from './cards';
import type { RuleConfig } from './rules';
import type { Action, GameState } from './state';

/** Denominations the hand holds enough copies of to bank. */
export function bankableValues(hand: readonly Card[], rules: RuleConfig): MoneyValue[] {
  return MONEY_VALUES.filter(
    (v) => hand.filter((c) => c.kind === 'money' && c.value === v).length >= rules.minBankSetSize,
  );
}

/** True when the player could bank or attack, which (by default) rules out discarding. */
export function hasLegalPrimaryAction(
  hand: readonly Card[],
  opponents: readonly { bank: readonly Card[] }[],
  rules: RuleConfig,
): boolean {
  if (bankableValues(hand, rules).length > 0) return true;
  return hand.some((c) => isAttackKind(c.kind)) && opponents.some((o) => o.bank.length > 0);
}

/** Returns null when the action is legal, otherwise a plain-language reason. */
export function validateAction(state: GameState, action: Action): string | null {
  if (state.phase === 'finished') return 'The game is over.';
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) return 'Unknown player.';
  const current = state.players[state.currentPlayerIndex];

  if (action.type === 'defend') {
    const pending = state.pendingAttack;
    if (state.phase !== 'reaction' || !pending) return 'There is no attack to answer.';
    if (pending.targetId !== player.id) return 'Only the attacked player can respond.';
    if (action.cardId === null) {
      return state.rules.allowDeclineDefense ? null : 'You must play your defense.';
    }
    const card = player.hand.find((c) => c.id === action.cardId);
    if (!card) return 'That card is not in your hand.';
    if (card.kind !== DEFENSE_FOR[pending.kind]) return 'That card cannot block this attack.';
    return null;
  }

  if (action.type === 'steal') {
    const pending = state.pendingAttack;
    if (state.phase !== 'theft_selection' || !pending) return 'There is nothing to steal right now.';
    if (pending.attackerId !== player.id) return 'Only the thief chooses what to steal.';
    const target = state.players.find((p) => p.id === pending.targetId)!;
    if (!target.bank.some((c) => c.id === action.cardId)) return "That card is not in the target's bank.";
    return null;
  }

  if (state.phase !== 'action') return 'Waiting for another decision first.';
  if (player.id !== current.id) return 'It is not your turn.';

  switch (action.type) {
    case 'bank': {
      const ids = new Set(action.cardIds);
      if (ids.size !== action.cardIds.length) return 'The same card was chosen twice.';
      if (ids.size < state.rules.minBankSetSize) {
        return `Bank at least ${state.rules.minBankSetSize} matching money cards.`;
      }
      const cards = player.hand.filter((c) => ids.has(c.id));
      if (cards.length !== ids.size) return 'Those cards are not all in your hand.';
      if (cards.some((c) => c.kind !== 'money')) return 'Only money cards can be banked.';
      if (cards.some((c) => c.value !== cards[0].value)) return 'Banked money must all be the same value.';
      return null;
    }
    case 'attack': {
      const card = player.hand.find((c) => c.id === action.cardId);
      if (!card) return 'That card is not in your hand.';
      if (!isAttackKind(card.kind)) return 'That card is not an attack.';
      if (action.targetId === player.id) return 'You cannot attack yourself.';
      const target = state.players.find((p) => p.id === action.targetId);
      if (!target) return 'Unknown target.';
      if (target.bank.length === 0) return "You cannot attack an empty bank.";
      return null;
    }
    case 'discard': {
      if (!player.hand.some((c) => c.id === action.cardId)) return 'That card is not in your hand.';
      if (state.rules.discardOnlyWhenStuck) {
        const opponents = state.players.filter((p) => p.id !== player.id);
        if (hasLegalPrimaryAction(player.hand, opponents, state.rules)) {
          return 'You can only discard when you have no other move.';
        }
      }
      return null;
    }
    case 'pass':
      return player.hand.length === 0 ? null : 'You can only pass with an empty hand.';
  }
}
