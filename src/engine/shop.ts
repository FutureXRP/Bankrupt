// The power-up shop (an optional rule). On your turn, before you act, you may
// spend money from your own bank on ONE power-up. Everything here is fictional
// in-game money: nothing is ever bought with real money.

import { sumMoney, type Card } from './cards';

export type ShopItemId = 'double_up' | 'big_heist' | 'insurance' | 'inside_tip' | 'overtime';

export type ShopItem = { id: ShopItemId; name: string; price: number; blurb: string };

export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: 'double_up',
    name: 'Double Up',
    price: 100,
    blurb: 'The match you bank this turn is worth double.',
  },
  {
    id: 'big_heist',
    name: 'Big Heist',
    price: 200,
    blurb: 'Your Bank Thief this turn steals the WHOLE bank, not one card. A Sheriff still stops it.',
  },
  {
    id: 'insurance',
    name: 'Insurance',
    price: 100,
    blurb: 'The next time you go bankrupt, you get half of it back.',
  },
  {
    id: 'inside_tip',
    name: 'Inside Tip',
    price: 25,
    blurb: 'Secretly peek at the top 3 cards of the deck.',
  },
  {
    id: 'overtime',
    name: 'Overtime',
    price: 100,
    blurb: 'Take another turn right after this one.',
  },
];

export const shopItem = (id: ShopItemId): ShopItem => SHOP_ITEMS.find((item) => item.id === id)!;

export const PEEK_COUNT = 3;

/** Power-ups bought this turn that have not been used up yet. */
export type TurnBuffs = { bought: boolean; doubleUp: boolean; heist: boolean; extraTurn: boolean };

export const noBuffs = (): TurnBuffs => ({ bought: false, doubleUp: false, heist: false, extraTurn: false });

/**
 * A bank is its money cards plus loose cash. Cash comes from doubled matches,
 * insurance payouts and change from shop purchases; it counts toward winning
 * and is lost to Bankrupt, but a normal Bank Thief can only take cards.
 */
export function bankTotal(player: { bank: readonly Card[]; bonus: number }): number {
  return sumMoney(player.bank) + player.bonus;
}
