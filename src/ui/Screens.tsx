// Menu, setup, how-to-play, settings and credits screens (spec §15.1, §15.2, §20).

import { useState, type ReactNode } from 'react';
import {
  BANK_SWAP_CARDS,
  HAND_SIZE,
  RULE_SETS,
  SHOP_ITEMS,
  deckCardCount,
  deckSizeFor,
  twoPlayerDefenseCount, type Card, type Difficulty, type Extras, type RuleSetId, type SeatConfig } from '../engine';
import { CREATOR_CREDIT, TAGLINE } from './branding';
import { CardView } from './Card';
import type { Settings } from './storage';

const AI_NAMES = ['Penny', 'Buck', 'Goldie'];

export const RULE_CHOICES: { id: RuleSetId; name: string; summary: string }[] = [
  {
    id: 'original',
    name: 'Original',
    summary:
      'Draw a Bankrupt card and your whole bank is gone unless you play Vault Lock. The game ends the moment the sixth Bankrupt is drawn.',
  },
  {
    id: 'attack',
    name: 'Bankrupt Attack',
    summary:
      "Bankrupt cards go secretly into your hand. Play one to wipe out another player's bank — unless they block it with Vault Lock. Once the sixth has been drawn, everyone gets one last turn.",
  },
  {
    id: 'piggy',
    name: 'Piggy Bank',
    summary:
      'A gentler twist on the Original: when you go bankrupt you keep your smallest pile, and everyone gets one last turn after the sixth Bankrupt. With 2 players, the deck has fewer Vault Locks and Sheriffs.',
  },
];

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

export function ExtrasPicker({ extras, onChange }: { extras: Extras; onChange: (extras: Extras) => void }) {
  return (
    <fieldset className="field extras">
      <legend>Extras</legend>
      <label>
        <input type="checkbox" checked={extras.shop} onChange={(e) => onChange({ ...extras, shop: e.target.checked })} />
        <span>
          <strong>Power-up shop</strong> — spend money from your bank on power-ups like Double Up and Big Heist.
        </span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={extras.bankSwap}
          onChange={(e) => onChange({ ...extras, bankSwap: e.target.checked })}
        />
        <span>
          <strong>Bank Swap and Lawyer cards</strong> — Bank Swap trades your whole bank with another player's;
          only a Lawyer can block it.
        </span>
      </label>
    </fieldset>
  );
}

export function extrasSummary(extras: Extras): string {
  const on = [extras.shop && 'Power-up shop', extras.bankSwap && 'Bank Swap and Lawyer cards'].filter(Boolean);
  return on.length > 0 ? on.join(' and ') : 'none';
}

type MenuProps = {
  hasSave: boolean;
  onContinue: () => void;
  onSolo: () => void;
  onLocal: () => void;
  onFriends: () => void;
  onNavigate: (screen: 'howto' | 'settings' | 'credits') => void;
};

export function Menu({ hasSave, onContinue, onSolo, onLocal, onFriends, onNavigate }: MenuProps) {
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
        <button type="button" className="btn btn--wide" onClick={onFriends}>
          Play with Friends <small>invite code</small>
        </button>
        <button type="button" className="btn btn--wide" onClick={onLocal}>
          Pass &amp; Play <small>one device</small>
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
  initialRuleSet,
  initialExtras,
  onStart,
  onBack,
}: {
  initialSeats: SeatConfig[];
  initialRuleSet: RuleSetId;
  initialExtras: Extras;
  onStart: (seats: SeatConfig[], ruleSet: RuleSetId, extras: Extras) => void;
  onBack: () => void;
}) {
  const [seats, setSeats] = useState<SeatConfig[]>(initialSeats);
  const [ruleSet, setRuleSet] = useState<RuleSetId>(initialRuleSet);
  const [extras, setExtras] = useState<Extras>(initialExtras);

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

      <fieldset className="field">
        <legend>Rules</legend>
        <div className="segmented">
          {RULE_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={`btn${ruleSet === choice.id ? ' btn--primary' : ''}`}
              aria-pressed={ruleSet === choice.id}
              onClick={() => setRuleSet(choice.id)}
            >
              {choice.name}
            </button>
          ))}
        </div>
        <p className="note">{RULE_CHOICES.find((choice) => choice.id === ruleSet)!.summary}</p>
      </fieldset>

      <ExtrasPicker extras={extras} onChange={setExtras} />

      {seats.filter((s) => !s.isAI).length > 1 && (
        <p className="note">Pass-and-play: the game hides each hand and asks you to pass the device between turns.</p>
      )}
      {duplicate && <p className="note note--warn">Give every player a different name.</p>}

      <button type="button" className="btn btn--primary btn--wide" disabled={duplicate} onClick={() => onStart(cleaned, ruleSet, extras)}>
        Start Game
      </button>
    </Page>
  );
}

