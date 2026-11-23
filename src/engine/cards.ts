// Card definitions, counts and unique IDs (spec §2, §18.1).

export type MoneyValue = 5 | 25 | 50 | 100;
export type CardKind = 'money' | 'bankrupt' | 'vault_lock' | 'bank_thief' | 'sheriff' | 'bank_swap' | 'lawyer';
export type AttackKind = 'bankrupt' | 'bank_thief' | 'bank_swap';
export type DefenseKind = 'vault_lock' | 'sheriff' | 'lawyer';

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
  bank_swap: 'lawyer',
};

export const CARD_NAMES: Record<Exclude<CardKind, 'money'>, string> = {
  bankrupt: 'Bankrupt',
  vault_lock: 'Vault Lock',
  bank_thief: 'Bank Thief',
  sheriff: 'Sheriff',
  bank_swap: 'Bank Swap',
  lawyer: 'Lawyer',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** How many copies of each card a deck holds. Bankrupt is always six. */
/** swapCopies is the number of Bank Swap cards AND of the Lawyer cards that block them. */
export type DeckSize = { moneyCopies: number; specialCopies: number; swapCopies: number };

export const BASE_DECK: DeckSize = { moneyCopies: MONEY_COPIES, specialCopies: SPECIAL_COPIES, swapCopies: 0 };

/**
 * How many times the basic money / Vault Lock / Bank Thief / Sheriff cards are
 * used, by cards-per-player and then by table size. Bigger tables and bigger
 * hands empty the deck faster, and the game ends on the sixth Bankrupt, so the
 * deck grows to keep games a sensible length: roughly 14-16 rounds with 6 or
 * 10 cards each, and a quicker 12 or so with 8.
 * Every factor must keep 14x and 6x whole numbers.
 */
export const DECK_FACTORS: Record<number, Record<number, number>> = {
  6: { 2: 1, 3: 1.5, 4: 2 },
  8: { 2: 1, 3: 1.5, 4: 2 },
  10: { 2: 1.5, 3: 2, 4: 2.5 },
};

export const HAND_SIZES = [6, 8, 10] as const;
export type HandSize = (typeof HAND_SIZES)[number];

export function deckSizeFor(
  playerCount: number,
  scale: 'fixed' | 'by_players',
  bankSwapCards = 0,
  handSize = 10,
): DeckSize {
  const factor = scale === 'by_players' ? (DECK_FACTORS[handSize]?.[playerCount] ?? 1) : 1;
  return {
    moneyCopies: MONEY_COPIES * factor,
    specialCopies: SPECIAL_COPIES * factor,
    swapCopies: Math.round(bankSwapCards * factor),
  };
}

/**
 * Vault Locks (and Sheriffs) used in a 2-player game. The rule is written for
 * the basic deck (for example 4 of the 6) and scales with a bigger deck.
 */
export function twoPlayerDefenseCount(size: DeckSize, basicCopies: number): number {
  return Math.min(size.specialCopies, Math.round((basicCopies * size.specialCopies) / SPECIAL_COPIES));
}

export const deckCardCount = (size: DeckSize) =>
  MONEY_VALUES.length * size.moneyCopies + 3 * size.specialCopies + 2 * size.swapCopies + BANKRUPT_TOTAL;

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
  for (let i = 1; i <= size.swapCopies; i++) {
    deck.push({ id: `bank_swap-${pad(i)}`, kind: 'bank_swap' });
    deck.push({ id: `lawyer-${pad(i)}`, kind: 'lawyer' });
  }
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
