// A match is several rounds (full games) between the same players. The first
// player to win the target number of rounds wins the match. Seats keep the same
// ids from round to round, and the deal moves one seat each round.

import { scoreGame } from './engine';
import type { GameState } from './state';

export type MatchState = {
  /** Round wins needed to take the match. 1 means a single game. */
  target: number;
  /** The round being played (or about to be played), starting at 1. */
  round: number;
  /** Who deals round 1; the deal then moves one seat each round. */
  firstDealer: number;
  /** Round wins so far, by player id. A shared round win counts for each winner. */
  wins: Record<string, number>;
  /** Money banked across all finished rounds, by player id (the tie-breaker). */
  money: Record<string, number>;
};

export const MATCH_LENGTHS = [
  { target: 1, name: 'Single game' },
  { target: 2, name: 'First to 2 wins' },
  { target: 3, name: 'First to 3 wins' },
] as const;

export function newMatch(target: number, firstDealer = 0): MatchState {
  return { target, round: 1, firstDealer, wins: {}, money: {} };
}

export const isMultiRound = (match: MatchState | undefined): match is MatchState => !!match && match.target > 1;

export function dealerForRound(match: MatchState, playerCount: number): number {
  return (match.firstDealer + match.round - 1) % playerCount;
}

/** The match after a finished round has been scored. */
export function recordRound(match: MatchState, finished: GameState): MatchState {
  const { standings, winnerIds } = scoreGame(finished);
  const wins = { ...match.wins };
  const money = { ...match.money };
  for (const row of standings) money[row.playerId] = (money[row.playerId] ?? 0) + row.total;
  for (const id of winnerIds) wins[id] = (wins[id] ?? 0) + 1;
  return { ...match, round: match.round + 1, wins, money };
}

/**
 * Who has won the match, or null while it is still going. If two players reach
 * the target in the same round (a shared round win), the one with more money
 * banked across the whole match takes it; if that is level too, they share it.
 */
export function matchWinnerIds(match: MatchState): string[] | null {
  const reached = Object.keys(match.wins).filter((id) => match.wins[id] >= match.target);
  if (reached.length === 0) return null;
  const best = Math.max(...reached.map((id) => match.money[id] ?? 0));
  return reached.filter((id) => (match.money[id] ?? 0) === best);
}
