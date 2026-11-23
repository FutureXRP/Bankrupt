// Match play: several rounds between the same players, first to N round wins.

import { describe, expect, it } from 'vitest';
import { chooseForPhase } from '../src/ai';
import {
  RULE_SETS,
  actorId,
  applyAction,
  createGame,
  dealerForRound,
  getPlayerView,
  isMultiRound,
  makeRng,
  matchWinnerIds,
  newMatch,
  recordRound,
  type GameState,
} from '../src/engine';
import { blankGame, give } from './helpers';

/** A finished 3-player game with the given banks (in $100 cards and $5 cards). */
function finishedRound(banks: [number, number, number]): GameState {
  const s = blankGame(3);
  banks.forEach((amount, i) => {
    for (let n = 0; n < Math.floor(amount / 100); n++) give(s, i, 'bank', '$100');
    for (let n = 0; n < (amount % 100) / 5; n++) give(s, i, 'bank', '$5');
  });
  s.phase = 'finished';
  return s;
}

describe('match play', () => {
  it('a single game is not a multi-round match', () => {
    expect(isMultiRound(newMatch(1))).toBe(false);
    expect(isMultiRound(newMatch(2))).toBe(true);
    expect(isMultiRound(undefined)).toBe(false);
  });

  it('counts round wins and money, and ends when someone reaches the target', () => {
    let match = newMatch(2);
    expect(matchWinnerIds(match)).toBeNull();

    match = recordRound(match, finishedRound([300, 100, 0])); // Ava
    expect(match).toMatchObject({ round: 2, wins: { p1: 1 }, money: { p1: 300, p2: 100, p3: 0 } });
    expect(matchWinnerIds(match)).toBeNull();

    match = recordRound(match, finishedRound([0, 200, 100])); // Ben
    expect(match.wins).toEqual({ p1: 1, p2: 1 });
    expect(matchWinnerIds(match)).toBeNull();

    match = recordRound(match, finishedRound([100, 400, 200])); // Ben again
    expect(match.round).toBe(4);
    expect(match.money).toEqual({ p1: 400, p2: 700, p3: 300 });
    expect(matchWinnerIds(match)).toEqual(['p2']);
  });

  it('does not change the match it was given', () => {
    const before = newMatch(2);
    recordRound(before, finishedRound([100, 0, 0]));
    expect(before).toEqual(newMatch(2));
  });

  it('a shared round win counts for both; money across the match breaks the tie', () => {
    let match = newMatch(2);
    match = recordRound(match, finishedRound([200, 200, 0])); // Ava and Ben share round 1
    expect(match.wins).toEqual({ p1: 1, p2: 1 });
    match = recordRound(match, finishedRound([100, 100, 0])); // and share round 2
    expect(matchWinnerIds(match)).toEqual(['p1', 'p2']); // level on money too: shared match

    let other = newMatch(2);
    other = recordRound(other, finishedRound([200, 200, 0]));
    other = recordRound(other, finishedRound([100, 100, 300])); // Chloe wins round 2: nobody at 2 yet
    expect(matchWinnerIds(other)).toBeNull();
    other = { ...other, wins: { p1: 2, p2: 2, p3: 1 }, money: { p1: 500, p2: 650, p3: 300 } };
    expect(matchWinnerIds(other)).toEqual(['p2']);
  });

  it('the deal moves one seat each round, starting from the first dealer', () => {
    const match = newMatch(3, 2);
    const dealers = [1, 2, 3, 4, 5].map((round) => dealerForRound({ ...match, round }, 4));
    expect(dealers).toEqual([2, 3, 0, 1, 2]);
    const game = createGame({
      players: ['A', 'B', 'C', 'D'].map((name) => ({ name, isAI: true })),
      seed: 1,
      rules: RULE_SETS.original,
      dealerIndex: dealerForRound(match, 4),
    });
    expect(game.dealerIndex).toBe(2);
    expect(game.currentPlayerIndex).toBe(3); // left of the dealer goes first
  });

  it('computer players can play a whole first-to-3 match to a winner', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rand = makeRng(seed);
      let match = newMatch(3, seed % 3);
      let rounds = 0;
      while (!matchWinnerIds(match)) {
        if (++rounds > 12) throw new Error('match did not end');
        let s = createGame({
          players: ['A', 'B', 'C'].map((name) => ({ name, isAI: true, difficulty: 'competitive' as const })),
          seed: seed * 100 + rounds,
          rules: RULE_SETS.original,
          dealerIndex: dealerForRound(match, 3),
        });
        while (s.phase !== 'finished') {
          const id = actorId(s)!;
          s = applyAction(s, chooseForPhase(getPlayerView(s, id), 'competitive', rand));
        }
        match = recordRound(match, s);
      }
      const winners = matchWinnerIds(match)!;
      expect(winners.length).toBeGreaterThan(0);
      expect(winners.every((id) => match.wins[id] >= 3)).toBe(true);
      expect(match.round - 1).toBe(rounds);
    }
  });
});

describe('online messages', () => {
  it('a long game still fits through the connection: big states are split and rebuilt exactly', async () => {
    const { toWire, Reassembler, PART_SIZE } = await import('../src/net/protocol');
    const { maskStateFor, GUEST_LOG_LENGTH } = await import('../src/engine');
    const rand = makeRng(5);
    let s = createGame({
      players: ['A', 'B', 'C', 'D'].map((name) => ({ name, isAI: true, difficulty: 'competitive' as const })),
      seed: 77,
      rules: { ...RULE_SETS.attack, shop: true, bankSwapCards: 2 },
    });
    let biggest = 0;
    const reader = new Reassembler();
    while (s.phase !== 'finished') {
      const id = actorId(s)!;
      s = applyAction(s, chooseForPhase(getPlayerView(s, id), 'competitive', rand));
      const message = { t: 'state', game: { id: 1, seatId: 'p2', state: maskStateFor(s, 'p2') } };
      const pieces = toWire(message);
      biggest = Math.max(biggest, JSON.stringify(message).length);
      for (const piece of pieces) {
        const size = 'data' in piece ? (piece as { data: string }).data.length : JSON.stringify(piece).length;
        expect(size).toBeLessThanOrEqual(PART_SIZE);
      }
      const rebuilt = pieces.map((piece) => reader.read(JSON.parse(JSON.stringify(piece)))).filter(Boolean);
      expect(rebuilt).toHaveLength(1);
      expect(rebuilt[0]).toEqual(JSON.parse(JSON.stringify(message)));
    }
    expect(s.actionLog.length).toBeGreaterThan(GUEST_LOG_LENGTH);
    expect(maskStateFor(s, 'p2').actionLog).toHaveLength(GUEST_LOG_LENGTH);
    expect(maskStateFor(s, 'p2').actionLog.at(-1)).toEqual(s.actionLog.at(-1));
    expect(biggest).toBeGreaterThan(PART_SIZE); // so the splitting really was exercised
  });
});
