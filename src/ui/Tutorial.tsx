// A one-minute, learn-by-playing tutorial. It is a real game on the real rules
// engine, but with a stacked deck and a scripted opponent, and a coach who says
// what to tap next. Only the coached move is accepted at each step.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_RULES,
  applyAction,
  createGame,
  validateAction,
  type Action,
  type Card,
  type GameState,
} from '../engine';
import { Game } from './Game';
import type { Settings } from './storage';

const DONE_KEY = 'bankrupt.tutorialDone';

export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return true;
  }
}

function markDone() {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    // optional
  }
}

const YOU = 'p1';
const PENNY = 'p2';

/** A 2-player game with hand-picked hands and deck order. Specs: '$100', 'sheriff', … */
export function stackedGame(): GameState {
  const state = createGame({
    players: [
      { name: 'Player 1', isAI: false },
      { name: 'Penny', isAI: true, difficulty: 'casual' },
    ],
    seed: 1,
    rules: { ...DEFAULT_RULES, shop: false, bankSwapCards: 0 },
    dealerIndex: 1, // so you go first
  });
  const pool: Card[] = [...state.players[0].hand, ...state.players[1].hand, ...state.drawPile];
  const take = (spec: string): Card => {
    const index = pool.findIndex((c) =>
      spec.startsWith('$') ? c.kind === 'money' && c.value === Number(spec.slice(1)) : c.kind === spec,
    );
    return pool.splice(index, 1)[0];
  };
  const yours = ['$100', '$100', 'bank_thief', 'sheriff', 'vault_lock', '$5'].map(take);
  const pennys = ['$50', '$50', 'bank_thief', '$25', '$25', '$5'].map(take);
  // The order cards will be drawn in, first to last.
  const draws = [
    '$25', '$50', // you, after banking
    '$5', '$100', // Penny, after banking
    '$100', // you, after stealing
    'sheriff', // you, restocking after the Sheriff
    '$5', // Penny, after her thief
    'bankrupt', '$5', '$25', // you, after discarding: Bankrupt!
    'bankrupt', '$5', // Penny, after banking: Bankrupt with no Vault Lock
  ].map(take);
  // Keep the other Bankrupt cards well away from the top.
  pool.sort((a, b) => Number(b.kind === 'bankrupt') - Number(a.kind === 'bankrupt'));
  return {
    ...state,
    players: [
      { ...state.players[0], hand: yours },
      { ...state.players[1], hand: pennys },
    ],
    drawPile: [...pool, ...draws.reverse()], // the top of the deck is the end of the list
  };
}

type Step = {
  /** What the coach says. */
  say: string;
  /** A move you must make: returns true if this is the coached move. */
  expect?: (action: Action, state: GameState) => boolean;
  /** Shown if you try something else. */
  nudge?: string;
  /** A move Penny makes by herself. */
  auto?: (state: GameState) => Action;
  /** No move: just read and tap Next. */
  info?: boolean;
  /** Which part of the table to bring into view on a small screen. */
  look?: 'top' | 'hand';
};

const handCard = (state: GameState, playerId: string, kind: Card['kind'], value?: number) =>
  state.players.find((p) => p.id === playerId)!.hand.filter((c) => c.kind === kind && (value === undefined || c.value === value));

