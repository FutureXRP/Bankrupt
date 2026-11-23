// Messages for invite-code games. One player's browser hosts the game and is the
// only place the full game state lives; guests connect to it directly
// (peer-to-peer) and only ever receive what their own seat is allowed to see.

import type { PeerOptions } from 'peerjs';
import type { Action, Difficulty, Extras, GameState, MatchState, RuleSetId } from '../engine';

export const MAX_PLAYERS = 4;

/** Both sides say hello this often, and give up on a silent connection after the timeout. */
export const PING_EVERY_MS = 3_000;
export const SILENCE_TIMEOUT_MS = 20_000;
/** A guest who has lost the connection keeps trying to get back in for this long. */
export const RECONNECT_FOR_MS = 15 * 60_000;
export const RETRY_EVERY_MS = 3_000;

export type LobbyPlayer = { name: string; kind: 'host' | 'guest' | 'computer' };

export type LobbyInfo = {
  players: LobbyPlayer[];
  ruleSet: RuleSetId;
  extras: Extras;
  matchTarget: number;
  matchCarry: boolean;
  difficulty: Difficulty;
};

export type OnlineGame = { id: number; seatId: string; state: GameState; match: MatchState };

export type GuestMessage =
  | { t: 'join'; name: string; device: string }
  | { t: 'action'; action: Action }
  | { t: 'ping' };

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

/**
 * A browser-to-browser channel can silently drop a message that is too big, and
 * a long game's state is big. Anything over PART_SIZE characters is sent as
 * numbered parts and put back together on the other side.
 */
export const PART_SIZE = 6_000;

type Part = { t: 'part'; id: number; i: number; n: number; data: string };

let nextPartId = 1;

export function toWire(message: object): object[] {
  const text = JSON.stringify(message);
  if (text.length <= PART_SIZE) return [message];
  const id = nextPartId++;
  const n = Math.ceil(text.length / PART_SIZE);
  return Array.from({ length: n }, (_, i): Part => ({
    t: 'part',
    id,
    i,
    n,
    data: text.slice(i * PART_SIZE, (i + 1) * PART_SIZE),
  }));
}

export class Reassembler {
  private pending = new Map<number, string[]>();

  /** Returns a whole message, or null while parts of one are still arriving. */
  read(data: unknown): object | null {
    const part = data as Part;
    if (!part || part.t !== 'part') return data as object;
    const pieces = this.pending.get(part.id) ?? [];
    pieces[part.i] = part.data;
    this.pending.set(part.id, pieces);
    if (pieces.filter((p) => p !== undefined).length < part.n) return null;
    this.pending.delete(part.id);
    return JSON.parse(pieces.join('')) as object;
  }
}

/**
 * A random id kept in this browser, so the host can tell "the same device
 * coming back after a dropped connection" from "a new player with the same name".
 */
export function deviceId(): string {
  const KEY = 'bankrupt.device';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}
