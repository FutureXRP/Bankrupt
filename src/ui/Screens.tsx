// Menu, setup, how-to-play, settings and credits screens (spec §15.1, §15.2, §20).

import { useState, type ReactNode } from 'react';
import type { Card, Difficulty, SeatConfig } from '../engine';
import { CREATOR_CREDIT, TAGLINE } from './branding';
import { CardView } from './Card';
import type { Settings } from './storage';

const AI_NAMES = ['Penny', 'Buck', 'Goldie'];

function Page({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <main className="page">
      <header className="page__head">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Menu
        </button>
        <h1>{title}</h1>
      </header>
      {children}
    </main>
  );
}

export function Logo() {
  return (
    <h1 className="logo" aria-label="BANKRUPT">
      <span aria-hidden="true">BANK</span>
      <span className="logo__crack" aria-hidden="true">
        RUPT
      </span>
    </h1>
  );
}

type MenuProps = {
  hasSave: boolean;
  onContinue: () => void;
  onSolo: () => void;
  onLocal: () => void;
  onNavigate: (screen: 'howto' | 'settings' | 'credits') => void;
};

export function Menu({ hasSave, onContinue, onSolo, onLocal, onNavigate }: MenuProps) {
  return (
    <main className="menu">
      <Logo />
      <p className="menu__tagline">{TAGLINE}</p>
      <nav className="menu__nav" aria-label="Main menu">
        {hasSave && (
          <button type="button" className="btn btn--primary btn--wide" onClick={onContinue}>
            Continue Game
          </button>
        )}
        <button type="button" className={`btn btn--wide${hasSave ? '' : ' btn--primary'}`} onClick={onSolo}>
          Play vs Computer
        </button>
        <button type="button" className="btn btn--wide" onClick={onLocal}>
          Local Multiplayer
        </button>
        <button type="button" className="btn btn--wide" disabled>
          Online Private Room <small>coming later</small>
        </button>
        <button type="button" className="btn btn--wide" onClick={() => onNavigate('howto')}>
          How to Play
        </button>
        <button type="button" className="btn btn--wide" onClick={() => onNavigate('settings')}>
          Settings
        </button>
        <button type="button" className="btn btn--wide" onClick={() => onNavigate('credits')}>
          Credits
        </button>
      </nav>
      <p className="menu__credit">An original game by {CREATOR_CREDIT}</p>
    </main>
  );
}

