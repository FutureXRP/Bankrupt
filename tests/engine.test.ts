// Acceptance tests from spec §22. Test numbers match the spec's list.

import { describe, expect, it } from 'vitest';
import {
  MONEY_VALUES,
  RULE_SETS,
  RuleError,
  SPECIAL_KINDS,
  TOTAL_MONEY_VALUE,
  applyAction,
  buildDeck,
  checkInvariants,
  createGame,
  scoreGame,
  sumMoney,
  validateAction,
} from '../src/engine';
import { blankGame, give, handIds, stackTop, total } from './helpers';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isAI: false }));

describe('deck and setup', () => {
  it('1. has 14 of each money value and 6 of each special card', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(80);
    expect(new Set(deck.map((c) => c.id)).size).toBe(80);
    for (const value of MONEY_VALUES) {
      expect(deck.filter((c) => c.kind === 'money' && c.value === value)).toHaveLength(14);
    }
    for (const kind of SPECIAL_KINDS) expect(deck.filter((c) => c.kind === kind)).toHaveLength(6);
    expect(sumMoney(deck)).toBe(TOTAL_MONEY_VALUE);
  });

  it('2. deals 4 × 6 cards with no Bankrupt in any starting hand', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = createGame({ players: seats(4), seed });
      for (const p of s.players) {
        expect(p.hand).toHaveLength(6);
        expect(p.hand.some((c) => c.kind === 'bankrupt')).toBe(false);
      }
    }
  });

  it('3. shuffles all 6 Bankrupt cards into the remaining deck with no duplicates', () => {
    const s = createGame({ players: seats(4), seed: 7 });
    expect(s.drawPile).toHaveLength(80 - 24);
    expect(s.drawPile.filter((c) => c.kind === 'bankrupt')).toHaveLength(6);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('uses the seed: same seed gives the same deal, different seeds differ', () => {
    const a = createGame({ players: seats(3), seed: 42 });
    const b = createGame({ players: seats(3), seed: 42 });
    const c = createGame({ players: seats(3), seed: 43 });
    expect(a.drawPile.map((x) => x.id)).toEqual(b.drawPile.map((x) => x.id));
    expect(a.drawPile.map((x) => x.id)).not.toEqual(c.drawPile.map((x) => x.id));
  });

  it('starts with the player to the dealer’s left', () => {
    const s = createGame({ players: seats(4), seed: 1, dealerIndex: 3 });
    expect(s.currentPlayerIndex).toBe(0);
  });
});

