// A guest's side of an invite-code game: connect to the host by code, send
// moves, and show whatever game view the host sends back.
//
// Phones suspend a web page during a call or when another app is opened, which
// breaks the connection. A guest that has already joined never gives up on the
// first failure: it shows "reconnecting" and keeps trying to get its seat back.

import Peer, { type DataConnection } from 'peerjs';
import type { Action } from '../engine';
import {
  FIND_FOR_MS,
  PING_EVERY_MS,
  RECONNECT_FOR_MS,
  RETRY_EVERY_MS,
  Reassembler,
  SILENCE_TIMEOUT_MS,
  deviceId,
  peerOptions,
  roomPeerId,
  type GuestMessage,
  type HostMessage,
  type LobbyInfo,
  type OnlineGame,
} from './protocol';

/** How long one attempt may take before it is abandoned and a fresh one is made. */
const CONNECT_TIMEOUT_MS = 12_000;

export class GuestRoom {
  status: 'connecting' | 'lobby' | 'playing' | 'reconnecting' | 'ended' = 'connecting';
  /** Why the room ended, in words for the player. */
  message = '';
  lobby: LobbyInfo | null = null;
  myName = '';
  game: OnlineGame | null = null;
  version = 0;

  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private listeners = new Set<() => void>();
  private connectTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private lastSeen = 0;
  private parts = new Reassembler();
  /** True once the host has let us in; from then on a lost connection is retried. */
  private joined = false;
  private giveUpAt = 0;
  /** While still looking for the game: why the last attempt failed, and when to stop. */
  private lookReason = '';
  private lookUntil = Date.now() + FIND_FOR_MS;
  attempts = 0;
  /** Counts connection attempts so events from an abandoned attempt are ignored. */
  private attempt = 0;

  constructor(
    public code: string,
    private name: string,
  ) {
    this.connect();
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onVisibility);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  /** What to tell the player while still looking for the game. */
  get lookingHint(): string {
    if (this.lookReason === '') return '';
    if (this.lookReason === 'peer-unavailable') {
      return 'Not there yet. If the host has just left the game to send you the code, you will connect as soon as they are back on it. Still trying…';
    }
    if (this.lookReason === 'timeout' || this.lookReason === 'closed' || this.lookReason === 'silence') {
      return 'Found the game — still connecting. If the host has switched to another app, you will connect when they come back.';
    }
    return 'Having trouble reaching the connection service. Check your internet. Still trying…';
  }

  private connect() {
    this.dropConnection();
    this.attempts++;
    const attempt = ++this.attempt;
    const current = () => attempt === this.attempt && this.status !== 'ended';
    const peer = new Peer(peerOptions());
    this.peer = peer;
    this.parts = new Reassembler();
    this.connectTimer = setTimeout(() => current() && this.lost('timeout'), CONNECT_TIMEOUT_MS);

    peer.on('open', () => {
      if (!current()) return;
      const conn = peer.connect(roomPeerId(this.code), { reliable: true, serialization: 'json' });
      this.conn = conn;
      conn.on('open', () => {
        if (!current()) return;
        this.lastSeen = Date.now();
        this.send({ t: 'join', name: this.name, device: deviceId() });
        this.heartbeat = setInterval(() => {
          if (Date.now() - this.lastSeen > SILENCE_TIMEOUT_MS) this.lost('silence');
          else this.send({ t: 'ping' });
        }, PING_EVERY_MS);
      });
      conn.on('data', (data) => {
        if (!current()) return;
        this.lastSeen = Date.now();
        const message = this.parts.read(data);
        if (message) this.receive(message as HostMessage);
      });
      conn.on('close', () => current() && this.lost('closed'));
      conn.on('error', () => current() && this.lost('closed'));
    });
    peer.on('error', (err) => current() && this.lost(err.type));
  }

  private dropConnection() {
    clearTimeout(this.connectTimer);
    clearTimeout(this.retryTimer);
    clearInterval(this.heartbeat);
    this.retryTimer = undefined;
    this.attempt++; // anything still arriving from the old connection is ignored
    this.conn = null;
    const old = this.peer;
    this.peer = null;
    if (old && !old.destroyed) old.destroy();
  }

  /** The connection failed or went quiet. */
  private lost(reason: string) {
    if (this.status === 'ended') return;
    if (!this.joined) {
      // Not in yet. Keep looking for a few minutes: the host is very often away from
      // the game screen for a moment, sending the code to the people about to join.
      this.lookReason = reason;
      this.dropConnection();
      if (Date.now() > this.lookUntil) {
        this.end(
          reason === 'peer-unavailable'
            ? "Couldn't find a game with that code. Check the code, and make sure the host has the game open on the screen that shows the code."
            : reason === 'timeout' || reason === 'closed' || reason === 'silence'
              ? 'Found the game, but the two devices could not connect to each other. This happens on some mobile, school and work networks. Try with both devices on the same Wi-Fi.'
              : 'Could not reach the game-connection service. Check your internet and try again.',
        );
        return;
      }
      this.changed();
      this.retryTimer = setTimeout(() => this.connect(), RETRY_EVERY_MS);
      return;
    }
    if (this.status !== 'reconnecting') {
      this.status = 'reconnecting';
      this.giveUpAt = Date.now() + RECONNECT_FOR_MS;
      this.changed();
    }
    this.dropConnection();
    if (Date.now() > this.giveUpAt) {
      this.end('Could not get back into the game. The host may have left.');
      return;
    }
    this.retryTimer = setTimeout(() => this.connect(), RETRY_EVERY_MS);
  }

  /** Coming back to the page (after a call, another app, a network change): check in at once. */
  private onVisibility = () => {
    if (document.visibilityState !== 'visible' || this.status === 'ended') return;
    if (this.status === 'reconnecting' || (this.status === 'connecting' && this.retryTimer)) {
      this.connect();
    } else if (this.joined && Date.now() - this.lastSeen > SILENCE_TIMEOUT_MS) {
      this.lost('silence');
    }
  };

  private send(message: GuestMessage) {
    if (this.conn?.open) this.conn.send(message);
  }

  private receive(message: HostMessage) {
    if (this.status === 'ended' || message.t === 'ping') return;
    clearTimeout(this.connectTimer);
    switch (message.t) {
      case 'lobby':
        this.joined = true;
        this.lobby = message.lobby;
        this.myName = message.you;
        // During a game this is only a roster update; the game state follows.
        if (!this.game) this.status = 'lobby';
        break;
      case 'state':
        this.joined = true;
        this.game = message.game;
        this.status = 'playing';
        break;
      case 'refused':
        return this.end(message.reason);
      case 'closed':
        return this.end('The host closed the game.');
    }
    this.changed();
  }

  sendAction = (action: Action) => this.send({ t: 'action', action });

  private end(message: string) {
    if (this.status === 'ended') return;
    this.status = 'ended';
    this.message = message;
    this.shutDown();
    this.changed();
  }

  private shutDown() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('online', this.onVisibility);
    this.dropConnection();
  }

  /** Leave on purpose. */
  close() {
    this.status = 'ended';
    this.shutDown();
  }
}
