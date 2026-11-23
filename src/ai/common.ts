// Shared AI helpers. Everything here works from a PlayerView — public
// information plus the AI's own hand — never from the full game state.

import {
  DEFENSE_FOR,
  SPECIAL_COPIES,
  bankableValues,
  isAttackKind,
  type Action,
  type AttackKind,
  type Card,
  type MoneyValue,
  type PlayerView,
  type PublicPlayer,
} from '../engine';

export type Rand = () => number;

export type Option =
  | { type: 'bank'; value: MoneyValue; cards: Card[]; amount: number }
  | { type: 'attack'; kind: AttackKind; card: Card; target: PublicPlayer }
  | { type: 'discard'; card: Card }
  | { type: 'pass' };

export const self = (view: PlayerView) => view.players.find((p) => p.id === view.selfId)!;
export const opponents = (view: PlayerView) => view.players.filter((p) => p.id !== view.selfId);

/** Every legal move for the player whose turn it is. Banking always uses all matching cards. */
export function listOptions(view: PlayerView): Option[] {
  const options: Option[] = [];
  for (const value of bankableValues(view.hand, view.rules)) {
    const cards = view.hand.filter((c) => c.kind === 'money' && c.value === value);
    options.push({ type: 'bank', value, cards, amount: value * cards.length });
  }
  const seenKinds = new Set<string>();
  for (const card of view.hand) {
    if (!isAttackKind(card.kind) || seenKinds.has(card.kind)) continue;
    seenKinds.add(card.kind);
    for (const target of opponents(view)) {
      if (target.bank.length > 0) options.push({ type: 'attack', kind: card.kind, card, target });
    }
  }
  if (options.length === 0 || !view.rules.discardOnlyWhenStuck) {
    for (const card of view.hand) options.push({ type: 'discard', card });
  }
  if (view.hand.length === 0) options.push({ type: 'pass' });
  return options;
}

export function toAction(view: PlayerView, option: Option): Action {
  const playerId = view.selfId;
  switch (option.type) {
    case 'bank':
      return { type: 'bank', playerId, cardIds: option.cards.map((c) => c.id) };
    case 'attack':
      return { type: 'attack', playerId, cardId: option.card.id, targetId: option.target.id };
    case 'discard':
      return { type: 'discard', playerId, cardId: option.card.id };
    case 'pass':
      return { type: 'pass', playerId };
  }
}

export function pick<T>(items: readonly T[], rand: Rand): T {
  return items[Math.floor(rand() * items.length)];
}

/** The richest opponent, if they are at least level with us. */
export function leader(view: PlayerView): PublicPlayer | undefined {
  const rivals = opponents(view);
  const top = rivals.reduce((a, b) => (b.total > a.total ? b : a), rivals[0]);
  return top && top.total > 0 && top.total >= self(view).total ? top : undefined;
}

/** The best pick from a bank for a thief, and what it is worth under the current rules. */
export function bestSteal(bank: readonly Card[], view: PlayerView): { cardId: string; gain: number } {
  let best = { cardId: bank[0].id, gain: 0 };
  for (const card of bank) {
    const value = card.value ?? 0;
    const gain =
      view.rules.thiefSteals === 'matching_group' ? value * bank.filter((c) => c.value === value).length : value;
    if (gain > best.gain) best = { cardId: card.id, gain };
  }
  if (view.rules.thiefSteals === 'random_card') {
    best.gain = bank.reduce((sum, c) => sum + (c.value ?? 0), 0) / bank.length;
  }
  return best;
}

/**
 * Chance that `target` holds the defense against `kind`, estimated only from
 * what this player can see: its own hand, the discard pile and hand sizes.
 */
export function blockChance(view: PlayerView, kind: AttackKind, target: PublicPlayer): number {
  const defense = DEFENSE_FOR[kind];
  const known =
    view.hand.filter((c) => c.kind === defense).length + view.discardPile.filter((c) => c.kind === defense).length;
  const unseenDefenses = Math.max(0, SPECIAL_COPIES - known);
  const unseenCards = view.drawCount + opponents(view).reduce((sum, p) => sum + p.handCount, 0);
  if (unseenDefenses === 0 || target.handCount === 0 || unseenCards === 0) return 0;
  let noneHeld = 1;
  for (let i = 0; i < target.handCount; i++) {
    noneHeld *= Math.max(0, unseenCards - unseenDefenses - i) / (unseenCards - i);
  }
  return 1 - noneHeld;
}

/** How much the player wants to keep a card; the lowest score is discarded first. */
export function keepScore(card: Card, view: PlayerView): number {
  const copies = view.hand.filter((c) => c.kind === card.kind && c.value === card.value).length;
  switch (card.kind) {
    case 'money':
      return (card.value ?? 0) / 100 + (copies > 1 ? 1 : 0);
    case 'bankrupt':
      return 3.5;
    case 'bank_thief':
      return 3;
    default: {
      const hasBank = self(view).bank.length > 0;
      return (hasBank ? 2.6 : 1.8) - (copies > 1 ? 1.2 : 0);
    }
  }
}

export function leastUseful(cards: readonly Card[], view: PlayerView): Card {
  return cards.reduce((a, b) => (keepScore(b, view) < keepScore(a, view) ? b : a), cards[0]);
}
