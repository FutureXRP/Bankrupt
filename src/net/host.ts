// The host's side of an invite-code game. The host holds the real game state,
// checks every move, runs the computer players, and sends each guest a copy of
// the game with everyone else's cards hidden.

import Peer, { type DataConnection } from 'peerjs';
import {
  DEFAULT_EXTRAS,
  applyAction,
  createGame,
  maskStateFor,
  randomSeed,
  rulesFor,
  validateAction,
  type Action,
  type Difficulty,
  type Extras,
  type GameState,
  type RuleSetId,
  type SeatConfig,
} from '../engine';
import {
  MAX_PLAYERS,
  PING_EVERY_MS,
  SILENCE_TIMEOUT_MS,
  makeCode,
  peerOptions,
  roomPeerId,
  type GuestMessage,
  type HostMessage,
  type LobbyInfo,
} from './protocol';

type Guest = { conn: DataConnection; name: string; lastSeen: number };

const AI_NAMES = ['Penny', 'Buck', 'Goldie'];

export class HostRoom {
  code = makeCode();
  status: 'opening' | 'open' | 'error' = 'opening';
  error = '';
  guests: Guest[] = [];
  computers = 0;
  difficulty: Difficulty = 'casual';
  ruleSet: RuleSetId = 'original';
  extras: Extras = DEFAULT_EXTRAS;
  game: { id: number; state: GameState } | null = null;
  version = 0;

  private peer!: Peer;
  private seatByConn = new Map<DataConnection, string>();
  private listeners = new Set<() => void>();
  private closed = false;
  private attempts = 0;
  /** Seats whose player dropped out mid-game, by name, so they can come back. */
  private emptySeats = new Map<string, string>();
  private heartbeat: ReturnType<typeof setInterval>;

