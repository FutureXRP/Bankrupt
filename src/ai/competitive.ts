// Competitive AI (spec §14.2): scores every legal move by what it banks, how much
// it hurts the leader, and whether a big attack is worth spending.

import type { PlayerView } from '../engine';
import { bankruptLoss, bestSteal, leader, chooseDiscards, listOptions, type Option, type Rand } from './common';

export function scoreOption(view: PlayerView, option: Option): number {
  const top = leader(view);
  switch (option.type) {
    case 'bank':
      return option.amount;
    case 'attack': {
      const isLeader = top?.id === option.target.id;
      if (option.kind === 'bank_thief') {
        const { gain } = bestSteal(option.target.bank, view);
        return gain + gain * (isLeader ? 1 : 0.4); // our gain plus their loss
      }
      const total = bankruptLoss(option.target, view);
      const worthIt = total >= 100 ? 1 : 0.3; // save Bankrupt for worthwhile banks
      return total * (isLeader ? 0.9 : 0.5) * worthIt;
    }
    default:
      return -1;
  }
}

export function competitiveChoice(view: PlayerView, _rand: Rand): Option {
  const options = listOptions(view);
  const plays = options.filter((o) => o.type === 'bank' || o.type === 'attack');
  if (plays.length > 0) {
    return plays.reduce((a, b) => (scoreOption(view, b) > scoreOption(view, a) ? b : a));
  }
  if (view.hand.length > 0) return { type: 'discard', cards: chooseDiscards(view) };
  return { type: 'pass' };
}
