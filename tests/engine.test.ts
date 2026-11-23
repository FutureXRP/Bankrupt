// Acceptance tests from spec §22. Test numbers match the spec's list.

import { describe, expect, it } from 'vitest';
import {
  MONEY_VALUES,
  RULE_SETS,
  RuleError,
  SPECIAL_KINDS,
  TOTAL_MONEY_VALUE,
  applyAction,
  bankTotal,
  buildDeck,
  checkInvariants,
  createGame,
  getPlayerView,
  maskStateFor,
  publicBankruptCount,
  scoreGame,
  sumMoney,
  validateAction,
} from '../src/engine';
import { ATTACK_RULES, blankGame, give, handIds, stackTop, total } from './helpers';

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

describe('variant: Bankrupt as an attack card', () => {
  const setup = () => {
    const s = blankGame(3, ATTACK_RULES);
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
    // The defender spent a card, so they restock to six straight away.
    expect(s.players[1].hand).toHaveLength(6);
    expect(s.players[0].hand).toHaveLength(6);
    expect(s.currentPlayerIndex).toBe(1);
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

describe('restocking after a defense', () => {
  const robbery = (rules?: Parameters<typeof blankGame>[1]) => {
    const s = blankGame(3, rules);
    give(s, 0, 'hand', 'bank_thief', '$5');
    give(s, 1, 'bank', '$100', '$25');
    give(s, 1, 'hand', 'sheriff', '$50', '$50', '$25', '$5', 'vault_lock');
    return s;
  };

  it('the defender draws first, then the attacker', () => {
    let s = robbery();
    const [top, second] = [s.drawPile[s.drawPile.length - 1].id, s.drawPile[s.drawPile.length - 2].id];
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bank_thief')[0], targetId: 'p2' });
    expect(s.players[1].hand).toHaveLength(6); // not yet: the Sheriff is still in hand
    s = applyAction(s, { type: 'defend', playerId: 'p2', cardId: handIds(s, 1, 'sheriff')[0] });
    expect(s.players[1].hand.map((c) => c.id)).toContain(top); // the defender took the top card
    expect(s.players[0].hand.map((c) => c.id)).toContain(second); // then the attacker drew
    expect(s.players.map((p) => p.hand.length)).toEqual([6, 6, 0]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('a Bankrupt drawn while restocking hits the defender (trap rules)', () => {
    let s = robbery();
    stackTop(s, 'bankrupt');
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bank_thief')[0], targetId: 'p2' });
    s = applyAction(s, { type: 'defend', playerId: 'p2', cardId: handIds(s, 1, 'sheriff')[0] });
    // Ben holds a Vault Lock, so the game waits for HIS decision even though it is Ava's turn.
    expect(s.phase).toBe('bankrupt_draw');
    expect(s.pendingDraw).toEqual({ playerId: 'p2' });
    expect(s.currentPlayerIndex).toBe(0);
    expect(checkInvariants(s)).toEqual([]);
    s = applyAction(s, { type: 'defend', playerId: 'p2', cardId: null });
    expect(total(s, 1)).toBe(0);
    expect(s.players.map((p) => p.hand.length)).toEqual([6, 6, 0]);
    expect(s.phase).toBe('action');
    expect(s.currentPlayerIndex).toBe(1);
  });

  it('can be switched off so defenders wait for their own turn', () => {
    let s = robbery({ refillAfterDefense: false });
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bank_thief')[0], targetId: 'p2' });
    s = applyAction(s, { type: 'defend', playerId: 'p2', cardId: handIds(s, 1, 'sheriff')[0] });
    expect(s.players[1].hand).toHaveLength(5);
  });
});

describe('discarding, drawing and the countdown', () => {
  it('only allows a discard when nothing else is legal, then refills by one', () => {
    let s = blankGame();
    give(s, 0, 'hand', '$5', '$25', '$50', '$100', 'sheriff', 'vault_lock'); // no pair, nothing to play
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

  it('10–12. attack variant: five Bankrupt draws do nothing; the sixth schedules one final turn each', () => {
    let s = blankGame(3, ATTACK_RULES);
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

  it('attack variant can also end at once on the sixth Bankrupt', () => {
    let s = blankGame(2, { bankruptMode: 'attack', endTrigger: 'immediate' });
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

describe("Bankrupt is a trap (the creator's rule)", () => {
  it('drawing Bankrupt wipes out your own bank and nobody else\'s', () => {
    let s = blankGame(3);
    give(s, 0, 'bank', '$100', '$50');
    give(s, 1, 'bank', '$25');
    give(s, 0, 'hand', '$5', '$5');
    stackTop(s, 'bankrupt', '$25');
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(total(s, 0)).toBe(0);
    expect(total(s, 1)).toBe(25);
    expect(s.bankruptDrawnCount).toBe(1);
    expect(s.players[0].hand).toHaveLength(6); // the refill carried on after the Bankrupt
    expect(s.players[0].hand.some((c) => c.kind === 'bankrupt')).toBe(false);
    expect(s.discardPile.filter((c) => c.kind === 'bankrupt')).toHaveLength(1);
    expect(s.currentPlayerIndex).toBe(1);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('a Vault Lock in hand saves the bank and is used up', () => {
    let s = blankGame(3);
    give(s, 0, 'bank', '$100', '$50');
    give(s, 0, 'hand', '$5', '$5', 'vault_lock', 'sheriff');
    stackTop(s, 'bankrupt');
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(s.phase).toBe('bankrupt_draw');
    expect(s.pendingDraw).toEqual({ playerId: 'p1' });
    expect(checkInvariants(s)).toEqual([]);
    // Sheriff does not stop Bankrupt, and nobody else can answer.
    expect(validateAction(s, { type: 'defend', playerId: 'p1', cardId: handIds(s, 0, 'sheriff')[0] })).not.toBeNull();
    expect(validateAction(s, { type: 'defend', playerId: 'p2', cardId: null })).not.toBeNull();
    const lock = handIds(s, 0, 'vault_lock')[0];
    s = applyAction(s, { type: 'defend', playerId: 'p1', cardId: lock });
    expect(total(s, 0)).toBe(160);
    expect(s.discardPile.some((c) => c.id === lock)).toBe(true);
    expect(s.players[0].stats).toMatchObject({ bankruptPlayed: 1, bankruptBlocked: 1 });
    expect(s.players[0].hand).toHaveLength(6);
    expect(s.phase).toBe('action');
    expect(s.currentPlayerIndex).toBe(1);
  });

  it('a player may choose not to use the Vault Lock', () => {
    let s = blankGame(3);
    give(s, 0, 'bank', '$5');
    give(s, 0, 'hand', '$5', '$5', 'vault_lock');
    stackTop(s, 'bankrupt');
    const lock = handIds(s, 0, 'vault_lock')[0];
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    s = applyAction(s, { type: 'defend', playerId: 'p1', cardId: null });
    expect(total(s, 0)).toBe(0);
    expect(handIds(s, 0, 'vault_lock')).toContain(lock);
  });

  it('a Vault Lock drawn earlier in the same refill can be used', () => {
    let s = blankGame(3);
    give(s, 0, 'bank', '$100');
    give(s, 0, 'hand', '$5', '$5');
    stackTop(s, 'vault_lock', 'bankrupt');
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(s.phase).toBe('bankrupt_draw');
  });

  it('drawing Bankrupt with an empty bank costs nothing and asks nothing', () => {
    let s = blankGame(3);
    give(s, 0, 'hand', '$5', '$25', 'vault_lock');
    stackTop(s, 'bankrupt');
    const lock = handIds(s, 0, 'vault_lock')[0];
    s = applyAction(s, { type: 'discard', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(s.phase).toBe('action');
    expect(s.currentPlayerIndex).toBe(1);
    expect(s.bankruptDrawnCount).toBe(1);
    expect(handIds(s, 0, 'vault_lock')).toContain(lock);
  });

  it('the game ends the moment the sixth Bankrupt is drawn', () => {
    let s = blankGame(3);
    give(s, 0, 'bank', '$100', '$100');
    give(s, 1, 'bank', '$25', '$25');
    give(s, 0, 'hand', '$5', '$5', '$50');
    stackTop(s, 'bankrupt', 'bankrupt', 'bankrupt', 'bankrupt', 'bankrupt', '$25', 'bankrupt', '$100');
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(s.phase).toBe('finished');
    expect(s.bankruptDrawnCount).toBe(6);
    expect(s.finalRound).toBeUndefined();
    expect(total(s, 0)).toBe(0);
    expect(s.winnerIds).toEqual(['p2']);
    // Drawing stopped at the sixth Bankrupt: the $100 under it was never drawn.
    expect(s.players[0].hand.map((c) => c.value)).toEqual([50, 25]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('the sixth Bankrupt still waits for a Vault Lock decision before the game ends', () => {
    let s = blankGame(2);
    give(s, 0, 'bank', '$100');
    give(s, 0, 'hand', '$5', '$5', 'vault_lock');
    s.discardPile.push(...s.drawPile.splice(0, 5)); // five Bankrupt cards already gone
    s.bankruptDrawnCount = 5;
    stackTop(s, 'bankrupt');
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(s.phase).toBe('bankrupt_draw');
    s = applyAction(s, { type: 'defend', playerId: 'p1', cardId: handIds(s, 0, 'vault_lock')[0] });
    expect(s.phase).toBe('finished');
    expect(s.winnerIds).toEqual(['p1']);
  });
});

describe('Piggy Bank rule set', () => {
  const bankruptPlayerOne = (bank: string[]) => {
    let s = blankGame(3, RULE_SETS.piggy);
    give(s, 0, 'bank', ...bank);
    give(s, 0, 'hand', '$50', '$100');
    stackTop(s, 'bankrupt');
    s = applyAction(s, { type: 'discard', playerId: 'p1', cardIds: handIds(s, 0, '$50') });
    return s;
  };

  it('a bankrupted player keeps their smallest pile', () => {
    const s = bankruptPlayerOne(['$100', '$100', '$25', '$25', '$5', '$5', '$5']); // piles worth $200, $50, $15
    expect(total(s, 0)).toBe(15);
    expect(s.players[0].bank.every((c) => c.value === 5)).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('a one-pile bank is still wiped out completely', () => {
    expect(total(bankruptPlayerOne(['$50', '$50', '$50']), 0)).toBe(0);
  });

  it('keeps the lower denomination when two piles are worth the same', () => {
    const s = bankruptPlayerOne(['$50', '$25', '$25']);
    expect(s.players[0].bank.map((c) => c.value)).toEqual([25, 25]);
  });

  it('everyone gets one last turn after the sixth Bankrupt', () => {
    let s = blankGame(3, RULE_SETS.piggy);
    give(s, 0, 'hand', '$5', '$25');
    give(s, 1, 'hand', '$50', '$50');
    give(s, 2, 'hand', '$25', '$25');
    stackTop(s, 'bankrupt', 'bankrupt', 'bankrupt', 'bankrupt', 'bankrupt', 'bankrupt', '$5', '$50', '$100', 'sheriff', 'vault_lock');
    s = applyAction(s, { type: 'discard', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(s.phase).toBe('action');
    expect(s.finalRound).toEqual({ triggeredByPlayerId: 'p1', turnsRemaining: 3 });
    s = applyAction(s, { type: 'bank', playerId: 'p2', cardIds: handIds(s, 1, '$50') });
    s = applyAction(s, { type: 'bank', playerId: 'p3', cardIds: handIds(s, 2, '$25') });
    expect(s.phase).toBe('action');
    s = applyAction(s, { type: 'discard', playerId: 'p1', cardIds: [s.players[0].hand[0].id] });
    expect(s.phase).toBe('finished');
    expect(s.winnerIds).toEqual(['p2']);
  });

  it('a 2-player game leaves 2 Vault Locks and 2 Sheriffs in the box', () => {
    const two = createGame({ players: seats(2), seed: 3, rules: RULE_SETS.piggy });
    expect(two.removed.map((c) => c.kind).sort()).toEqual(['sheriff', 'sheriff', 'vault_lock', 'vault_lock']);
    const inPlay = [...two.drawPile, ...two.players.flatMap((p) => p.hand)];
    expect(inPlay).toHaveLength(76);
    expect(inPlay.filter((c) => c.kind === 'vault_lock')).toHaveLength(4);
    expect(inPlay.filter((c) => c.kind === 'bankrupt')).toHaveLength(6);
    expect(checkInvariants(two)).toEqual([]);
    expect(createGame({ players: seats(3), seed: 3, rules: RULE_SETS.piggy }).removed).toHaveLength(0);
  });

  it('Bankrupt Attack mode puts Bankrupt in the hand to be played on others', () => {
    expect(RULE_SETS.attack).toMatchObject({ bankruptMode: 'attack', endTrigger: 'final_circuit', bankruptDestroys: 'all' });
    let s = blankGame(3, RULE_SETS.attack);
    give(s, 0, 'bank', '$100');
    give(s, 1, 'bank', '$50', '$25');
    give(s, 0, 'hand', '$5', '$5');
    stackTop(s, 'bankrupt');
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(total(s, 0)).toBe(110); // drawing it does not hurt you
    expect(handIds(s, 0, 'bankrupt')).toHaveLength(1);
    expect(s.bankruptDrawnCount).toBe(1);
    // The draw is a secret: no announcement, and the public count stays at 0 for everyone.
    expect(s.actionLog.some((e) => /bankrupt/i.test(e.text))).toBe(false);
    expect(publicBankruptCount(s)).toBe(0);
    expect(getPlayerView(s, 'p2').bankruptDrawnCount).toBe(0);
    expect(maskStateFor(s, 'p2').bankruptDrawnCount).toBe(0);
    s.currentPlayerIndex = 0; // skip round the table back to Ava
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bankrupt')[0], targetId: 'p2' });
    expect(total(s, 1)).toBe(0);
    expect(publicBankruptCount(s)).toBe(1); // now that it has been played, everyone knows
    expect(checkInvariants(s)).toEqual([]);
  });

  it('the deck grows with the table: 80 cards for 2, 117 for 3, 154 for 4, always 6 Bankrupt', () => {
    for (const [count, cards, money] of [[2, 80, 2520], [3, 117, 3780], [4, 154, 5040]] as const) {
      const s = createGame({ players: seats(count), seed: 9, rules: RULE_SETS.original });
      const all = [...s.drawPile, ...s.players.flatMap((p) => p.hand)];
      expect(all).toHaveLength(cards);
      expect(new Set(all.map((c) => c.id)).size).toBe(cards);
      expect(all.filter((c) => c.kind === 'bankrupt')).toHaveLength(6);
      expect(sumMoney(all)).toBe(money);
      expect(checkInvariants(s)).toEqual([]);
    }
    // The basic rules object still deals the plain 80-card deck at any table size.
    const plain = createGame({ players: seats(4), seed: 9 });
    expect(plain.drawPile.length + 24).toBe(80);
  });

  it("the original rule set is the creator's game", () => {
    expect(RULE_SETS.original).toMatchObject({
      bankruptMode: 'trap',
      endTrigger: 'immediate',
      bankruptDestroys: 'all',
      twoPlayerDefenseCopies: 6,
    });
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

describe('power-up shop', () => {
  const SHOP = { ...RULE_SETS.original, shop: true };
  const buy = (s: ReturnType<typeof blankGame>, item: Parameters<typeof applyAction>[1] & { type: 'buy' }) => applyAction(s, item);

  it('is closed unless the rule is on, and takes one purchase per turn before you play', () => {
    const closed = blankGame(3);
    give(closed, 0, 'bank', '$100', '$100');
    expect(validateAction(closed, { type: 'buy', playerId: 'p1', item: 'overtime' })).toMatch(/closed/);

    let s = blankGame(3, SHOP);
    give(s, 0, 'bank', '$100', '$100', '$100');
    expect(validateAction(s, { type: 'buy', playerId: 'p2', item: 'overtime' })).not.toBeNull(); // not their turn
    s = buy(s, { type: 'buy', playerId: 'p1', item: 'insurance' });
    expect(validateAction(s, { type: 'buy', playerId: 'p1', item: 'overtime' })).toMatch(/One power-up/);
  });

  it('paying takes exactly the price: small cards first, with change kept as cash', () => {
    let s = blankGame(3, SHOP);
    give(s, 0, 'bank', '$100', '$100', '$5');
    expect(validateAction(s, { type: 'buy', playerId: 'p1', item: 'big_heist' })).toMatch(/Bank Thief/);
    s = buy(s, { type: 'buy', playerId: 'p1', item: 'inside_tip' }); // $25
    expect(bankTotal(s.players[0])).toBe(180);
    expect(s.players[0].bank.map((c) => c.value)).toEqual([100]); // the $5 and one $100 were spent
    expect(s.players[0].bonus).toBe(80); // change
    expect(s.discardPile).toHaveLength(2);
    expect(checkInvariants(s)).toEqual([]);

    const poor = blankGame(3, SHOP);
    give(poor, 0, 'bank', '$5', '$5');
    expect(validateAction(poor, { type: 'buy', playerId: 'p1', item: 'inside_tip' })).toMatch(/need \$25/);
  });

  it('Double Up doubles the match banked this turn', () => {
    let s = blankGame(3, SHOP);
    give(s, 0, 'bank', '$50', '$50');
    give(s, 0, 'hand', '$100', '$100');
    s = buy(s, { type: 'buy', playerId: 'p1', item: 'double_up' });
    expect(bankTotal(s.players[0])).toBe(0);
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$100') });
    expect(bankTotal(s.players[0])).toBe(400);
    expect(scoreGame(s).standings[0]).toMatchObject({ playerId: 'p1', total: 400 });
    expect(s.buffs.doubleUp).toBe(false);

    const noMatch = blankGame(3, SHOP);
    give(noMatch, 0, 'bank', '$100');
    expect(validateAction(noMatch, { type: 'buy', playerId: 'p1', item: 'double_up' })).toMatch(/no match/);
  });

  it('Big Heist steals the whole bank, cash included, and a Sheriff still stops it', () => {
    const setup = () => {
      const s = blankGame(3, SHOP);
      give(s, 0, 'bank', '$100', '$100');
      give(s, 0, 'hand', 'bank_thief');
      give(s, 1, 'bank', '$100', '$50', '$25');
      s.players[1].bonus = 40;
      return s;
    };
    let s = buy(setup(), { type: 'buy', playerId: 'p1', item: 'big_heist' });
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bank_thief')[0], targetId: 'p2' });
    expect(bankTotal(s.players[1])).toBe(0);
    expect(bankTotal(s.players[0])).toBe(215); // 200 - 200 + 175 + 40
    expect(s.phase).toBe('action');
    expect(checkInvariants(s)).toEqual([]);

    let blocked = setup();
    give(blocked, 1, 'hand', 'sheriff');
    blocked = buy(blocked, { type: 'buy', playerId: 'p1', item: 'big_heist' });
    blocked = applyAction(blocked, { type: 'attack', playerId: 'p1', cardId: handIds(blocked, 0, 'bank_thief')[0], targetId: 'p2' });
    blocked = applyAction(blocked, { type: 'defend', playerId: 'p2', cardId: handIds(blocked, 1, 'sheriff')[0] });
    expect(bankTotal(blocked.players[1])).toBe(215);
    expect(bankTotal(blocked.players[0])).toBe(0); // the $200 is gone either way
  });

  it('Insurance pays back half when you go bankrupt, once', () => {
    let s = blankGame(3, SHOP);
    give(s, 0, 'bank', '$100', '$100', '$100', '$50', '$50');
    give(s, 0, 'hand', '$5', '$25');
    stackTop(s, 'bankrupt');
    s = buy(s, { type: 'buy', playerId: 'p1', item: 'insurance' });
    expect(s.players[0].insured).toBe(true);
    expect(bankTotal(s.players[0])).toBe(300);
    s = applyAction(s, { type: 'discard', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(bankTotal(s.players[0])).toBe(150);
    expect(s.players[0].insured).toBe(false);
    expect(s.players[0].bank).toHaveLength(0);
  });

  it('cash in the bank is lost to Bankrupt even with no cards banked', () => {
    let s = blankGame(3, SHOP);
    s.players[0].bonus = 60;
    give(s, 0, 'hand', '$5', '$25');
    stackTop(s, 'bankrupt');
    s = applyAction(s, { type: 'discard', playerId: 'p1', cardIds: handIds(s, 0, '$5') });
    expect(bankTotal(s.players[0])).toBe(0);
  });

  it('Inside Tip shows the buyer the next three cards, and nobody else', () => {
    let s = blankGame(3, SHOP);
    give(s, 0, 'bank', '$25', '$25');
    stackTop(s, 'bankrupt', '$100', 'sheriff');
    s = buy(s, { type: 'buy', playerId: 'p1', item: 'inside_tip' });
    expect(s.players[0].peek.map((c) => c.kind)).toEqual(['bankrupt', 'money', 'sheriff']);
    expect(getPlayerView(s, 'p1').peek).toHaveLength(3);
    expect(getPlayerView(s, 'p2').peek).toHaveLength(0);
    expect(maskStateFor(s, 'p2').players[0].peek).toHaveLength(0);
    expect(maskStateFor(s, 'p1').players[0].peek).toHaveLength(3);
    s = applyAction(s, { type: 'pass', playerId: 'p1' });
    expect(s.players[0].peek).toHaveLength(0); // forgotten once the turn is over
  });

  it('Overtime gives the same player another turn, and they can shop again', () => {
    let s = blankGame(3, SHOP);
    give(s, 0, 'bank', '$100', '$100', '$100');
    give(s, 0, 'hand', '$50', '$50', '$25', '$25');
    stackTop(s, '$5', '$100');
    s = buy(s, { type: 'buy', playerId: 'p1', item: 'overtime' });
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$50') });
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.phase).toBe('action');
    expect(s.buffs).toEqual({ bought: false, doubleUp: false, heist: false, extraTurn: false });
    s = applyAction(s, { type: 'bank', playerId: 'p1', cardIds: handIds(s, 0, '$25') });
    expect(s.currentPlayerIndex).toBe(1);
    expect(bankTotal(s.players[0])).toBeGreaterThanOrEqual(350);
  });
});

describe('Bank Swap card', () => {
  const SWAP = { ...RULE_SETS.original, bankSwapCards: 2 };

  it('adds 2 cards to the basic deck, scaled with the table', () => {
    for (const [count, swaps, cards] of [[2, 2, 82], [3, 3, 120], [4, 4, 158]] as const) {
      const s = createGame({ players: seats(count), seed: 2, rules: SWAP });
      const all = [...s.drawPile, ...s.players.flatMap((p) => p.hand)];
      expect(all.filter((c) => c.kind === 'bank_swap')).toHaveLength(swaps);
      expect(all).toHaveLength(cards);
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(createGame({ players: seats(2), seed: 2, rules: RULE_SETS.original }).drawPile.some((c) => c.kind === 'bank_swap')).toBe(false);
  });

  const setup = () => {
    const s = blankGame(3, SWAP);
    give(s, 0, 'bank', '$5', '$5');
    s.players[0].bonus = 15;
    give(s, 0, 'hand', 'bank_swap');
    give(s, 1, 'bank', '$100', '$100', '$50');
    return s;
  };

  it('trades whole banks, cash included', () => {
    let s = setup();
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bank_swap')[0], targetId: 'p2' });
    expect(bankTotal(s.players[0])).toBe(250);
    expect(bankTotal(s.players[1])).toBe(25);
    expect(s.players[1].bonus).toBe(15);
    expect(s.discardPile.some((c) => c.kind === 'bank_swap')).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('is stopped by a Sheriff, not a Vault Lock', () => {
    let s = setup();
    give(s, 1, 'hand', 'sheriff', 'vault_lock');
    s = applyAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bank_swap')[0], targetId: 'p2' });
    expect(s.phase).toBe('reaction');
    expect(validateAction(s, { type: 'defend', playerId: 'p2', cardId: handIds(s, 1, 'vault_lock')[0] })).not.toBeNull();
    s = applyAction(s, { type: 'defend', playerId: 'p2', cardId: handIds(s, 1, 'sheriff')[0] });
    expect(bankTotal(s.players[0])).toBe(25);
    expect(bankTotal(s.players[1])).toBe(250);
  });

  it('never has to be played: holding only a Bank Swap, you may discard instead', () => {
    const s = blankGame(3, SWAP);
    give(s, 0, 'bank', '$100', '$100');
    give(s, 1, 'bank', '$5');
    give(s, 0, 'hand', 'bank_swap', '$25');
    expect(validateAction(s, { type: 'discard', playerId: 'p1', cardIds: handIds(s, 0, '$25') })).toBeNull();
    // An empty bank cannot be swapped with.
    expect(validateAction(s, { type: 'attack', playerId: 'p1', cardId: handIds(s, 0, 'bank_swap')[0], targetId: 'p3' })).not.toBeNull();
  });
});
