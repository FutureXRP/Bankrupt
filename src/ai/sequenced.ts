// AI for "bank_then_attack" turns: bank every matching set, then decide whether
// one attack is worth playing, otherwise stop (or discard if nothing was done).

import type { Difficulty, PlayerView } from '../engine';
import { blockChance, chooseDiscards, listOptions, pick, type Option, type Rand } from './common';
import { scoreOption } from './competitive';
import { expectedLead } from './expert';

type Bank = Extract<Option, { type: 'bank' }>;
type Attack = Extract<Option, { type: 'attack' }>;
type Discard = Extract<Option, { type: 'discard' }>;

/** Is the game close enough to the end that a held Bankrupt should be used now? */
const lateGame = (view: PlayerView) => !!view.finalRound || view.bankruptDrawnCount >= 5;

function chooseAttack(view: PlayerView, attacks: Attack[], difficulty: Difficulty, rand: Rand): Attack | undefined {
  if (attacks.length === 0) return undefined;
  const thefts = attacks.filter((o) => o.kind === 'bank_thief');
  const bankrupts = attacks.filter((o) => o.kind === 'bankrupt');

  if (difficulty === 'casual') {
    if (thefts.length > 0 && rand() < 0.8) return pick(thefts, rand);
    if (bankrupts.length > 0) {
      const biggest = bankrupts.reduce((a, b) => (b.target.total > a.target.total ? b : a));
      if (biggest.target.total >= 100 || rand() < 0.4) return biggest;
    }
    return undefined;
  }

  // Bankrupt is saved for a bank worth wiping out, unless time is running short.
  const worthwhile = [...thefts, ...bankrupts.filter((o) => o.target.total >= 100 || lateGame(view))];
  if (worthwhile.length === 0) return undefined;

  const value = (option: Attack): number => {
    if (difficulty === 'competitive') return scoreOption(view, option);
    if (view.finalRound) return expectedLead(view, option) * 1000 + scoreOption(view, option);
    return scoreOption(view, option) * (1 - blockChance(view, option.kind, option.target)) * (1 + (rand() - 0.5) * 0.06);
  };
  return worthwhile.reduce((a, b) => (value(b) > value(a) ? b : a));
}

export function sequencedChoice(view: PlayerView, difficulty: Difficulty, rand: Rand): Option {
  const options = listOptions(view);
  const banks = options.filter((o): o is Bank => o.type === 'bank');
  const attacks = options.filter((o): o is Attack => o.type === 'attack');
  const discards = options.filter((o): o is Discard => o.type === 'discard');
  const canEnd = options.some((o) => o.type === 'end_turn');

  if (banks.length > 0 && (difficulty !== 'casual' || rand() < 0.9)) {
    return banks.reduce((a, b) => (b.amount > a.amount ? b : a));
  }
  const attack = chooseAttack(view, attacks, difficulty, rand);
  if (attack) return attack;
  if (canEnd) return { type: 'end_turn' };
  if (banks.length > 0) return banks[0];
  if (discards.length > 0) {
    if (difficulty !== 'casual') return { type: 'discard', cards: chooseDiscards(view) };
    const money = discards.filter((o) => o.cards[0].kind === 'money');
    return pick(money.length > 0 ? money : discards, rand);
  }
  return { type: 'pass' };
}