const REFERENCE: { card: Card; text: string }[] = [
  { card: { id: 'ref-5', kind: 'money', value: 5 }, text: 'Money. Bank 2 or more that match.' },
  { card: { id: 'ref-25', kind: 'money', value: 25 }, text: 'Money. Bank 2 or more that match.' },
  { card: { id: 'ref-50', kind: 'money', value: 50 }, text: 'Money. Bank 2 or more that match.' },
  { card: { id: 'ref-100', kind: 'money', value: 100 }, text: 'Money. Bank 2 or more that match.' },
  { card: { id: 'ref-b', kind: 'bankrupt' }, text: 'Draw it and your own bank is wiped out, unless you play Vault Lock. Always exactly 6 in the deck.' },
  { card: { id: 'ref-v', kind: 'vault_lock' }, text: 'Keep it in your hand. When you draw Bankrupt, play it to save your bank. Used once.' },
  { card: { id: 'ref-t', kind: 'bank_thief' }, text: "Steal one money card from an opponent's bank. Blocked by Sheriff." },
  { card: { id: 'ref-s', kind: 'sheriff' }, text: 'Play it when a Bank Thief comes for you to cancel it. Used once.' },
  {
    card: { id: 'ref-w', kind: 'bank_swap' },
    text: 'Extra card. Play it on another player to trade your whole bank for theirs. Blocked only by Lawyer.',
  },
  {
    card: { id: 'ref-l', kind: 'lawyer' },
    text: 'Extra card. Play it when someone plays Bank Swap on you to cancel it. Used once.',
  },
];

/** Deck contents at each table size, worked out from the rules so this page cannot go stale. */
const DECKS = [2, 3, 4].map((players) => {
  const size = deckSizeFor(players, 'by_players', BANK_SWAP_CARDS);
  return {
    players,
    money: size.moneyCopies,
    specials: size.specialCopies,
    swaps: size.swapCopies,
    withExtras: deckCardCount(size),
    withoutExtras: deckCardCount({ ...size, swapCopies: 0 }),
  };
});
const TWO_PLAYER = DECKS[0];
const PIGGY_TWO_PLAYER_DEFENSES = twoPlayerDefenseCount(
  deckSizeFor(2, 'by_players'),
  RULE_SETS.piggy.twoPlayerDefenseCopies,
);

