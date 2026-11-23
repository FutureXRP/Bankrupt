// Card definitions, counts and unique IDs (spec §2, §18.1).

export type MoneyValue = 5 | 25 | 50 | 100;
export type CardKind = 'money' | 'bankrupt' | 'vault_lock' | 'bank_thief' | 'sheriff' | 'bank_swap';
export type AttackKind = 'bankrupt' | 'bank_thief' | 'bank_swap';
export type DefenseKind = 'vault_lock' | 'sheriff';

export type Card = {
  id: string; // unique per physical card, e.g. "money100-07"
  kind: CardKind;
  value?: MoneyValue; // present only for money
};

export const MONEY_VALUES: readonly MoneyValue[] = [5, 25, 50, 100];
export const MONEY_COPIES = 14;
export const SPECIAL_KINDS = ['bankrupt', 'vault_lock', 'bank_thief', 'sheriff'] as const;
export const SPECIAL_COPIES = 6;
export const BANKRUPT_TOTAL = 6;
export const TOTAL_CARDS = 80;
export const TOTAL_MONEY_VALUE = 2520;

/** Which defense stops which attack. */
export const DEFENSE_FOR: Record<AttackKind, DefenseKind> = {
  bankrupt: 'vault_lock',
  bank_thief: 'sheriff',
  bank_swap: 'sheriff',
};

export const CARD_NAMES: Record<Exclude<CardKind, 'money'>, string> = {
  bankrupt: 'Bankrupt',
  vault_lock: 'Vault Lock',
  bank_thief: 'Bank Thief',
  sheriff: 'Sheriff',
  bank_swap: 'Bank Swap',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** How many copies of each card a deck holds. Bankrupt is always six. */
export type DeckSize = { moneyCopies: number; specialCopies: number; swapCopies: number };

export const BASE_DECK: DeckSize = { moneyCopies: MONEY_COPIES, specialCopies: SPECIAL_COPIES, swapCopies: 0 };

/** Bigger tables use a bigger deck so the game lasts about as long for everyone. */
export function deckSizeFor(playerCount: number, scale: 'fixed' | 'by_players', bankSwapCards = 0): DeckSize {
  const factor = scale === 'by_players' ? (playerCount >= 4 ? 2 : playerCount === 3 ? 1.5 : 1) : 1;
  return {
    moneyCopies: MONEY_COPIES * factor,
    specialCopies: SPECIAL_COPIES * factor,
    swapCopies: Math.round(bankSwapCards * factor),
  };
}

export const deckCardCount = (size: DeckSize) =>
  MONEY_VALUES.length * size.moneyCopies + 3 * size.specialCopies + size.swapCopies + BANKRUPT_TOTAL;

export const deckMoneyValue = (size: DeckSize) =>
  MONEY_VALUES.reduce((sum, v) => sum + v, 0) * size.moneyCopies;

/** A full deck in a fixed, unshuffled order. The basic deck is 80 cards. */
export function buildDeck(size: DeckSize = BASE_DECK): Card[] {
  const deck: Card[] = [];
  for (const value of MONEY_VALUES) {
    for (let i = 1; i <= size.moneyCopies; i++) {
      deck.push({ id: `money${value}-${pad(i)}`, kind: 'money', value });
    }
  }
  for (const kind of SPECIAL_KINDS) {
    const copies = kind === 'bankrupt' ? BANKRUPT_TOTAL : size.specialCopies;
    for (let i = 1; i <= copies; i++) {
      deck.push({ id: `${kind}-${pad(i)}`, kind });
    }
  }
  for (let i = 1; i <= size.swapCopies; i++) deck.push({ id: `bank_swap-${pad(i)}`, kind: 'bank_swap' });
  return deck;
}

export function cardName(card: Card): string {
  return card.kind === 'money' ? `$${card.value}` : CARD_NAMES[card.kind];
}

export function sumMoney(cards: readonly Card[]): number {
  let total = 0;
  for (const c of cards) total += c.value ?? 0;
  return total;
}

export function isAttackKind(kind: CardKind): kind is AttackKind {
  return kind === 'bankrupt' || kind === 'bank_thief' || kind === 'bank_swap';
}