  constructor(public hostName: string) {
    this.open();
    this.heartbeat = setInterval(() => {
      const now = Date.now();
      for (const guest of [...this.guests]) {
        if (now - guest.lastSeen > SILENCE_TIMEOUT_MS) {
          this.leave(guest.conn);
          guest.conn.close();
        } else {
          this.send(guest.conn, { t: 'ping' });
        }
      }
    }, PING_EVERY_MS);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  private open() {
    this.peer = new Peer(roomPeerId(this.code), peerOptions());
    this.peer.on('open', () => {
      this.status = 'open';
      this.changed();
    });
    this.peer.on('connection', (conn) => this.accept(conn));
    this.peer.on('disconnected', () => {
      // Lost the broker, not the players. Reconnect so new players can still join.
      if (!this.closed && !this.peer.destroyed) this.peer.reconnect();
    });
    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && this.attempts++ < 5) {
        // Someone else is already using this code: pick another.
        this.peer.destroy();
        this.code = makeCode();
        this.open();
        return;
      }
      if (this.status === 'opening') {
        this.status = 'error';
        this.error = 'Could not reach the game-connection service. Check your internet and try again.';
        this.changed();
      }
    });
  }

  private accept(conn: DataConnection) {
    conn.on('data', (data) => this.receive(conn, data as GuestMessage));
    conn.on('close', () => this.leave(conn));
    conn.on('error', () => this.leave(conn));
  }

  private send(conn: DataConnection, message: HostMessage) {
    if (conn.open) conn.send(message);
  }

  private receive(conn: DataConnection, message: GuestMessage) {
    const known = this.guests.find((g) => g.conn === conn);
    if (known) known.lastSeen = Date.now();
    if (message.t === 'ping') return;
    if (message.t === 'join') {
      if (known) return;
      if (this.game && this.rejoin(conn, String(message.name ?? ''))) return;
      const refuse = (reason: string) => {
        this.send(conn, { t: 'refused', reason });
        setTimeout(() => conn.close(), 500);
      };
      if (this.game) return refuse('That game has already started.');
      if (this.guests.length >= MAX_PLAYERS - 1) return refuse('That game is full.');
      this.guests.push({ conn, name: this.uniqueName(String(message.name ?? '')), lastSeen: Date.now() });
      this.computers = Math.min(this.computers, MAX_PLAYERS - 1 - this.guests.length);
      this.sendLobby();
      this.changed();
      return;
    }
    if (message.t === 'action' && this.game) {
      // A guest may only ever move their own seat.
      if (this.seatByConn.get(conn) !== message.action?.playerId) return;
      this.apply(message.action);
    }
  }

  /** A player who dropped out mid-game takes their seat back from the computer. */
  private rejoin(conn: DataConnection, rawName: string): boolean {
    const name = rawName.trim().slice(0, 14);
    const seatId = this.emptySeats.get(name.toLowerCase());
    if (!this.game || !seatId) return false;
    this.emptySeats.delete(name.toLowerCase());
    const state = this.game.state;
    this.game = {
      id: this.game.id,
      state: {
        ...state,
        players: state.players.map((p) => (p.id === seatId ? { ...p, isAI: false, difficulty: undefined, name } : p)),
      },
    };
    this.guests.push({ conn, name, lastSeen: Date.now() });
    this.seatByConn.set(conn, seatId);
    this.sendLobby();
    this.sendState();
    this.changed();
    return true;
  }

  private uniqueName(raw: string): string {
    const base = raw.trim().slice(0, 14) || 'Player';
    const taken = new Set([this.hostName, ...this.guests.map((g) => g.name), ...AI_NAMES].map((n) => n.toLowerCase()));
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    return name;
  }

  private leave(conn: DataConnection) {
    const guest = this.guests.find((g) => g.conn === conn);
    if (!guest) return;
    this.guests = this.guests.filter((g) => g !== guest);
    const seatId = this.seatByConn.get(conn);
    this.seatByConn.delete(conn);
    if (this.game && seatId && this.game.state.phase !== 'finished') {
      // Keep the game going: a computer player takes over the empty seat.
      this.emptySeats.set(guest.name.toLowerCase(), seatId);
      const state = this.game.state;
      this.game = {
        id: this.game.id,
        state: {
          ...state,
          players: state.players.map((p) =>
            p.id === seatId ? { ...p, isAI: true, difficulty: 'casual' as Difficulty, name: `${p.name} (left)` } : p,
          ),
        },
      };
      this.sendState();
    } else if (!this.game) {
      this.sendLobby();
    }
    this.changed();
  }

  lobby(): LobbyInfo {
    return {
      players: [
        { name: this.hostName, kind: 'host' },
        ...this.guests.map((g) => ({ name: g.name, kind: 'guest' as const })),
        ...AI_NAMES.slice(0, this.computers).map((name) => ({ name, kind: 'computer' as const })),
      ],
      ruleSet: this.ruleSet,
      extras: this.extras,
      difficulty: this.difficulty,
    };
  }

  maxComputers(): number {
    return MAX_PLAYERS - 1 - this.guests.length;
  }

  configure(patch: { computers?: number; difficulty?: Difficulty; ruleSet?: RuleSetId; extras?: Extras }) {
    if (patch.computers !== undefined) this.computers = Math.max(0, Math.min(patch.computers, this.maxComputers()));
    if (patch.difficulty) this.difficulty = patch.difficulty;
    if (patch.ruleSet) this.ruleSet = patch.ruleSet;
    if (patch.extras) this.extras = patch.extras;
    this.sendLobby();
    this.changed();
  }

  private sendLobby() {
    const lobby = this.lobby();
    for (const guest of this.guests) this.send(guest.conn, { t: 'lobby', lobby, you: guest.name });
  }

  canStart(): boolean {
    return 1 + this.guests.length + this.computers >= 2;
  }

  /** Deal a new game for everyone in the room. Seat 1 is always the host. */
  start() {
    if (!this.canStart()) return;
    const seats: SeatConfig[] = [
      { name: this.hostName, isAI: false },
      ...this.guests.map((g) => ({ name: g.name, isAI: false })),
      ...AI_NAMES.slice(0, this.computers).map((name) => ({ name, isAI: true, difficulty: this.difficulty })),
    ];
    const state = createGame({ players: seats, seed: randomSeed(), rules: rulesFor(this.ruleSet, this.extras) });
    this.seatByConn.clear();
    this.emptySeats.clear();
    this.guests.forEach((g, i) => this.seatByConn.set(g.conn, state.players[i + 1].id));
    this.game = { id: Date.now(), state };
    this.sendState();
    this.changed();
  }

  /** Apply a move from the host, a computer player, or (already checked) a guest. */
  apply = (action: Action) => {
    if (!this.game || validateAction(this.game.state, action)) return;
    this.game = { id: this.game.id, state: applyAction(this.game.state, action) };
    this.sendState();
    this.changed();
  };

  private sendState() {
    if (!this.game) return;
    for (const guest of this.guests) {
      const seatId = this.seatByConn.get(guest.conn);
      if (!seatId) continue;
      this.send(guest.conn, {
        t: 'state',
        game: { id: this.game.id, seatId, state: maskStateFor(this.game.state, seatId) },
      });
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    for (const guest of this.guests) this.send(guest.conn, { t: 'closed' });
    // Give the goodbye a moment to leave before tearing the connections down.
    setTimeout(() => this.peer.destroy(), 300);
  }
}
