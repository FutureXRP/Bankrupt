// A match is several rounds (full games) between the same players. Seats keep
// the same ids from round to round, and the deal moves one seat each round.
//
// Two ways to score a match:
//  - Round wins (the default): the first player to win `target` rounds wins.
//  - Carry-over: the match lasts exactly `target` rounds. Everyone starts each
//    new round with the money they finished the last one with (as cash in their
//    bank, where it can be spent, stolen or lost), and the richest player after
//    the last round wins the match.

import { scoreGame } from './engine';
import type { GameState } from './state';

export type MatchState = {
  /** Round wins needed (round-wins scoring) or rounds to play (carry-over). 1 means a single game. */
  target: number;
  /** True for carry-over scoring. */
  carryOver: boolean;
  /** The round being played (or about to be played), starting at 1. */
  round: number;
  /** Who deals round 1; the deal then moves one seat each round. */
  firstDealer: number;
  /** Round wins so far, by player id. A shared round win counts for each winner. */
  wins: Record<string, number>;
  /**
   * Money by player id. Round-wins scoring: banked across all finished rounds
   * (the tie-breaker). Carry-over: the fortune each player takes into the next round.
   */
  money: Record<string, number>;
};

export const MATCH_LENGTHS = [
  { target: 1, name: 'Single game', carryName: 'Single game' },
  { target: 2, name: 'First to 2 wins', carryName: '2 rounds' },
  { target: 3, name: 'First to 3 wins', carryName: '3 rounds' },
] as const;

export function newMatch(target: number, firstDealer = 0, carryOver = false): MatchState {
  return { target, carryOver: carryOver && target > 1, round: 1, firstDealer, wins: {}, money: {} };
}

export const isMultiRound = (match: MatchState | undefined): match is MatchState => !!match && match.target > 1;

export function dealerForRound(match: MatchState, playerCount: number): number {
  return (match.firstDealer + match.round - 1) % playerCount;
}

/** Cash each seat starts the coming round with (carry-over matches only), in seat order. */
export function startingCashFor(match: MatchState, playerIds: readonly string[]): number[] | undefined {
  if (!match.carryOver || match.round === 1) return undefined;
  return playerIds.map((id) => match.money[id] ?? 0);
}

/** The match after a finished round has been scored. */
export function recordRound(match: MatchState, finished: GameState): MatchState {
  const { standings, winnerIds } = scoreGame(finished);
  const wins = { ...match.wins };
  const money = { ...match.money };
  for (const row of standings) {
    // A carried fortune is already inside the bank, so the final bank IS the new fortune.
    money[row.playerId] = match.carryOver ? row.total : (money[row.playerId] ?? 0) + row.total;
  }
  for (const id of winnerIds) wins[id] = (wins[id] ?? 0) + 1;
  return { ...match, round: match.round + 1, wins, money };
}

/**
 * Who has won the match, or null while it is still going.
 * Round wins: the first to reach the target; if two get there in the same round,
 * the one with more money across the match; if level, they share it.
 * Carry-over: after the last round, the biggest fortune; if level, the one with
 * more round wins; if still level, they share it.
 */
export function matchWinnerIds(match: MatchState): string[] | null {
  if (match.carryOver) {
    if (match.round - 1 < match.target) return null;
    const ids = Object.keys(match.money);
    const richest = Math.max(...ids.map((id) => match.money[id]));
    const top = ids.filter((id) => match.money[id] === richest);
    const mostWins = Math.max(...top.map((id) => match.wins[id] ?? 0));
    return top.filter((id) => (match.wins[id] ?? 0) === mostWins);
  }
  const reached = Object.keys(match.wins).filter((id) => match.wins[id] >= match.target);
  if (reached.length === 0) return null;
  const best = Math.max(...reached.map((id) => match.money[id] ?? 0));
  return reached.filter((id) => (match.money[id] ?? 0) === best);
}
