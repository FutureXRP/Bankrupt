// Shared AI helpers. Everything here works from a PlayerView — public
// information plus the AI's own hand — never from the full game state.

import {
  DEFENSE_FOR,
  SPECIAL_COPIES,
  bankableValues,
  pileSavedFromBankrupt,
  sumMoney,
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
  | { type: 'discard'; cards: Card[] }
  | { type: 'end_turn' }
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
  if (view.bankedThisTurn > 0) {
    // Already banked this turn: the only other choices are an attack or stopping.
    options.push({ type: 'end_turn' });
    return options;
  }
  if (options.length === 0 || !view.rules.discardOnlyWhenStuck) {
    for (const card of view.hand) options.push({ type: 'discard', cards: [card] });
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
      return { type: 'discard', playerId, cardIds: option.cards.map((c) => c.id) };
    case 'end_turn':
      return { type: 'end_turn', playerId };
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

/** Dollars an unblocked Bankrupt would destroy in this bank under the current rules. */
export function bankruptLoss(target: PublicPlayer, view: PlayerView): number {
  return target.total - sumMoney(pileSavedFromBankrupt(target.bank, view.rules));
}

/**
 * Chance that `target` holds the defense against `kind`, estimated only from
 * what this player can see: its own hand, the discard pile and hand sizes.
 */
export function blockChance(view: PlayerView, kind: AttackKind, target: PublicPlayer): number {
  const defense = DEFENSE_FOR[kind];
  const known =
    view.hand.filter((c) => c.kind === defense).length + view.discardPile.filter((c) => c.kind === defense).length;
  const copies = view.players.length === 2 ? Math.min(SPECIAL_COPIES, view.rules.twoPlayerDefenseCopies) : SPECIAL_COPIES;
  const unseenDefenses = Math.max(0, copies - known);
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

/**
 * What a stuck player throws away. With "dump and redraw" rules this is every
 * low-value loose money card and spare defense, so the refill has a real chance
 * of making a pair; otherwise it is the single least useful card.
 */
export function chooseDiscards(view: PlayerView): Card[] {
  const worst = leastUseful(view.hand, view);
  if (view.rules.stuckDiscardLimit <= 1) return [worst];
  const dump = view.hand.filter((c) => keepScore(c, view) < DUMP_BELOW);
  const chosen = dump.length > 0 ? dump : [worst];
  return chosen.slice(0, view.rules.stuckDiscardLimit);
}
export const DUMP_BELOW = 0.6;

export function leastUseful(cards: readonly Card[], view: PlayerView): Card {
  return cards.reduce((a, b) => (keepScore(b, view) < keepScore(a, view) ? b : a), cards[0]);
}
