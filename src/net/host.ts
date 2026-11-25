// The host's side of an invite-code game. The host holds the real game state,
// checks every move, runs the computer players, and sends each guest a copy of
// the game with everyone else's cards hidden.

import Peer, { type DataConnection } from 'peerjs';
import {
  DEFAULT_EXTRAS,
  applyAction,
  createGame,
  dealerForRound,
  matchWinnerIds,
  newMatch,
  recordRound,
  startingCashFor,
  maskStateFor,
  randomSeed,
  rulesFor,
  validateAction,
  type Action,
  type Difficulty,
  type Extras,
  type GameState,
  type MatchState,
  type RuleSetId,
  type SeatConfig,
} from '../engine';
import {
  MAX_PLAYERS,
  PING_EVERY_MS,
  RETRY_EVERY_MS,
  SILENCE_TIMEOUT_MS,
  makeCode,
  peerOptions,
  roomPeerId,
  toWire,
  type GuestMessage,
  type HostMessage,
  type LobbyInfo,
} from './protocol';

type Guest = { conn: DataConnection; name: string; device: string; lastSeen: number };

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
  matchTarget = 1;
  matchCarry = false;
  match: MatchState = newMatch(1);
  game: { id: number; state: GameState } | null = null;
  /** True while the connection service knows this game's code, i.e. friends can find it right now. */
  listening = false;
  version = 0;

  private peer!: Peer;
  private seatByConn = new Map<DataConnection, string>();
  private listeners = new Set<() => void>();
  private closed = false;
  private attempts = 0;
  private restoring: ReturnType<typeof setTimeout> | undefined;
  private lastTick = Date.now();
  /** Seats whose player dropped out mid-game, by device and by name, so they can come back. */
  private emptySeats = new Map<string, { seatId: string; name: string }>();
  private heartbeat: ReturnType<typeof setInterval>;

  constructor(public hostName: string) {
    this.open();
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onVisibility);
    this.heartbeat = setInterval(() => {
      const now = Date.now();
      // If this page was suspended (a phone call, another app), every guest looks
      // silent the moment it wakes. Give them a fresh chance to check in first.
      if (now - this.lastTick > PING_EVERY_MS * 3) for (const guest of this.guests) guest.lastSeen = now;
      this.lastTick = now;
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

  /** Back on screen: make sure new players (and returning ones) can still find this game. */
  private onVisibility = () => {
    if (document.visibilityState !== 'visible' || this.closed) return;
    if (this.peer.disconnected || this.peer.destroyed) {
      this.listening = false;
      this.changed();
      clearTimeout(this.restoring);
      this.restoring = undefined;
      this.restore(true);
    }
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  /**
   * Register this game with the connection service under its code, so friends can
   * find it. Called again whenever that registration is lost for good.
   */
  private open() {
    const peer = new Peer(roomPeerId(this.code), peerOptions());
    this.peer = peer;
    if (this.status === 'error') this.status = 'opening';
    const mine = () => peer === this.peer && !this.closed;

    peer.on('open', () => {
      if (!mine()) return;
      this.status = 'open';
      this.listening = true;
      this.changed();
    });
    peer.on('connection', (conn) => mine() && this.accept(conn));
    const lostService = () => {
      if (!mine()) return;
      this.listening = false;
      this.changed();
      this.restore();
    };
    peer.on('disconnected', lostService);
    peer.on('close', lostService);
    peer.on('error', (err) => {
      if (!mine()) return;
      if (this.status === 'opening' && err.type === 'unavailable-id' && this.attempts++ < 5) {
        // Before anyone has seen the code: somebody else is using it, so pick another.
        this.peer.destroy();
        this.code = makeCode();
        this.open();
        return;
      }
      if (this.status === 'opening') {
        this.status = 'error';
        this.error = 'Could not reach the game-connection service. Check your internet — still trying…';
      }
      // Once the code has been shown it must never change. Whatever went wrong,
      // the only answer is to get this same code back onto the service.
      this.listening = !peer.disconnected && !peer.destroyed && this.status === 'open';
      this.changed();
      this.restore();
    });
  }

  /** Keep trying, every few seconds, until friends can find this game again. */
  private restore(now = false) {
    if (this.closed || this.restoring) return;
    this.restoring = setTimeout(
      () => {
        this.restoring = undefined;
        if (this.closed) return;
        const healthy = this.listening && !this.peer.destroyed && !this.peer.disconnected;
        if (healthy) return;
        if (this.peer.destroyed) this.open();
        else if (this.peer.disconnected) this.peer.reconnect();
        this.restore();
      },
      now ? 0 : RETRY_EVERY_MS,
    );
  }

  private accept(conn: DataConnection) {
    conn.on('data', (data) => this.receive(conn, data as GuestMessage));
    conn.on('close', () => this.leave(conn));
    conn.on('error', () => this.leave(conn));
  }

  private send(conn: DataConnection, message: HostMessage) {
    if (!conn.open) return;
    for (const piece of toWire(message)) conn.send(piece);
  }

  private receive(conn: DataConnection, message: GuestMessage) {
    const known = this.guests.find((g) => g.conn === conn);
    if (known) known.lastSeen = Date.now();
    if (message.t === 'ping') return;
    if (message.t === 'join') {
      if (known) return;
      const device = String(message.device ?? '');
      const returning = device ? this.guests.find((g) => g.device === device) : undefined;
      if (returning) {
        // The same device on a fresh connection (its old one broke before we noticed):
        // keep its seat and name, and just swap the connection over.
        const old = returning.conn;
        const seatId = this.seatByConn.get(old);
        this.seatByConn.delete(old);
        returning.conn = conn;
        returning.lastSeen = Date.now();
        if (seatId) this.seatByConn.set(conn, seatId);
        old.close();
        this.sendLobby();
        this.sendState();
        this.changed();
        return;
      }
      if (this.game && this.rejoin(conn, String(message.name ?? ''), device)) return;
      const refuse = (reason: string) => {
        this.send(conn, { t: 'refused', reason });
        setTimeout(() => conn.close(), 500);
      };
      if (this.game) return refuse('That game has already started.');
      if (this.guests.length >= MAX_PLAYERS - 1) return refuse('That game is full.');
      this.guests.push({ conn, name: this.uniqueName(String(message.name ?? '')), device, lastSeen: Date.now() });
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
  private rejoin(conn: DataConnection, rawName: string, device: string): boolean {
    const typed = rawName.trim().slice(0, 14);
    const held = this.emptySeats.get(`device:${device}`) ?? this.emptySeats.get(`name:${typed.toLowerCase()}`);
    if (!this.game || !held) return false;
    const { seatId, name } = held;
    for (const [key, seat] of this.emptySeats) if (seat.seatId === seatId) this.emptySeats.delete(key);
    const state = this.game.state;
    this.game = {
      id: this.game.id,
      state: {
        ...state,
        players: state.players.map((p) => (p.id === seatId ? { ...p, isAI: false, difficulty: undefined, name } : p)),
      },
    };
    this.guests.push({ conn, name, device, lastSeen: Date.now() });
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
      const held = { seatId, name: guest.name };
      this.emptySeats.set(`name:${guest.name.toLowerCase()}`, held);
      if (guest.device) this.emptySeats.set(`device:${guest.device}`, held);
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
      matchTarget: this.matchTarget,
      matchCarry: this.matchCarry,
      difficulty: this.difficulty,
    };
  }

  maxComputers(): number {
    return MAX_PLAYERS - 1 - this.guests.length;
  }

  configure(patch: { computers?: number; difficulty?: Difficulty; ruleSet?: RuleSetId; extras?: Extras; matchTarget?: number; matchCarry?: boolean }) {
    if (patch.computers !== undefined) this.computers = Math.max(0, Math.min(patch.computers, this.maxComputers()));
    if (patch.difficulty) this.difficulty = patch.difficulty;
    if (patch.ruleSet) this.ruleSet = patch.ruleSet;
    if (patch.extras) this.extras = patch.extras;
    if (patch.matchTarget) this.matchTarget = patch.matchTarget;
    if (patch.matchCarry !== undefined) this.matchCarry = patch.matchCarry;
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

  /** Start a new game or match for everyone in the room. Seat 1 is always the host. */
  start() {
    if (!this.canStart()) return;
    const seats: SeatConfig[] = [
      { name: this.hostName, isAI: false },
      ...this.guests.map((g) => ({ name: g.name, isAI: false })),
      ...AI_NAMES.slice(0, this.computers).map((name) => ({ name, isAI: true, difficulty: this.difficulty })),
    ];
    this.match = newMatch(this.matchTarget, Math.floor(Math.random() * seats.length), this.matchCarry);
    const state = this.deal(seats);
    this.seatByConn.clear();
    this.emptySeats.clear();
    this.guests.forEach((g, i) => this.seatByConn.set(g.conn, state.players[i + 1].id));
    this.sendState();
    this.changed();
  }

  private deal(seats: SeatConfig[]): GameState {
    const state = createGame({
      players: seats,
      seed: randomSeed(),
      rules: rulesFor(this.ruleSet, this.extras),
      dealerIndex: dealerForRound(this.match, seats.length),
      startingCash: startingCashFor(this.match, seats.map((_, i) => `p${i + 1}`)),
    });
    this.game = { id: Date.now(), state };
    return state;
  }

  /**
   * After a finished game: deal the next round of the match to the same seats,
   * or start a fresh game/match if this one has been decided.
   */
  playOn() {
    if (!this.game || this.game.state.phase !== 'finished') return;
    const after = recordRound(this.match, this.game.state);
    if (matchWinnerIds(after)) return this.start();
    this.match = after;
    // Same seats as the round just played, so scores stay with the right players
    // (including any seat a computer took over when someone dropped out).
    this.deal(this.game.state.players.map((p) => ({ name: p.name, isAI: p.isAI, difficulty: p.difficulty })));
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
        game: { id: this.game.id, seatId, state: maskStateFor(this.game.state, seatId), match: this.match },
      });
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    clearTimeout(this.restoring);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('online', this.onVisibility);
    for (const guest of this.guests) this.send(guest.conn, { t: 'closed' });
    // Give the goodbye a moment to leave before tearing the connections down.
    setTimeout(() => this.peer.destroy(), 300);
  }
}