export function Setup({
  initialSeats,
  onStart,
  onBack,
}: {
  initialSeats: SeatConfig[];
  onStart: (seats: SeatConfig[]) => void;
  onBack: () => void;
}) {
  const [seats, setSeats] = useState<SeatConfig[]>(initialSeats);

  const setCount = (count: number) =>
    setSeats((current) => {
      const next = current.slice(0, count);
      while (next.length < count) {
        const name = AI_NAMES.find((n) => !next.some((s) => s.name === n)) ?? `Player ${next.length + 1}`;
        next.push({ name, isAI: true, difficulty: 'casual' });
      }
      return next;
    });

  const update = (index: number, patch: Partial<SeatConfig>) =>
    setSeats((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const cleaned = seats.map((s, i) => ({ ...s, name: s.name.trim() || `Player ${i + 1}` }));
  const duplicate = new Set(cleaned.map((s) => s.name.toLowerCase())).size !== cleaned.length;

  return (
    <Page title="Game Setup" onBack={onBack}>
      <fieldset className="field">
        <legend>Players</legend>
        <div className="segmented">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              className={`btn${seats.length === n ? ' btn--primary' : ''}`}
              aria-pressed={seats.length === n}
              onClick={() => setCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <ul className="seats">
        {seats.map((seat, i) => (
          <li key={i} className="seat">
            <label className="seat__name">
              <span>Seat {i + 1} name</span>
              <input
                type="text"
                value={seat.name}
                maxLength={14}
                onChange={(e) => update(i, { name: e.target.value })}
              />
            </label>
            <label>
              <span>Played by</span>
              <select
                value={seat.isAI ? 'ai' : 'human'}
                disabled={i === 0}
                onChange={(e) =>
                  update(i, e.target.value === 'ai' ? { isAI: true, difficulty: seat.difficulty ?? 'casual' } : { isAI: false })
                }
              >
                <option value="human">Human</option>
                <option value="ai">Computer</option>
              </select>
            </label>
            <label>
              <span>Difficulty</span>
              <select
                value={seat.difficulty ?? 'casual'}
                disabled={!seat.isAI}
                onChange={(e) => update(i, { difficulty: e.target.value as Difficulty })}
              >
                <option value="casual">Casual</option>
                <option value="competitive">Competitive</option>
                <option value="expert">Expert</option>
              </select>
            </label>
          </li>
        ))}
      </ul>

      {seats.filter((s) => !s.isAI).length > 1 && (
        <p className="note">Pass-and-play: the game hides each hand and asks you to pass the device between turns.</p>
      )}
      {duplicate && <p className="note note--warn">Give every player a different name.</p>}

      <button type="button" className="btn btn--primary btn--wide" disabled={duplicate} onClick={() => onStart(cleaned)}>
        Start Game
      </button>
    </Page>
  );
}

const REFERENCE: { card: Card; text: string }[] = [
  { card: { id: 'ref-5', kind: 'money', value: 5 }, text: '14 in the deck.' },
  { card: { id: 'ref-25', kind: 'money', value: 25 }, text: '14 in the deck.' },
  { card: { id: 'ref-50', kind: 'money', value: 50 }, text: '14 in the deck.' },
  { card: { id: 'ref-100', kind: 'money', value: 100 }, text: '14 in the deck.' },
  { card: { id: 'ref-b', kind: 'bankrupt' }, text: "Empties one opponent's whole bank. Blocked by Vault Lock. 6 in the deck." },
  { card: { id: 'ref-v', kind: 'vault_lock' }, text: 'Play it when you are hit by Bankrupt to cancel it. Used once. 6 in the deck.' },
  { card: { id: 'ref-t', kind: 'bank_thief' }, text: "Steal one money card from an opponent's bank. Blocked by Sheriff. 6 in the deck." },
  { card: { id: 'ref-s', kind: 'sheriff' }, text: 'Play it when a Bank Thief comes for you to cancel it. Used once. 6 in the deck.' },
];

export function HowToPlay({ onBack, onPractice }: { onBack: () => void; onPractice: () => void }) {
  return (
    <Page title="How to Play" onBack={onBack}>
      <div className="prose">
        <h2>The goal</h2>
        <p>
          Have the most money <strong>in your bank</strong> when the game ends. Cards still in your hand do not count.
        </p>

        <h2>On your turn — do one thing</h2>
        <ul>
          <li>
            <strong>Bank</strong> 2 or more matching money cards (two $100s bank $200), <em>or</em>
          </li>
          <li>
            play <strong>Bank Thief</strong> to steal one money card from an opponent's bank, <em>or</em>
          </li>
          <li>
            play <strong>Bankrupt</strong> to wipe out an opponent's whole bank.
          </li>
          <li>If you cannot do any of those, discard one card.</li>
        </ul>
        <p>Then you draw back up to 6 cards. Discarded cards never come back.</p>

        <h2>When you are attacked</h2>
        <p>
          <strong>Vault Lock</strong> stops Bankrupt. <strong>Sheriff</strong> stops Bank Thief. Each one is used up when
          you play it. Banks are face-up for everyone to see — a big bank is a big target.
        </p>

        <h2>The countdown</h2>
        <p>
          There are 6 Bankrupt cards in the deck. Every time one is <strong>drawn</strong>, the counter goes up. When the
          sixth is drawn, everybody gets one final turn. Then the richest bank wins. If two banks tie, the one with more
          cards wins; if that ties too, the win is shared.
        </p>

        <h2>The cards</h2>
      </div>
      <ul className="reference">
        {REFERENCE.map(({ card, text }) => (
          <li key={card.id}>
            <CardView card={card} size="sm" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="note">
        These are playtest rules. A few details — like exactly how much Bank Thief steals — are still waiting for the
        creator's approval.
      </p>
      <button type="button" className="btn btn--primary btn--wide" onClick={onPractice}>
        Play a practice match
      </button>
    </Page>
  );
}

export function SettingsScreen({
  settings,
  onChange,
  onBack,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onBack: () => void;
}) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });
  return (
    <Page title="Settings" onBack={onBack}>
      <div className="settings">
        <label>
          <span>Computer turn speed</span>
          <select value={settings.aiSpeed} onChange={(e) => set('aiSpeed', e.target.value as Settings['aiSpeed'])}>
            <option value="fast">Fast</option>
            <option value="normal">Normal</option>
            <option value="slow">Slow</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.sound} onChange={(e) => set('sound', e.target.checked)} />
          <span>Sound effects</span>
        </label>
        <label>
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={settings.volume}
            disabled={!settings.sound}
            onChange={(e) => set('volume', Number(e.target.value))}
          />
        </label>
        <label>
          <span>Animation</span>
          <select value={settings.motion} onChange={(e) => set('motion', e.target.value as Settings['motion'])}>
            <option value="system">Follow my device</option>
            <option value="full">On</option>
            <option value="reduced">Reduced</option>
          </select>
        </label>
        <label>
          <span>Text size</span>
          <select value={settings.textSize} onChange={(e) => set('textSize', e.target.value as Settings['textSize'])}>
            <option value="normal">Normal</option>
            <option value="large">Large</option>
            <option value="xl">Extra large</option>
          </select>
        </label>
      </div>
    </Page>
  );
}

export function Credits({ onBack }: { onBack: () => void }) {
  return (
    <Page title="Credits" onBack={onBack}>
      <div className="prose">
        <p className="credits__creator">
          BANKRUPT was invented by <strong>{CREATOR_CREDIT}</strong>.
        </p>
        <p>Card names, the six-card hand, the 80-card deck and the Bankrupt countdown are all from the original game.</p>
        <p>
          BANKRUPT uses pretend money only. There is no betting and nothing to buy.
        </p>
      </div>
    </Page>
  );
}
