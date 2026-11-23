// "Play with Friends": host a game and share its invite code, or join one.

import { useState, useSyncExternalStore } from 'react';
import type { Difficulty } from '../engine';
import { GuestRoom } from '../net/guest';
import { HostRoom } from '../net/host';
import { CODE_LENGTH, cleanCode, type LobbyInfo } from '../net/protocol';
import { Game } from './Game';
import { ExtrasPicker, MatchPicker, RULE_CHOICES, extrasSummary, matchLengthName } from './Screens';
import type { Settings } from './storage';

const NAME_KEY = 'bankrupt.name';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // optional
  }
}

/** The invite code in the page address (…?join=ABCDE), if there is one. */
export function codeFromAddress(): string {
  return cleanCode(new URLSearchParams(window.location.search).get('join') ?? '');
}

function inviteLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}?join=${code}`;
}

type Props = {
  settings: Settings;
  onToggleSound: () => void;
  onExit: () => void;
  initialCode: string;
};

type Mode = { kind: 'choose' } | { kind: 'host'; room: HostRoom } | { kind: 'guest'; room: GuestRoom };

export function Friends({ settings, onToggleSound, onExit, initialCode }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'choose' });
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(initialCode);

  // Note: the connection is deliberately NOT closed when the page is hidden. Phones hide the
  // page for a call or another app, and the game should still be there when the player returns.

  const leave = () => {
    if (mode.kind !== 'choose') mode.room.close();
    onExit();
  };

  const playerName = name.trim().slice(0, 14);
  const ready = playerName.length > 0;

  if (mode.kind === 'host') {
    return <HostView room={mode.room} settings={settings} onToggleSound={onToggleSound} onExit={leave} />;
  }
  if (mode.kind === 'guest') {
    return (
      <GuestView
        room={mode.room}
        settings={settings}
        onToggleSound={onToggleSound}
        onExit={leave}
        onRetry={() => {
          mode.room.close();
          setMode({ kind: 'choose' });
        }}
      />
    );
  }

  return (
    <main className="page">
      <header className="page__head">
        <button type="button" className="btn btn--ghost" onClick={onExit}>
          ← Menu
        </button>
        <h1>Play with Friends</h1>
      </header>
      <p className="note">Everyone plays on their own phone, tablet or computer. One person hosts and shares the code.</p>

      <label className="stack">
        <span>Your name</span>
        <input
          type="text"
          value={name}
          maxLength={14}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            saveName(e.target.value);
          }}
        />
      </label>

      <section className="choice">
        <h2>Start a new game</h2>
        <p className="note">You get an invite code for up to three other players.</p>
        <button
          type="button"
          className="btn btn--primary btn--wide"
          disabled={!ready}
          onClick={() => setMode({ kind: 'host', room: new HostRoom(playerName) })}
        >
          Host a Game
        </button>
      </section>

      <section className="choice">
        <h2>Join a game</h2>
        <label className="stack">
          <span>Invite code</span>
          <input
            type="text"
            className="codeinput"
            value={code}
            placeholder={'•'.repeat(CODE_LENGTH)}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCode(cleanCode(e.target.value))}
          />
        </label>
        <button
          type="button"
          className="btn btn--primary btn--wide"
          disabled={!ready || code.length !== CODE_LENGTH}
          onClick={() => setMode({ kind: 'guest', room: new GuestRoom(code, playerName) })}
        >
          Join Game
        </button>
      </section>
      {!ready && <p className="note note--warn">Type your name first.</p>}
    </main>
  );
}

function PlayerList({ lobby, me }: { lobby: LobbyInfo; me: string }) {
  return (
    <ul className="roster" aria-label="Players in this game">
      {lobby.players.map((p) => (
        <li key={`${p.kind}-${p.name}`}>
          <strong>{p.name}</strong>
          {p.name === me && p.kind !== 'computer' && <span className="tag">you</span>}
          {p.kind === 'host' && <span className="tag">host</span>}
          {p.kind === 'computer' && <span className="tag">{lobby.difficulty} computer</span>}
        </li>
      ))}
    </ul>
  );
}

function HostView({
  room,
  settings,
  onToggleSound,
  onExit,
}: {
  room: HostRoom;
  settings: Settings;
  onToggleSound: () => void;
  onExit: () => void;
}) {
  useSyncExternalStore(room.subscribe, () => room.version);
  const [copied, setCopied] = useState(false);

  if (room.game) {
    return (
      <Game
        key={room.game.id}
        initialState={room.game.state}
        settings={settings}
        onToggleSound={onToggleSound}
        onExit={onExit}
        onPlayAgain={() => room.playOn()}
        match={room.match}
        online={{ state: room.game.state, seatId: room.game.state.players[0].id, runAI: true, onAction: room.apply }}
      />
    );
  }

  const lobby = room.lobby();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(room.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the code on screen still works.
    }
  };

  return (
    <main className="page">
      <header className="page__head">
        <button type="button" className="btn btn--ghost" onClick={onExit}>
          ← Leave
        </button>
        <h1>Your Game</h1>
      </header>

      {room.status === 'error' ? (
        <p className="note note--warn" role="alert">
          {room.error}
        </p>
      ) : room.status === 'opening' ? (
        <p className="note" role="status">
          Setting up your game…
        </p>
      ) : (
        <section className="invite" aria-label="Invite code">
          <p className="invite__label">Invite code</p>
          <p className="invite__code" data-testid="invite-code">
            {room.code}
          </p>
          <p className="note">Friends tap “Play with Friends”, then “Join Game”, and type this code.</p>
          <button type="button" className="btn" onClick={copy}>
            {copied ? 'Link copied!' : 'Copy invite link'}
          </button>
        </section>
      )}

      <PlayerList lobby={lobby} me={room.hostName} />

      <div className="settings">
        <label>
          <span>Computer players</span>
          <select value={room.computers} onChange={(e) => room.configure({ computers: Number(e.target.value) })}>
            {Array.from({ length: room.maxComputers() + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? 'None' : n}
              </option>
            ))}
          </select>
        </label>
        {room.computers > 0 && (
          <label>
            <span>Computer difficulty</span>
            <select value={room.difficulty} onChange={(e) => room.configure({ difficulty: e.target.value as Difficulty })}>
              <option value="casual">Casual</option>
              <option value="competitive">Competitive</option>
              <option value="expert">Expert</option>
            </select>
          </label>
        )}
      </div>

      <fieldset className="field">
        <legend>Rules</legend>
        <div className="segmented">
          {RULE_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={`btn${room.ruleSet === choice.id ? ' btn--primary' : ''}`}
              aria-pressed={room.ruleSet === choice.id}
              onClick={() => room.configure({ ruleSet: choice.id })}
            >
              {choice.name}
            </button>
          ))}
        </div>
        <p className="note">{RULE_CHOICES.find((c) => c.id === room.ruleSet)!.summary}</p>
      </fieldset>

      <ExtrasPicker extras={room.extras} onChange={(extras) => room.configure({ extras })} />

      <MatchPicker target={room.matchTarget} onChange={(matchTarget) => room.configure({ matchTarget })} />

      <button
        type="button"
        className="btn btn--primary btn--wide"
        disabled={!room.canStart() || room.status !== 'open'}
        onClick={() => room.start()}
      >
        Start Game
      </button>
      {!room.canStart() && <p className="note">Waiting for at least one more player (or add a computer player).</p>}
    </main>
  );
}

function GuestView({
  room,
  settings,
  onToggleSound,
  onExit,
  onRetry,
}: {
  room: GuestRoom;
  settings: Settings;
  onToggleSound: () => void;
  onExit: () => void;
  onRetry: () => void;
}) {
  useSyncExternalStore(room.subscribe, () => room.version);

  if ((room.status === 'playing' || room.status === 'reconnecting') && room.game) {
    return (
      <>
        {room.status === 'reconnecting' && (
          <div className="overlay overlay--top" role="alert">
            <div className="dialog">
              <h2>Reconnecting…</h2>
              <p>The connection dropped. Your seat is saved and the game will carry on as soon as you are back.</p>
              <button type="button" className="btn" onClick={onExit}>
                Leave Game
              </button>
            </div>
          </div>
        )}
        <Game
        key={room.game.id}
        initialState={room.game.state}
        settings={settings}
        onToggleSound={onToggleSound}
        onExit={onExit}
          online={{ state: room.game.state, seatId: room.game.seatId, runAI: false, onAction: room.sendAction }}
          match={room.game.match}
        />
      </>
    );
  }

  return (
    <main className="page">
      <header className="page__head">
        <button type="button" className="btn btn--ghost" onClick={onExit}>
          ← Leave
        </button>
        <h1>Game {room.code}</h1>
      </header>

      {room.status === 'connecting' && (
        <p className="note" role="status">
          Looking for game {room.code}…
        </p>
      )}
      {room.status === 'reconnecting' && (
        <p className="note note--warn" role="alert">
          The connection dropped. Reconnecting…
        </p>
      )}

      {room.status === 'lobby' && room.lobby && (
        <>
          <p className="status status--you" role="status">
            You're in! Waiting for the host to start…
          </p>
          <PlayerList lobby={room.lobby} me={room.myName} />
          <p className="note">
            Rules: <strong>{RULE_CHOICES.find((c) => c.id === room.lobby!.ruleSet)!.name}</strong> —{' '}
            {RULE_CHOICES.find((c) => c.id === room.lobby!.ruleSet)!.summary}
          </p>
          <p className="note">
            Extras: <strong>{extrasSummary(room.lobby.extras)}</strong>. Match:{' '}
            <strong>{matchLengthName(room.lobby.matchTarget)}</strong>
          </p>
        </>
      )}

      {room.status === 'ended' && (
        <>
          <p className="note note--warn" role="alert">
            {room.message}
          </p>
          <button type="button" className="btn btn--primary btn--wide" onClick={onRetry}>
            Try Again
          </button>
        </>
      )}
    </main>
  );
}
