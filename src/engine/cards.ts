// Card definitions, counts and unique IDs (spec §2, §18.1).

export type MoneyValue = 5 | 25 | 50 | 100;
export type CardKind = 'money' | 'bankrupt' | 'vault_lock' | 'bank_thief' | 'sheriff';
export type AttackKind = 'bankrupt' | 'bank_thief';
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
};

export const CARD_NAMES: Record<Exclude<CardKind, 'money'>, string> = {
  bankrupt: 'Bankrupt',
  vault_lock: 'Vault Lock',
  bank_thief: 'Bank Thief',
  sheriff: 'Sheriff',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** The full 80-card deck in a fixed, unshuffled order. */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const value of MONEY_VALUES) {
    for (let i = 1; i <= MONEY_COPIES; i++) {
      deck.push({ id: `money${value}-${pad(i)}`, kind: 'money', value });
    }
  }
  for (const kind of SPECIAL_KINDS) {
    for (let i = 1; i <= SPECIAL_COPIES; i++) {
      deck.push({ id: `${kind}-${pad(i)}`, kind });
    }
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
  return kind === 'bankrupt' || kind === 'bank_thief';
}
