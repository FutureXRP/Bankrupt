// When the computer players spend money in the shop. They see only what a human
// in their seat would see (their own hand, public banks, the rules).

import { shopItem, type Difficulty, type PlayerView, type ShopItemId } from '../engine';
import { blockChance, listOptions, opponents, self, type Option, type Rand } from './common';

type Bank = Extract<Option, { type: 'bank' }>;

/** The power-up worth buying right now, or null to keep the money. */
export function shopPurchase(view: PlayerView, difficulty: Difficulty, rand: Rand): ShopItemId | null {
  if (!view.rules.shop || view.buffs.bought || view.bankedThisTurn > 0) return null;
  // Casual players only wander into the shop now and then.
  if (difficulty === 'casual' && rand() > 0.35) return null;

  const me = self(view);
  const canAfford = (id: ShopItemId) => me.total >= shopItem(id).price;
  const banks = listOptions(view)
    .filter((o): o is Bank => o.type === 'bank')
    .sort((a, b) => b.amount - a.amount);
  const hasThief = view.hand.some((c) => c.kind === 'bank_thief');
  const richest = opponents(view).reduce((a, b) => (b.total > a.total ? b : a));

  // Big Heist: only for a bank worth much more than the price, and not a likely block.
  if (hasThief && canAfford('big_heist') && richest.total >= 450) {
    const risk = difficulty === 'expert' ? blockChance(view, 'bank_thief', richest) : 0.5;
    if (richest.total * (1 - risk) >= 300) return 'big_heist';
  }
  // Double Up: when the best match is worth clearly more than the price.
  if (banks.length > 0 && canAfford('double_up') && banks[0].amount >= 150) return 'double_up';
  // Overtime: two good matches in hand, so bank both this round.
  if (banks.length >= 2 && canAfford('overtime') && banks[1].amount >= 150) return 'overtime';
  // Insurance: a big bank with no Vault Lock to protect it.
  const exposed = !view.hand.some((c) => c.kind === 'vault_lock');
  if (!me.insured && exposed && canAfford('insurance') && me.total >= 400) return 'insurance';
  return null;
}

/** After buying, make sure the power-up is actually used this turn. */
export function followThrough(view: PlayerView): Option | null {
  const options = listOptions(view);
  if (view.buffs.doubleUp) {
    const banks = options.filter((o): o is Bank => o.type === 'bank');
    if (banks.length > 0) return banks.reduce((a, b) => (b.amount > a.amount ? b : a));
  }
  if (view.buffs.heist) {
    const heists = options.filter(
      (o): o is Extract<Option, { type: 'attack' }> => o.type === 'attack' && o.kind === 'bank_thief',
    );
    if (heists.length > 0) return heists.reduce((a, b) => (b.target.total > a.target.total ? b : a));
  }
  return null;
}