describe('banking', () => {
  it('4. banking 3 × $50 raises the bank by $150', () => {
    let s = blankGame();
    give(s, 0, 'hand', '$50', '$50', '$50', '$5');
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$50') });
    expect(total(s, 0)).toBe(150);
    expect(s.players[0].stats.largestBank).toBe(150);
    expect(s.currentPlayerIndex).toBe(1);
  });

  it('5. rejects banking $25 and $50 together', () => {
    const s = blankGame();
    give(s, 0, 'hand', '$25', '$50');
    const action = { type: 'bank' as const, playerId: 'p1', cardIds: s.players[0].hand.map((c) => c.id) };
    expect(validateAction(s, action)).toMatch(/same value/);
    expect(() => applyAction(s, action)).toThrow(RuleError);
  });

  it('rejects banking a single card under the default rules', () => {
    const s = blankGame();
    give(s, 0, 'hand', '$100');
    expect(validateAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$100') })).not.toBeNull();
  });
});

describe('Bankrupt and Vault Lock', () => {
  const setup = () => {
    const s = blankGame();
    give(s, 0, 'hand', 'bankrupt');
    give(s, 1, 'bank', '$100', '$50', '$25'); // $175
    return s;
  };

  it('6. an unblocked Bankrupt empties a $175 bank', () => {
    let s = setup();
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bankrupt')[0], targetId: 'p2' });
    expect(total(s, 1)).toBe(0);
    expect(total(s, 0)).toBe(0); // the money is destroyed, not transferred
    expect(s.discardPile.filter((c) => c.kind === 'money')).toHaveLength(3);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('7 + 18. Vault Lock saves the bank and both cards are spent exactly once', () => {
    let s = setup();
    give(s, 1, 'hand', 'vault_lock', 'sheriff');
    const attackId = handIds(s, 0, 'bankrupt')[0];
    const lockId = handIds(s, 1, 'vault_lock')[0];
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: attackId, targetId: 'p2' });
    expect(s.phase).toBe('reaction');
    // Sheriff cannot block Bankrupt.
    expect(validateAction(s, { type: 'defend', playerId: 'p2', cardId: handIds(s, 1, 'sheriff')[0] })).not.toBeNull();
    s = applyAction(s, { type: 'defend', playerId: 'p2', cardId: lockId });
    expect(total(s, 1)).toBe(175);
    expect(s.discardPile.filter((c) => c.id === attackId)).toHaveLength(1);
    expect(s.discardPile.filter((c) => c.id === lockId)).toHaveLength(1);
    expect(s.players[0].stats).toMatchObject({ bankruptPlayed: 1, bankruptBlocked: 1 });
    expect(s.currentPlayerIndex).toBe(1); // the attacker's turn is over
    expect(checkInvariants(s)).toEqual([]);
  });

  it('cannot target yourself or an empty bank', () => {
    const s = setup();
    const cardId = handIds(s, 0, 'bankrupt')[0];
    expect(validateAction(s, { type: 'attack', playerId: 'p1', cardId, targetId: 'p1' })).not.toBeNull();
    expect(validateAction(s, { type: 'attack', playerId: 'p1', cardId, targetId: 'p3' })).not.toBeNull();
  });
});

describe('Bank Thief and Sheriff', () => {
  const setup = () => {
    const s = blankGame();
    give(s, 0, 'hand', 'bank_thief');
    give(s, 1, 'bank', '$100', '$25'); // $125
    return s;
  };

  it('8. stealing $100 from a $125 bank leaves $25 and gives the thief $100', () => {
    let s = setup();
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bank_thief')[0], targetId: 'p2' });
    expect(s.phase).toBe('theft_selection');
    const hundred = s.players[1].bank.find((c) => c.value === 100)!;
    s = applyAction(s, { type: 'steal', playerId: 'p1', cardId: hundred.id });
    expect(total(s, 1)).toBe(25);
    expect(total(s, 0)).toBe(100);
  });

  it('9 + 18. Sheriff cancels the theft and bank totals do not change', () => {
    let s = setup();
    give(s, 1, 'hand', 'sheriff');
    const thiefId = handIds(s, 0, 'bank_thief')[0];
    const sheriffId = handIds(s, 1, 'sheriff')[0];
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: thiefId, targetId: 'p2' });
    s = applyAction(s, { type: 'defend', playerId: 'p2', cardId: sheriffId });
    expect([total(s, 0), total(s, 1), total(s, 2)]).toEqual([0, 125, 0]);
    expect(s.discardPile.map((c) => c.id).sort()).toEqual([thiefId, sheriffId].sort());
    // The defender does not refill until the end of their own turn.
    expect(s.players[1].hand).toHaveLength(0);
  });

  it('takes the only card automatically, leaving the victim at $0', () => {
    let s = blankGame();
    give(s, 0, 'hand', 'bank_thief');
    give(s, 1, 'bank', '$50');
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bank_thief')[0], targetId: 'p2' });
    expect(total(s, 1)).toBe(0);
    expect(total(s, 0)).toBe(50);
  });

  it('a defender may decline to block', () => {
    let s = setup();
    give(s, 1, 'hand', 'sheriff');
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bank_thief')[0], targetId: 'p2' });
    s = applyAction(s, { type: 'defend', playerId: 'p2', cardId: null });
    expect(s.phase).toBe('theft_selection');
  });
});

