// Casual AI (spec §14.1): banks pairs most of the time, robs a random bank,
// sometimes sits on Bankrupt waiting for a bigger target.

import type { PlayerView } from '../engine';
import { listOptions, pick, type Option, type Rand } from './common';

type Bank = Extract<Option, { type: 'bank' }>;
type Attack = Extract<Option, { type: 'attack' }>;
type Discard = Extract<Option, { type: 'discard' }>;

export function casualChoice(view: PlayerView, rand: Rand): Option {
  const options = listOptions(view);
  const banks = options.filter((o): o is Bank => o.type === 'bank');
  const attacks = options.filter((o): o is Attack => o.type === 'attack');
  const thefts = attacks.filter((o) => o.kind === 'bank_thief');
  const bankrupts = attacks.filter((o) => o.kind === 'bankrupt');
  const discards = options.filter((o): o is Discard => o.type === 'discard');

  if (banks.length > 0 && rand() < 0.85) return pick(banks, rand);
  if (thefts.length > 0 && rand() < 0.8) return pick(thefts, rand);
  if (bankrupts.length > 0) {
    const biggest = bankrupts.reduce((a, b) => (b.target.total > a.target.total ? b : a));
    const nothingElse = banks.length === 0 && thefts.length === 0;
    if (biggest.target.total >= 100 || nothingElse || rand() < 0.5) return biggest;
  }
  if (banks.length > 0) return pick(banks, rand);
  if (attacks.length > 0) return pick(attacks, rand);
  if (discards.length > 0) {
    const money = discards.filter((o) => o.card.kind === 'money');
    return pick(money.length > 0 ? money : discards, rand);
  }
  return { type: 'pass' };
}
