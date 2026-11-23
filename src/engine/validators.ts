// Rule checks shared by the engine, the AI and the interface.

import { DEFENSE_FOR, MONEY_VALUES, isAttackKind, type AttackKind, type Card, type MoneyValue } from './cards';
import type { RuleConfig } from './rules';
import { bankTotal, shopItem, type ShopItemId } from './shop';
import type { Action, GameState } from './state';

/** Denominations the hand holds enough copies of to bank. */
export function bankableValues(hand: readonly Card[], rules: RuleConfig): MoneyValue[] {
  return MONEY_VALUES.filter(
    (v) => hand.filter((c) => c.kind === 'money' && c.value === v).length >= rules.minBankSetSize,
  );
}

/**
 * The cards a bank keeps when it is hit by Bankrupt. Under the Piggy Bank rule
 * that is the pile worth the least (lowest denomination on a tie) — unless the
 * bank is a single pile, which is lost entirely.
 */
export function pileSavedFromBankrupt(bank: readonly Card[], rules: RuleConfig): Card[] {
  if (rules.bankruptDestroys !== 'all_but_smallest_pile') return [];
  const piles = MONEY_VALUES.map((v) => bank.filter((c) => c.value === v)).filter((p) => p.length > 0);
  if (piles.length < 2) return [];
  return piles.reduce((a, b) => (b.length * b[0].value! < a.length * a[0].value! ? b : a));
}

type Bank = { bank: readonly Card[]; bonus: number };

/**
 * Can this attack be aimed at this bank? An ordinary Bank Thief needs a money
 * card to take; Bankrupt, Bank Swap and a Big Heist need any money at all.
 */
export function canTarget(kind: AttackKind, target: Bank, heist: boolean): boolean {
  return kind === 'bank_thief' && !heist ? target.bank.length > 0 : bankTotal(target) > 0;
}

/** True when the player could bank or attack, which (by default) rules out discarding. */
export function hasLegalPrimaryAction(
  hand: readonly Card[],
  opponents: readonly Bank[],
  rules: RuleConfig,
  heist = false,
): boolean {
  if (bankableValues(hand, rules).length > 0) return true;
  // Bank Swap never forces your hand: you may always hold on to it.
  return hand.some(
    (c) => isAttackKind(c.kind) && c.kind !== 'bank_swap' && opponents.some((o) => canTarget(c.kind as AttackKind, o, heist)),
  );
}

/** Why a power-up cannot be bought right now, or null if it can. */
export function shopProblem(state: GameState, playerId: string, itemId: ShopItemId): string | null {
  const player = state.players.find((p) => p.id === playerId)!;
  const item = shopItem(itemId);
  if (!state.rules.shop) return 'The shop is closed in this game.';
  if (state.phase !== 'action' || state.players[state.currentPlayerIndex].id !== playerId) return 'You can only shop on your turn.';
  if (state.buffs.bought) return 'One power-up per turn.';
  if (state.bankedThisTurn > 0) return 'Shop before you play.';
  if (bankTotal(player) < item.price) return `You need $${item.price} in your bank.`;
  const rivals = state.players.filter((p) => p.id !== playerId);
  switch (item.id) {
    case 'double_up':
      return bankableValues(player.hand, state.rules).length > 0 ? null : 'You have no match to bank.';
    case 'big_heist':
      if (!player.hand.some((c) => c.kind === 'bank_thief')) return 'You need a Bank Thief card.';
      return rivals.some((r) => bankTotal(r) > 0) ? null : 'Nobody has money to steal.';
    case 'insurance':
      return player.insured ? 'You are already insured.' : null;
    case 'inside_tip':
      return state.drawPile.length > 0 ? null : 'The deck is empty.';
    case 'overtime':
      return null;
  }
}

/** Returns null when the action is legal, otherwise a plain-language reason. */
export function validateAction(state: GameState, action: Action): string | null {
  if (state.phase === 'finished') return 'The game is over.';
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) return 'Unknown player.';
  const current = state.players[state.currentPlayerIndex];

  if (action.type === 'defend' && state.phase === 'bankrupt_draw') {
    if (state.pendingDraw?.playerId !== player.id) return 'Only the player who drew Bankrupt can respond.';
    if (action.cardId === null) return state.rules.allowDeclineDefense ? null : 'You must play your Vault Lock.';
    const card = player.hand.find((c) => c.id === action.cardId);
    if (!card) return 'That card is not in your hand.';
    return card.kind === 'vault_lock' ? null : 'Only Vault Lock stops Bankrupt.';
  }

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
      if (!canTarget(card.kind, target, state.buffs.heist)) return 'There is nothing there to take.';
      return null;
    }
    case 'discard': {
      const ids = new Set(action.cardIds);
      if (ids.size !== action.cardIds.length || ids.size === 0) return 'Choose a card to discard.';
      if (ids.size > state.rules.stuckDiscardLimit) {
        return state.rules.stuckDiscardLimit === 1
          ? 'Discard exactly one card.'
          : `Discard at most ${state.rules.stuckDiscardLimit} cards.`;
      }
      if (player.hand.filter((c) => ids.has(c.id)).length !== ids.size) return 'Those cards are not all in your hand.';
      if (state.bankedThisTurn > 0) return 'You already banked this turn — attack or end your turn.';
      if (state.rules.discardOnlyWhenStuck) {
        const opponents = state.players.filter((p) => p.id !== player.id);
        if (hasLegalPrimaryAction(player.hand, opponents, state.rules, state.buffs.heist)) {
          return 'You can only discard when you have no other move.';
        }
      }
      return null;
    }
    case 'buy':
      return shopProblem(state, player.id, action.item);
    case 'pass':
      if (state.bankedThisTurn > 0) return 'End your turn instead.';
      return player.hand.length === 0 ? null : 'You can only pass with an empty hand.';
    case 'end_turn':
      if (state.rules.turnStyle !== 'bank_then_attack') return 'Your turn ends by itself after one action.';
      return state.bankedThisTurn > 0 ? null : 'Bank, attack or discard before ending your turn.';
  }
}
