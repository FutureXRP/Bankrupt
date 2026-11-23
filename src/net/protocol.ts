// Messages for invite-code games. One player's browser hosts the game and is the
// only place the full game state lives; guests connect to it directly
// (peer-to-peer) and only ever receive what their own seat is allowed to see.

import type { PeerOptions } from 'peerjs';
import type { Action, Difficulty, GameState, RuleSetId } from '../engine';

export const MAX_PLAYERS = 4;

/** Both sides say hello this often, and give up on a silent connection after the timeout. */
export const PING_EVERY_MS = 3_000;
export const SILENCE_TIMEOUT_MS = 15_000;

export type LobbyPlayer = { name: string; kind: 'host' | 'guest' | 'computer' };

export type LobbyInfo = {
  players: LobbyPlayer[];
  ruleSet: RuleSetId;
  difficulty: Difficulty;
};

export type OnlineGame = { id: number; seatId: string; state: GameState };

export type GuestMessage = { t: 'join'; name: string } | { t: 'action'; action: Action } | { t: 'ping' };

export type HostMessage =
  | { t: 'lobby'; lobby: LobbyInfo; you: string }
  | { t: 'state'; game: OnlineGame }
  | { t: 'refused'; reason: string }
  | { t: 'closed' }
  | { t: 'ping' };

// No look-alike characters (0/O, 1/I/L) so codes are easy to read out loud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export function makeCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

export function cleanCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

export const roomPeerId = (code: string) => `bankrupt-cardgame-${code}`;

/**
 * Connection-broker settings. By default the free public PeerJS broker is used
 * to introduce the browsers to each other. A different broker can be set in
 * local storage (used by the automated tests).
 */
export function peerOptions(): PeerOptions {
  try {
    const custom = localStorage.getItem('bankrupt.peer');
    if (custom) return JSON.parse(custom) as PeerOptions;
  } catch {
    // fall through to the default broker
  }
  return {};
}
