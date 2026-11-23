// Expert AI (spec §14.3): weighs each attack by the chance it gets blocked
// (estimated from unseen cards) and, in the Final Round, plays for the lead.

import type { PlayerView } from '../engine';
import {
  bestSteal,
  blockChance,
  leastUseful,
  listOptions,
  opponents,
  self,
  type Option,
  type Rand,
} from './common';
import { scoreOption } from './competitive';

/** Our lead over the best rival if `option` works (or the current lead if it is blocked). */
function expectedLead(view: PlayerView, option: Option): number {
  const me = self(view).total;
  const rivals = opponents(view);
  const lead = (mine: number, changed?: { id: string; total: number }) =>
    mine - Math.max(...rivals.map((r) => (changed && r.id === changed.id ? changed.total : r.total)));
  const now = lead(me);

  if (option.type === 'bank') return lead(me + option.amount);
  if (option.type !== 'attack') return now;

  const chance = 1 - blockChance(view, option.kind, option.target);
  if (option.kind === 'bankrupt') {
    return chance * lead(me, { id: option.target.id, total: 0 }) + (1 - chance) * now;
  }
  const { gain } = bestSteal(option.target.bank, view);
  const after = lead(me + gain, { id: option.target.id, total: option.target.total - gain });
  return chance * after + (1 - chance) * now;
}

export function expertChoice(view: PlayerView, rand: Rand): Option {
  const options = listOptions(view);
  const plays = options.filter((o) => o.type === 'bank' || o.type === 'attack');
  if (plays.length === 0) {
    if (view.hand.length > 0) return { type: 'discard', card: leastUseful(view.hand, view) };
    return { type: 'pass' };
  }

  const jitter = () => 1 + (rand() - 0.5) * 0.06; // small variation so play is not identical every game
  const value = (option: Option): number => {
    if (view.finalRound) return expectedLead(view, option) * 1000 + scoreOption(view, option);
    const base = scoreOption(view, option);
    const lands = option.type === 'attack' ? 1 - blockChance(view, option.kind, option.target) : 1;
    return base * lands * jitter();
  };

  let best = plays[0];
  let bestValue = value(best);
  for (const option of plays.slice(1)) {
    const v = value(option);
    if (v > bestValue) {
      best = option;
      bestValue = v;
    }
  }
  return best;
}