describe('discarding, drawing and the countdown', () => {
  it('only allows a discard when nothing else is legal, then refills by one', () => {
    let s = blankGame();
    give(s, 0, 'hand', '$5', '$25', '$50', '$100', 'sheriff', 'bankrupt'); // no pair, no bank to attack
    stackTop(s, '$5');
    const five = handIds(s, 0, '$5')[0];
    s = applyAction(s, { type: 'discard', playerId: 'p1', cardIds: [five] });
    expect(s.players[0].hand).toHaveLength(6);
    expect(s.discardPile.map((c) => c.id)).toEqual([five]);

    const t = blankGame();
    give(t, 0, 'hand', '$5', '$5', 'sheriff');
    expect(validateAction(t, { type: 'discard', playerId: 'p1', cardIds: handIds(t, 0, 'sheriff') })).toMatch(
      /no other move/,
    );
  });

  it('10–12. five Bankrupt draws do nothing; the sixth schedules one final turn each', () => {
    let s = blankGame(3);
    give(s, 0, 'hand', '$5', '$5');
    give(s, 1, 'hand', '$25', '$25', '$5', '$50', '$100', 'sheriff');
    give(s, 2, 'hand', '$50', '$50', '$5', '$25', '$100', 'sheriff');
    stackTop(s, 'bankrupt', 'bankrupt', 'bankrupt', 'bankrupt', 'bankrupt', '$100', 'bankrupt', '$5', '$5', '$5', '$5');

    // Ava banks two cards and draws six: five Bankrupt cards and a $100.
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(s.bankruptDrawnCount).toBe(5);
    expect(s.finalRound).toBeUndefined();

    // Ben banks two and draws two, including the sixth Bankrupt.
    s = applyAction(s, { type: 'bank', playerId: 'p2', cardIds: handIds(s, 1, '$25') });
    expect(s.bankruptDrawnCount).toBe(6);
    expect(s.finalRound).toEqual({ triggeredByPlayerId: 'p2', turnsRemaining: 3 });
    expect(s.players[1].hand).toHaveLength(6); // the refill finished before the finale began
    expect(s.currentPlayerIndex).toBe(2);

    // Final circuit: Chloe, Ava, then Ben (who drew the sixth) goes last.
    s = applyAction(s, { type: 'bank', playerId: 'p3', cardIds: handIds(s, 2, '$50') });
    expect(s.phase).toBe('action');
    s = applyAction(s, {
      type: 'attack',
      playerId: 'p1',
      cardId: handIds(s, 0, 'bankrupt')[0],
      targetId: 'p3',
    });
    expect(s.bankruptDrawnCount).toBe(6); // a discarded Bankrupt does not change the counter
    expect(s.phase).toBe('action');
    s = applyAction(s, {
      type: 'attack',
      playerId: 'p2',
      cardId: handIds(s, 1, 'bankrupt')[0],
      targetId: 'p1',
    });
    expect(s.phase).toBe('finished');
    expect(s.winnerIds).toEqual(['p2']); // Ben keeps his $50
    expect(checkInvariants(s)).toEqual([]);
  });

  it('can end at once on the sixth Bankrupt when that variant is chosen', () => {
    let s = blankGame(2, { endTrigger: 'immediate' });
    give(s, 0, 'hand', '$5', '$5');
    stackTop(s, 'bankrupt', 'bankrupt', 'bankrupt', 'bankrupt', 'bankrupt', 'bankrupt');
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(s.phase).toBe('finished');
  });

  it('13. an empty deck is never refilled from the discard pile', () => {
    let s = blankGame(2);
    give(s, 0, 'hand', '$5', '$5', '$25');
    s.discardPile.push(...s.drawPile.splice(0)); // everything else has been used up
    s.bankruptDrawnCount = 6;
    s.finalRound = { triggeredByPlayerId: 'p2', turnsRemaining: 2 };
    const discards = s.discardPile.length;
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(s.drawPile).toHaveLength(0);
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.discardPile).toHaveLength(discards);
    // Ben has no cards and no deck: he passes, and the game ends.
    s = applyAction(s, { type: 'pass', playerId: 'p2' });
    expect(s.phase).toBe('finished');
  });

  it('14. a hand never grows past six cards', () => {
    let s = blankGame();
    give(s, 0, 'hand', '$5', '$5', '$25', '$50', '$100', 'sheriff');
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(s.players[0].hand).toHaveLength(6);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('scoring', () => {
  it('15. breaks ties by banked card count, then shares the win', () => {
    const s = blankGame(3);
    give(s, 0, 'bank', '$50', '$50'); // $100 in 2 cards
    give(s, 1, 'bank', '$25', '$25', '$25', '$25'); // $100 in 4 cards
    give(s, 2, 'bank', '$5');
    expect(scoreGame(s).winnerIds).toEqual(['p2']);

    const t = blankGame(3);
    give(t, 0, 'bank', '$50', '$50');
    give(t, 1, 'bank', '$50', '$50');
    const result = scoreGame(t);
    expect(result.winnerIds).toEqual(['p1', 'p2']);
    expect(result.standings.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(scoreGame(t)).toEqual(result); // deterministic
  });

  it('counts only banked money, not cards in hand', () => {
    const s = blankGame(2);
    give(s, 0, 'hand', '$100', '$100', '$100');
    give(s, 1, 'bank', '$5', '$5');
    expect(scoreGame(s).winnerIds).toEqual(['p2']);
  });
});

describe('rule variants (spec §25)', () => {
  it('matching_group theft takes every card of the chosen value', () => {
    let s = blankGame(2, { thiefSteals: 'matching_group' });
    give(s, 0, 'hand', 'bank_thief');
    give(s, 1, 'bank', '$50', '$50', '$50', '$5');
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bank_thief')[0], targetId: 'p2' });
    s = applyAction(s, { type: 'steal', playerId: 'p1', cardId: s.players[1].bank[0].id });
    expect([total(s, 0), total(s, 1)]).toEqual([150, 5]);
  });

  it('single cards can be banked when minBankSetSize is 1', () => {
    let s = blankGame(2, { minBankSetSize: 1 });
    give(s, 0, 'hand', '$100');
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$100') });
    expect(total(s, 0)).toBe(100);
  });
});

describe('Piggy Bank rule set', () => {
  it('Bankrupt leaves the victim their smallest pile', () => {
    let s = blankGame(3, RULE_SETS.piggy);
    give(s, 0, 'hand', 'bankrupt');
    give(s, 1, 'bank', '$100', '$100', '$25', '$25', '$5', '$5', '$5'); // piles worth $200, $50, $15
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bankrupt')[0], targetId: 'p2' });
    expect(total(s, 1)).toBe(15);
    expect(s.players[1].bank.every((c) => c.value === 5)).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('a one-pile bank is still wiped out completely', () => {
    let s = blankGame(3, RULE_SETS.piggy);
    give(s, 0, 'hand', 'bankrupt');
    give(s, 1, 'bank', '$50', '$50', '$50');
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bankrupt')[0], targetId: 'p2' });
    expect(total(s, 1)).toBe(0);
  });

  it('keeps the lower denomination when two piles are worth the same', () => {
    let s = blankGame(3, RULE_SETS.piggy);
    give(s, 0, 'hand', 'bankrupt');
    give(s, 1, 'bank', '$50', '$25', '$25'); // $50 and $50
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bankrupt')[0], targetId: 'p2' });
    expect(s.players[1].bank.map((c) => c.value)).toEqual([25, 25]);
  });

  it('a 2-player game leaves 2 Vault Locks and 2 Sheriffs in the box', () => {
    const two = createGame({ players: seats(2), seed: 3, rules: RULE_SETS.piggy });
    expect(two.removed.map((c) => c.kind).sort()).toEqual(['sheriff', 'sheriff', 'vault_lock', 'vault_lock']);
    const inPlay = [...two.drawPile, ...two.players.flatMap((p) => p.hand)];
    expect(inPlay).toHaveLength(76);
    expect(inPlay.filter((c) => c.kind === 'vault_lock')).toHaveLength(4);
    expect(inPlay.filter((c) => c.kind === 'bankrupt')).toHaveLength(6);
    expect(checkInvariants(two)).toEqual([]);

    const three = createGame({ players: seats(3), seed: 3, rules: RULE_SETS.piggy });
    expect(three.removed).toHaveLength(0);
  });

  it('the original rule set is the spec default', () => {
    expect(RULE_SETS.original).toMatchObject({ bankruptDestroys: 'all', twoPlayerDefenseCopies: 6 });
  });
});

describe('tested-and-shelved variants still work', () => {
  it('bank_then_attack: bank several sets, then end the turn or attack', () => {
    let s = blankGame(2, { turnStyle: 'bank_then_attack', discardOnlyWhenStuck: false });
    give(s, 0, 'hand', '$5', '$5', '$50', '$50', 'bank_thief', 'sheriff');
    give(s, 1, 'bank', '$100');
    expect(validateAction(s, { type: 'end_turn', playerId: 'p1' })).not.toBeNull();
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(s.currentPlayerIndex).toBe(0);
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$50') });
    expect(s.players[0].stats.largestBank).toBe(110);
    expect(validateAction(s, { type: 'discard', playerId: 'p1', cardIds: handIds(s, 0, 'sheriff') })).not.toBeNull();
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bank_thief')[0], targetId: 'p2' });
    expect(total(s, 0)).toBe(210);
    expect(s.currentPlayerIndex).toBe(1);
    expect(s.bankedThisTurn).toBe(0);
  });

  it('stuckDiscardLimit lets a stuck player dump several cards and redraw', () => {
    let s = blankGame(2, { stuckDiscardLimit: 6 });
    give(s, 0, 'hand', '$5', '$25', '$50', '$100', 'sheriff', 'vault_lock');
    const dump = [...handIds(s, 0, '$5'), ...handIds(s, 0, '$25'), ...handIds(s, 0, '$50')];
    s = applyAction(s, { type: 'discard', playerId: 'p1', cardIds: dump });
    expect(s.discardPile).toHaveLength(3);
    expect(s.players[0].hand).toHaveLength(6);

    const one = blankGame(2);
    give(one, 0, 'hand', '$5', '$25');
    const both = one.players[0].hand.map((c) => c.id);
    expect(validateAction(one, { type: 'discard', playerId: 'p1', cardIds: both })).toMatch(/exactly one/);
  });
});
