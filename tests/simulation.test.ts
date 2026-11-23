// Spec §22 tests 16, 17 and 20: honest AI, invariants after every action,
// and thousands of seeded games with no deadlock.

import { describe, expect, it } from 'vitest';
import { chooseForPhase } from '../src/ai';
import {
  actorId,
  applyAction,
  checkInvariants,
  createGame,
  getPlayerView,
  RULE_SETS,
  makeRng,
  maskStateFor,
  validateAction,
  type Difficulty,
  type GameState,
  type RuleConfig,
} from '../src/engine';

const LEVELS: Difficulty[] = ['casual', 'competitive', 'expert'];

function playGame(seed: number, playerCount: number, rules?: Partial<RuleConfig>): { state: GameState; steps: number } {
  const rand = makeRng(seed * 7919 + 1);
  let state = createGame({
    players: Array.from({ length: playerCount }, (_, i) => ({
      name: `Bot ${i + 1}`,
      isAI: true,
      difficulty: LEVELS[(seed + i) % LEVELS.length],
    })),
    seed,
    rules,
  });
  let steps = 0;
  while (state.phase !== 'finished') {
    if (++steps > 2000) throw new Error(`Seed ${seed}: game did not finish`);
    const id = actorId(state)!;
    const player = state.players.find((p) => p.id === id)!;
    const action = chooseForPhase(getPlayerView(state, id), player.difficulty!, rand);
    const problem = validateAction(state, action);
    if (problem) throw new Error(`Seed ${seed}: AI chose an illegal move (${problem})`);
    state = applyAction(state, action);
    const broken = checkInvariants(state);
    if (broken.length > 0) throw new Error(`Seed ${seed}: ${broken.join(' ')}`);
  }
  return { state, steps };
}

describe('AI fairness', () => {
  it('16. the AI view contains no rival hand cards and no deck order', () => {
    const state = createGame({
      players: [
        { name: 'A', isAI: true },
        { name: 'B', isAI: true },
        { name: 'C', isAI: true },
      ],
      seed: 99,
    });
    const view = getPlayerView(state, 'p1');
    const text = JSON.stringify(view);
    const hidden = [...state.players[1].hand, ...state.players[2].hand, ...state.drawPile];
    for (const card of hidden) expect(text).not.toContain(`"${card.id}"`);
    for (const card of state.players[0].hand) expect(text).toContain(`"${card.id}"`);
    expect(view.players.map((p) => p.handCount)).toEqual([6, 6, 6]);
    expect(view.drawCount).toBe(state.drawPile.length);
  });

  it('the copy of the game sent to an online guest hides every card that is not theirs', () => {
    const state = createGame({ players: [{ name: 'A', isAI: false }, { name: 'B', isAI: false }, { name: 'C', isAI: true }], seed: 4, rules: { ...RULE_SETS.piggy } });
    const sent = JSON.stringify(maskStateFor(state, 'p2'));
    for (const card of [...state.players[0].hand, ...state.players[2].hand, ...state.drawPile]) {
      expect(sent).not.toContain(`"${card.id}"`);
    }
    for (const card of state.players[1].hand) expect(sent).toContain(`"${card.id}"`);
    const masked = maskStateFor(state, 'p2');
    expect(masked.players.map((p) => p.hand.length)).toEqual([6, 6, 6]);
    expect(masked.drawPile).toHaveLength(state.drawPile.length);
    // A guest can still check their own moves against the masked copy.
    expect(validateAction(masked, { type: 'pass', playerId: 'p2' })).toBe(validateAction(state, { type: 'pass', playerId: 'p2' }));
  });

  it('gives every difficulty the same deal for the same seed', () => {
    const deal = (difficulty: Difficulty) =>
      createGame({
        players: [
          { name: 'A', isAI: false },
          { name: 'B', isAI: true, difficulty },
        ],
        seed: 5,
      }).players.map((p) => p.hand.map((c) => c.id));
    expect(deal('casual')).toEqual(deal('expert'));
  });
});

describe('simulated games', () => {
  it('17 + 20. 3,000 seeded games finish with every invariant intact', () => {
    let longest = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const { state, steps } = playGame(seed, 2 + (seed % 3));
      longest = Math.max(longest, steps);
      expect(state.winnerIds!.length).toBeGreaterThan(0);
      expect(state.bankruptDrawnCount).toBe(6);
    }
    expect(longest).toBeLessThan(1000);
  });

  it('rule variants also finish cleanly', () => {
    const variants: Partial<RuleConfig>[] = [
      RULE_SETS.original,
      { ...RULE_SETS.original, shop: true },
      { ...RULE_SETS.original, shop: true, bankSwapCards: 2 },
      { ...RULE_SETS.attack, bankSwapCards: 2 },
      { ...RULE_SETS.piggy, bankSwapCards: 2 },
      { ...RULE_SETS.piggy, shop: true },
      { ...RULE_SETS.attack, shop: true },
      { refillAfterDefense: false },
      RULE_SETS.piggy,
      RULE_SETS.attack,
      { bankruptMode: 'attack', endTrigger: 'final_circuit' },
      { bankruptMode: 'attack', endTrigger: 'immediate' },
      { endTrigger: 'final_circuit' },
      { turnStyle: 'bank_then_attack', discardOnlyWhenStuck: false },
      { stuckDiscardLimit: 6 },
      { thiefSteals: 'random_card' },
      { thiefSteals: 'matching_group' },
      { minBankSetSize: 1 },
      { discardOnlyWhenStuck: false },
      { endTrigger: 'immediate' },
    ];
    for (const rules of variants) {
      for (let seed = 1; seed <= 300; seed++) playGame(seed, 2 + (seed % 3), rules);
    }
  });
});
