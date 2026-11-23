// A guest's side of an invite-code game: connect to the host by code, send
// moves, and show whatever game view the host sends back.

import Peer, { type DataConnection } from 'peerjs';
import type { Action } from '../engine';
import {
  PING_EVERY_MS,
  Reassembler,
  SILENCE_TIMEOUT_MS,
  peerOptions,
  roomPeerId,
  type GuestMessage,
  type HostMessage,
  type LobbyInfo,
  type OnlineGame,
} from './protocol';

const CONNECT_TIMEOUT_MS = 20_000;

export class GuestRoom {
  status: 'connecting' | 'lobby' | 'playing' | 'ended' = 'connecting';
  /** Why the room ended, in words for the player. */
  message = '';
  lobby: LobbyInfo | null = null;
  myName = '';
  game: OnlineGame | null = null;
  version = 0;

  private peer: Peer;
  private conn: DataConnection | null = null;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout>;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private lastSeen = 0;
  private parts = new Reassembler();

  constructor(
    public code: string,
    name: string,
  ) {
    this.peer = new Peer(peerOptions());
    this.timer = setTimeout(
      () => this.end("Couldn't find that game. Check the code and make sure the host is still waiting."),
      CONNECT_TIMEOUT_MS,
    );
    this.peer.on('open', () => {
      const conn = this.peer.connect(roomPeerId(code), { reliable: true, serialization: 'json' });
      this.conn = conn;
      conn.on('open', () => {
        this.send({ t: 'join', name });
        this.lastSeen = Date.now();
        this.heartbeat = setInterval(() => {
          if (Date.now() - this.lastSeen > SILENCE_TIMEOUT_MS) this.end('The connection to the host was lost.');
          else this.send({ t: 'ping' });
        }, PING_EVERY_MS);
      });
      conn.on('data', (data) => {
        this.lastSeen = Date.now();
        const message = this.parts.read(data);
        if (message) this.receive(message as HostMessage);
      });
      conn.on('close', () => this.end('The connection to the host was lost.'));
      conn.on('error', () => this.end('The connection to the host was lost.'));
    });
    this.peer.on('error', (err) => {
      this.end(
        err.type === 'peer-unavailable'
          ? "Couldn't find a game with that code. Check the code and try again."
          : 'Could not reach the game-connection service. Check your internet and try again.',
      );
    });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  private send(message: GuestMessage) {
    if (this.conn?.open) this.conn.send(message);
  }

  private receive(message: HostMessage) {
    if (this.status === 'ended') return;
    this.lastSeen = Date.now();
    if (message.t === 'ping') return;
    clearTimeout(this.timer);
    switch (message.t) {
      case 'lobby':
        this.lobby = message.lobby;
        this.myName = message.you;
        if (!this.game) this.status = 'lobby';
        break;
      case 'state':
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
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    this.status = 'ended';
    this.message = message;
    this.changed();
    this.peer.destroy();
  }

  /** Leave on purpose. */
  close() {
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    this.status = 'ended';
    this.peer.destroy();
  }
}