export const STEPS: Step[] = [
  {
    info: true,
    say: 'Welcome to BANKRUPT! The goal is simple: have the most money in your BANK when the game ends. Cards still in your hand do not count.',
  },
  {
    look: 'hand',
    say: 'You have two $100 cards — a match! Tap one of them, then tap “Bank $200”.',
    expect: (a) => a.type === 'bank',
    nudge: 'Tap a $100 card, then the gold “Bank $200” button.',
  },
  {
    look: 'top',
    say: 'Nice — $200 in your bank. Now Penny banks a pair of $50s. Banks are face-up, so everyone can see who is rich…',
    auto: (s) => ({ type: 'bank', playerId: PENNY, cardIds: handCard(s, PENNY, 'money', 50).map((c) => c.id) }),
  },
  {
    look: 'hand',
    say: '…which makes her a target. Tap your Bank Thief card, then tap “Rob Penny”.',
    expect: (a) => a.type === 'attack' && a.targetId === PENNY,
    nudge: 'Tap the orange Bank Thief card, then the red “Rob Penny” button.',
  },
  {
    look: 'top',
    say: 'She has no Sheriff to stop you. Tap the card in Penny’s bank to take it.',
    expect: (a) => a.type === 'steal',
    nudge: 'Tap the $50 card in Penny’s bank, at the top of the screen.',
  },
  {
    say: 'Uh-oh. Penny wants revenge: she plays a Bank Thief on YOU…',
    auto: (s) => ({ type: 'attack', playerId: PENNY, cardId: handCard(s, PENNY, 'bank_thief')[0].id, targetId: YOU }),
  },
  {
    say: '…but you are holding a Sheriff. Tap “Play Sheriff” to stop the thief.',
    expect: (a) => a.type === 'defend' && a.cardId !== null,
    nudge: 'Block it this time — tap “Play Sheriff”.',
  },
  {
    look: 'hand',
    say: 'Blocked! Now you have no match to bank. You can always discard one card and draw a new one. Tap any card except your Vault Lock, then tap “Discard”.',
    expect: (a, s) =>
      a.type === 'discard' && !handCard(s, YOU, 'vault_lock').some((c) => a.cardIds.includes(c.id)),
    nudge: 'Tap a card (not the Vault Lock — you are about to need it), then “Discard”.',
  },
  {
    say: 'BANKRUPT! Six of these are hidden in the deck. Draw one and your whole bank is wiped out… unless you have a Vault Lock. Tap “Play Vault Lock”!',
    expect: (a) => a.type === 'defend' && a.cardId !== null,
    nudge: 'Save your bank — tap “Play Vault Lock”.',
  },
  {
    look: 'top',
    say: 'Phew — your bank is safe. Penny banks a pair of $25s and draws back up…',
    auto: (s) => ({ type: 'bank', playerId: PENNY, cardIds: handCard(s, PENNY, 'money', 25).map((c) => c.id) }),
  },
  {
    info: true,
    say: 'Penny drew a Bankrupt too, with no Vault Lock. Her whole bank is gone! That is how fortunes change in this game.',
  },
  {
    info: true,
    look: 'top',
    say: 'Last thing: the counter at the top shows how many Bankrupt cards are out. When the sixth one is drawn, the game is over and the richest bank wins. You are ready to play!',
  },
];

type Props = {
  settings: Settings;
  onToggleSound: () => void;
  onExit: () => void;
  onPlay: () => void;
};

export function Tutorial({ settings, onToggleSound, onExit, onPlay }: Props) {
  const initial = useMemo(stackedGame, []);
  const [state, setState] = useState(initial);
  const [index, setIndex] = useState(0);
  const [nudge, setNudge] = useState('');
  const stateRef = useRef(state);
  stateRef.current = state;

  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const advance = () => {
    setNudge('');
    setIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };

  // Penny's scripted moves play themselves after a short pause, so you can read first.
  useEffect(() => {
    if (!step.auto) return;
    const timer = setTimeout(() => {
      const action = step.auto!(stateRef.current);
      if (!validateAction(stateRef.current, action)) setState(applyAction(stateRef.current, action));
      advance();
    }, 2600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    if (last) markDone();
  }, [last]);

  // On a small screen, bring the part of the table this step is about into view.
  useEffect(() => {
    if (!step.look) return;
    const reduce = document.documentElement.dataset.motion === 'reduced';
    const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
    if (step.look === 'top') window.scrollTo({ top: 0, behavior });
    else document.querySelector('.tutorial .me')?.scrollIntoView({ block: 'end', behavior });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const onAction = (action: Action) => {
    if (!step.expect) return; // not your move right now
    if (!step.expect(action, state)) {
      setNudge(step.nudge ?? 'Not that one — follow the coach.');
      return;
    }
    if (validateAction(state, action)) return;
    setState(applyAction(state, action));
    advance();
  };

  return (
    <div className="tutorial">
      <aside className="coach" role="status" aria-live="polite">
        <div className="coach__head">
          <strong>
            Coach · step {index + 1} of {STEPS.length}
          </strong>
          <button
            type="button"
            className="coach__skip"
            onClick={() => {
              markDone();
              onExit();
            }}
          >
            {last ? 'Menu' : 'Skip tutorial'}
          </button>
        </div>
        <p className="coach__say">{step.say}</p>
        {nudge && <p className="coach__nudge">{nudge}</p>}
        <div className="coach__actions">
          {step.info && !last && (
            <button type="button" className="btn btn--primary" onClick={advance}>
              Next
            </button>
          )}
          {step.auto && <span className="coach__wait">Watch Penny…</span>}
          {last && (
            <button type="button" className="btn btn--primary" onClick={onPlay}>
              Play a real game
            </button>
          )}
        </div>
      </aside>
      <Game
        initialState={initial}
        settings={settings}
        onToggleSound={onToggleSound}
        onExit={onExit}
        online={{ state, seatId: YOU, runAI: false, onAction }}
      />
    </div>
  );
}