export function HowToPlay({ onBack, onPractice }: { onBack: () => void; onPractice: () => void }) {
  return (
    <Page title="How to Play" onBack={onBack}>
      <div className="prose">
        <h2>The goal</h2>
        <p>
          Have the most money <strong>in your bank</strong> when the game ends. Cards still in your hand do not count.
        </p>

        <h2>On your turn — do one thing</h2>
        <p>If the power-up shop is on, you may buy one power-up first. Then pick one:</p>
        <ul>
          <li>
            <strong>Bank</strong> 2 or more matching money cards (two $100s bank $200), <em>or</em>
          </li>
          <li>
            play <strong>Bank Thief</strong> to steal one money card from an opponent's bank.
          </li>
          <li>
            Or <strong>discard</strong> one card — you can always do this, even if you could have played something.
          </li>
        </ul>
        <p>
          Everyone starts with {HAND_SIZE} cards. After your turn you draw back up to {HAND_SIZE}. If you use a Vault
          Lock, Sheriff or Lawyer when it is not your turn, you draw back up to {HAND_SIZE} straight away. Discarded
          cards never come back.
        </p>

        <h2>Watch out — Bankrupt!</h2>
        <p>
          Six <strong>Bankrupt</strong> cards are hiding in the deck. If you <strong>draw</strong> one, your whole bank
          is wiped out — unless you have a <strong>Vault Lock</strong> in your hand to save it. Nobody holds or plays
          Bankrupt cards; they go off the moment they are drawn. If your bank is empty, you got lucky.
        </p>

        <h2>Thieves and Sheriffs</h2>
        <p>
          When someone plays Bank Thief on you, play a <strong>Sheriff</strong> to stop it. Banks are face-up for
          everyone to see — a big bank is a big target.
        </p>

        <h2>How it ends</h2>
        <p>
          The counter shows how many Bankrupt cards have been drawn. When the <strong>sixth</strong> one is drawn, the
          game is over right away and the richest bank wins. If two banks tie, the one with more cards wins; if that
          ties too, the win is shared.
        </p>

        <h2>Extra: the power-up shop</h2>
        <p>
          When the shop is switched on, you can spend money from your own bank at the start of your turn, before you
          play. One power-up per turn. The price comes straight out of your bank, so every purchase is a gamble.
        </p>
        <ul>
          {SHOP_ITEMS.map((item) => (
            <li key={item.id}>
              <strong>
                {item.name} — ${item.price}:
              </strong>{' '}
              {item.blurb}
            </li>
          ))}
        </ul>
        <p>
          Doubled matches, insurance payouts and change from the shop sit in your bank as cash. Cash counts toward
          winning and is lost if you go bankrupt, but an ordinary Bank Thief can only take cards.
        </p>

        <h2>Extra: Bank Swap and Lawyer cards</h2>
        <p>
          When switched on, Bank Swap cards and the same number of Lawyer cards are shuffled into the deck (
          {DECKS.map((d) => `${d.swaps} of each with ${d.players} players`).join(', ')}). Play a Bank Swap on another
          player to trade your whole bank for theirs — perfect when you are behind. Only a <strong>Lawyer</strong> can
          stop it; a Sheriff cannot. You never have to play a Bank Swap.
        </p>

        <h2>What is in the deck</h2>
        <p>
          There are always exactly 6 Bankrupt cards. The rest of the deck grows with the number of players, so the
          game lasts about as long however many are playing.
        </p>
        <div className="tablewrap">
          <table className="results">
            <thead>
              <tr>
                <th scope="col">Players</th>
                <th scope="col">Each money value</th>
                <th scope="col">Vault Lock, Bank Thief, Sheriff</th>
                <th scope="col">Bank Swap, Lawyer (extra)</th>
                <th scope="col">Cards in all</th>
              </tr>
            </thead>
            <tbody>
              {DECKS.map((d) => (
                <tr key={d.players}>
                  <th scope="row">{d.players}</th>
                  <td>{d.money}</td>
                  <td>{d.specials} each</td>
                  <td>{d.swaps} each</td>
                  <td>
                    {d.withoutExtras} <small>({d.withExtras} with the extra cards)</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Playing together</h2>
        <ul>
          <li>
            <strong>Play with Friends:</strong> one person hosts and gets an invite code. Up to three others type the
            code (or open the invite link) on their own phone, tablet or computer.
          </li>
          <li>
            <strong>Pass &amp; Play:</strong> everyone shares one device and passes it round. The game hides each hand
            between turns.
          </li>
          <li>
            <strong>Play vs Computer:</strong> play against one to three computer players.
          </li>
        </ul>

        <h2>Bankrupt Attack mode</h2>
        <p>
          Pick this on the Game Setup screen to turn Bankrupt into a weapon. When you draw a Bankrupt card it goes
          into your hand, and on your turn you can play it on another player to wipe out their whole bank. They can
          block it with a Vault Lock. Drawing one is a secret — nobody is told, and the counter only goes up when a
          Bankrupt is played. Once the sixth has been drawn, everyone gets one last turn, so nobody is left holding
          a Bankrupt they never got to use.
        </p>

        <h2>Piggy Bank rules — a gentler twist</h2>
        <p>
          Also on the Game Setup screen. Bankrupt is a trap again, but when you go bankrupt you keep your smallest
          pile (the one worth the least — but a one-pile bank is still all gone). After the sixth Bankrupt, everyone
          gets one last turn. In a 2-player game there are only {PIGGY_TWO_PLAYER_DEFENSES} Vault Locks and{' '}
          {PIGGY_TWO_PLAYER_DEFENSES} Sheriffs (the usual deck has {TWO_PLAYER.specials} of each), so attacks get
          through more often.
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
        The creator has the final say on every rule — including whether Piggy Bank rules stay.
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
        <p>The cards, the matching rule and the Bankrupt trap are all from the original game.</p>
        <p>
          BANKRUPT uses pretend money only. There is no betting and nothing to buy.
        </p>
      </div>
    </Page>
  );
}
