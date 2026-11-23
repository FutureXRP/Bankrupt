// Test helpers for arranging exact hands, banks and deck order.

import {
  BANKRUPT_TOTAL,
  createGame,
  sumMoney,
  type Card,
  type GameState,
  type RuleConfig,
} from '../src/engine';

const NAMES = ['Ava', 'Ben', 'Chloe', 'Dev'];

/** A game where every hand has been put back in the deck, ready to be arranged. Player 0 is up. */
export function blankGame(playerCount = 3, rules?: Partial<RuleConfig>): GameState {
  const s = createGame({
    players: NAMES.slice(0, playerCount).map((name) => ({ name, isAI: false })),
    seed: 12345,
    rules,
    dealerIndex: playerCount - 1,
  });
  for (const p of s.players) {
    s.drawPile.push(...p.hand);
    p.hand = [];
  }
  // Bankrupt cards go to the bottom so ordinary refills never hit one by accident.
  s.drawPile.sort((a, b) => Number(b.kind === 'bankrupt') - Number(a.kind === 'bankrupt'));
  return s;
}

const matches = (card: Card, spec: string) =>
  spec.startsWith('$') ? card.kind === 'money' && card.value === Number(spec.slice(1)) : card.kind === spec;

function takeFromDeck(s: GameState, spec: string): Card {
  const index = s.drawPile.findIndex((c) => matches(c, spec));
  if (index < 0) throw new Error(`No ${spec} left in the deck`);
  return s.drawPile.splice(index, 1)[0];
}

/** Keep the counter consistent with how many Bankrupt cards have left the deck. */
function sync(s: GameState) {
  s.bankruptDrawnCount = BANKRUPT_TOTAL - s.drawPile.filter((c) => c.kind === 'bankrupt').length;
}

/** Move cards from the deck into a player's hand or bank. Specs: '$100', 'bankrupt', 'sheriff'… */
export function give(s: GameState, playerIndex: number, zone: 'hand' | 'bank', ...specs: string[]) {
  for (const spec of specs) s.players[playerIndex][zone].push(takeFromDeck(s, spec));
  sync(s);
}

/** Put cards on top of the deck; the first spec is the first card drawn. */
export function stackTop(s: GameState, ...specs: string[]) {
  const cards = specs.map((spec) => takeFromDeck(s, spec));
  s.drawPile.push(...cards.reverse());
}

export const total = (s: GameState, playerIndex: number) => sumMoney(s.players[playerIndex].bank);

export const handIds = (s: GameState, playerIndex: number, spec: string) =>
  s.players[playerIndex].hand.filter((c) => matches(c, spec)).map((c) => c.id);

/** The first spec's reading of Bankrupt (a card played on opponents), kept as a variant. */
export const ATTACK_RULES: Partial<RuleConfig> = { bankruptMode: 'attack', endTrigger: 'final_circuit' };
