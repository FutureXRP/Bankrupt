// Core invariants (spec §18.3). Returns a list of problems; empty means healthy.

import { BANKRUPT_TOTAL, TOTAL_CARDS, TOTAL_MONEY_VALUE, buildDeck, sumMoney } from './cards';
import type { GameState } from './state';

const KNOWN_IDS = new Set(buildDeck().map((c) => c.id));

export function checkInvariants(state: GameState): string[] {
  const problems: string[] = [];
  const zones = [state.drawPile, state.discardPile, ...state.players.flatMap((p) => [p.hand, p.bank])];
  const all = zones.flat();

  const seen = new Set<string>();
  for (const card of all) {
    if (!KNOWN_IDS.has(card.id)) problems.push(`Unknown card ${card.id}.`);
    if (seen.has(card.id)) problems.push(`Card ${card.id} is in two places.`);
    seen.add(card.id);
  }
  if (all.length !== TOTAL_CARDS) problems.push(`Expected ${TOTAL_CARDS} cards, found ${all.length}.`);
  if (sumMoney(all) !== TOTAL_MONEY_VALUE) problems.push(`Money total is $${sumMoney(all)}.`);

  for (const p of state.players) {
    if (p.bank.some((c) => c.kind !== 'money')) problems.push(`${p.name}'s bank holds a non-money card.`);
    if (p.hand.length > state.rules.handSize) problems.push(`${p.name} holds ${p.hand.length} cards.`);
  }

  const bankruptsInDeck = state.drawPile.filter((c) => c.kind === 'bankrupt').length;
  if (state.bankruptDrawnCount < 0 || state.bankruptDrawnCount > BANKRUPT_TOTAL) {
    problems.push(`Bankrupt counter is ${state.bankruptDrawnCount}.`);
  }
  if (state.bankruptDrawnCount !== BANKRUPT_TOTAL - bankruptsInDeck) {
    problems.push('Bankrupt counter does not match the cards drawn from the deck.');
  }

  if ((state.phase === 'reaction' || state.phase === 'theft_selection') !== !!state.pendingAttack) {
    problems.push('Pending attack does not match the phase.');
  }
  if (state.currentPlayerIndex < 0 || state.currentPlayerIndex >= state.players.length) {
    problems.push('Current player index is out of range.');
  }
  return problems;
}
