// BANKRUPT: BOOMTOWN — the board game screen (setup, table and end of game).

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { boardView, chooseBoardAction } from '../board/ai';
import {
  ATTACK_NAMES,
  BANKRUPT_CARDS,
  BOARD,
  BUILDING_PRICE,
  HAND_LIMIT,
  LATE_START_BONUS,
  MAX_PROTECTORS,
  MAX_ROUNDS,
  PAYDAY,
  SERVICES,
  SERVICE_FOR,
  START_CASH,
  THIEF_AMOUNT,
  type ActionCard,
  type AttackCardKind,
  type Service,
  type Space,
} from '../board/data';
import {
  applyBoardAction,
  boardActorId,
  boardStandings,
  createBoardGame,
  currentPlayer,
  hireTerms,
  holdings,
  netWorth,
  rentFor,
  validateBoardAction,
  type BoardAction,
  type BoardLogEntry,
  type BoardLogKind,
  type BoardPlayer,
  type BoardSeat,
  type BoardState,
} from '../board/engine';
import { randomSeed, type Card, type Difficulty, type LogKind } from '../engine';
import { CardView } from './Card';
import { playSound } from './sound';
import type { Settings } from './storage';

const SAVE_KEY = 'bankrupt.boomtown.v1';
const AI_DELAY = { fast: 500, normal: 1200, slow: 2100 } as const;
const COLORS = ['#ff6b5e', '#4a9bff', '#3ddc97', '#ffc93c'];
const AI_NAMES = ['Penny', 'Buck', 'Goldie'];
const SERVICE_KEYS = Object.keys(SERVICES) as Service[];

const SOUND_FOR: Partial<Record<BoardLogKind, LogKind>> = {
  buy: 'bank',
  bonus: 'bank',
  hire: 'shop',
  thief: 'thief',
  swap: 'thief',
  bankrupt: 'bankrupt',
  block: 'block',
  attack: 'attack',
  rent: 'discard',
  tax: 'discard',
  final: 'final',
  end: 'end',
};
const BANNERS: BoardLogKind[] = ['final', 'bankrupt', 'swap', 'block', 'thief', 'attack'];

type Saved = { seats: BoardSeat[]; state: BoardState };

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const saved = raw ? (JSON.parse(raw) as Saved) : null;
    return saved && saved.state.phase !== 'finished' ? saved : null;
  } catch {
    return null;
  }
}

function store(saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    // optional
  }
}

/** Where each of the 24 spaces sits on a 7 × 7 grid: clockwise from the bottom-right corner. */
function cellPosition(index: number): { row: number; column: number } {
  if (index <= 6) return { row: 7, column: 7 - index };
  if (index <= 12) return { row: 7 - (index - 6), column: 1 };
  if (index <= 18) return { row: 1, column: 1 + (index - 12) };
  return { row: 1 + (index - 18), column: 7 };
}

const asCard = (card: ActionCard): Card => ({ id: card.id, kind: card.kind as AttackCardKind });

type Props = { settings: Settings; onToggleSound: () => void; onExit: () => void };

export function Boomtown({ settings, onToggleSound, onExit }: Props) {
  const [saved] = useState(loadSaved);
  const [game, setGame] = useState<{ key: number; seats: BoardSeat[]; state: BoardState } | null>(null);
  const [seats, setSeats] = useState<BoardSeat[]>(
    saved?.seats ?? [
      { name: 'Player 1', isAI: false },
      { name: 'Penny', isAI: true, difficulty: 'casual' },
      { name: 'Buck', isAI: true, difficulty: 'casual' },
    ],
  );

  const start = (next: BoardSeat[]) => {
    setSeats(next);
    setGame({ key: Date.now(), seats: next, state: createBoardGame({ players: next, seed: randomSeed() }) });
  };

  if (game) {
    return (
      <Table
        key={game.key}
        initial={game.state}
        seats={game.seats}
        settings={settings}
        onToggleSound={onToggleSound}
        onExit={onExit}
        onPlayAgain={() => start(game.seats)}
      />
    );
  }

  const setCount = (count: number) =>
    setSeats((current) => {
      const next = current.slice(0, count);
      while (next.length < count) {
        const name = AI_NAMES.find((n) => !next.some((s) => s.name === n)) ?? `Player ${next.length + 1}`;
        next.push({ name, isAI: true, difficulty: 'casual' });
      }
      return next;
    });
  const update = (index: number, patch: Partial<BoardSeat>) =>
    setSeats((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const cleaned = seats.map((s, i) => ({ ...s, name: s.name.trim() || `Player ${i + 1}` }));
  const duplicate = new Set(cleaned.map((s) => s.name.toLowerCase())).size !== cleaned.length;

  return (
    <main className="page">
      <header className="page__head">
        <button type="button" className="btn btn--ghost" onClick={onExit}>
          ← Menu
        </button>
        <h1>Boomtown</h1>
      </header>
      <p className="note">
        The BANKRUPT board game. Roll round the town, buy businesses, and keep your cash away from thieves, swaps and
        Bankrupt cards.
      </p>

      {saved && (
        <button
          type="button"
          className="btn btn--primary btn--wide"
          onClick={() => setGame({ key: Date.now(), seats: saved.seats, state: saved.state })}
        >
          Continue Game
        </button>
      )}

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
              <input type="text" value={seat.name} maxLength={14} onChange={(e) => update(i, { name: e.target.value })} />
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
              </select>
            </label>
          </li>
        ))}
      </ul>
      {duplicate && <p className="note note--warn">Give every player a different name.</p>}
      <button type="button" className="btn btn--primary btn--wide" disabled={duplicate} onClick={() => start(cleaned)}>
        Start Game
      </button>

      <BoomtownRules />
    </main>
  );
}

export function BoomtownRules() {
  return (
    <div className="prose">
      <h2>How to play Boomtown</h2>
      <p>
        <strong>The goal:</strong> finish with the most money, counting your cash <em>plus</em> the price of every
        business and building you own. Cash can be stolen, swapped or bankrupted. What you own is safe.
      </p>
      <h2>Your turn</h2>
      <ul>
        <li>You draw a card. A Windfall pays you straight away; attack cards go into your hand (up to {HAND_LIMIT}).</li>
        <li>
          Before rolling you may play <strong>one</strong> attack card on another player, and hire protection from any
          building that somebody owns.
        </li>
        <li>Roll both dice and move. Passing START pays you ${PAYDAY}.</li>
        <li>
          Land on a business nobody owns and you can buy it. Land on someone else's and you pay them rent — double if
          they own the whole colour.
        </li>
      </ul>
      <h2>The attack cards</h2>
      <ul>
        <li>
          <strong>Bankrupt:</strong> wipes out all of a player's cash. Stopped by a Vault Lock. There are only{' '}
          {BANKRUPT_CARDS}.
        </li>
        <li>
          <strong>Bank Thief:</strong> steals up to ${THIEF_AMOUNT}. Stopped by a Deputy.
        </li>
        <li>
          <strong>Bank Swap:</strong> swaps your cash with theirs. Stopped by a Lawyer.
        </li>
      </ul>
      <h2>Deputy or the whole station?</h2>
      <p>
        Three corner buildings sell protection: the Sheriff's Station (Deputies, ${SERVICES.deputy.price}), the Law
        Firm (Lawyers, ${SERVICES.lawyer.price}) and Vault Works (Vault Locks, ${SERVICES.vault.price}). Land on one
        and choose: hire a single protector, or buy the <strong>whole building</strong> for ${BUILDING_PRICE}.
      </p>
      <ul>
        <li>Each protector blocks one attack and is then used up. You can hold {MAX_PROTECTORS} of each.</li>
        <li>
          Once a building has an owner, anyone can hire from it on their turn without landing there — and they pay the{' '}
          <strong>owner</strong>.
        </li>
        <li>The owner hires from their own building at half price.</li>
      </ul>
      <h2>How it ends</h2>
      <p>
        When the sixth Bankrupt card has been played, finish the round you are in and then play one final round, so
        everyone gets the same number of turns. (The bank also closes after {MAX_ROUNDS} rounds.) Cash plus property:
        richest wins. The first player starts with ${START_CASH}; each player after starts with ${LATE_START_BONUS}{' '}
        more.
      </p>
    </div>
  );
}

function Table({
  initial,
  seats,
  settings,
  onToggleSound,
  onExit,
  onPlayAgain,
}: {
  initial: BoardState;
  seats: BoardSeat[];
  settings: Settings;
  onToggleSound: () => void;
  onExit: () => void;
  onPlayAgain: () => void;
}) {
  const [state, setState] = useState(initial);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [lookAt, setLookAt] = useState<number | null>(null);
  const [fx, setFx] = useState<BoardLogEntry | null>(null);
  const seen = useRef(initial.log.length);

  const humans = state.players.filter((p) => !p.isAI);
  const solo = humans.length === 1;
  const [revealedFor, setRevealedFor] = useState<string | null>(solo ? humans[0].id : null);
  const [seatId, setSeatId] = useState(humans[0].id);

  const actorId = boardActorId(state);
  const actor = state.players.find((p) => p.id === actorId);
  const finished = state.phase === 'finished';
  const colorOf = (id: string) => COLORS[state.players.findIndex((p) => p.id === id)];
  const nameOf = (id: string) => state.players.find((p) => p.id === id)!.name;

  const dispatch = (action: BoardAction) =>
    setState((current) => (validateBoardAction(current, action) ? current : applyBoardAction(current, action)));

  useEffect(() => store(finished ? null : { seats, state }), [state, seats, finished]);

  // Computer players act after a short, visible pause.
  useEffect(() => {
    if (!actor?.isAI) return;
    const timer = setTimeout(
      () => dispatch(chooseBoardAction(boardView(state, actor.id), actor.difficulty ?? 'casual', Math.random)),
      AI_DELAY[settings.aiSpeed],
    );
    return () => clearTimeout(timer);
  }, [state, actor, settings.aiSpeed]);

  // Pass-and-play: hide the hand whenever the decision moves to someone else.
  useEffect(() => {
    if (!solo) setRevealedFor((current) => (current === actorId ? current : null));
  }, [actorId, solo]);

  useEffect(() => setSelectedCard(null), [state.currentPlayerIndex, state.phase]);

  useEffect(() => {
    const fresh = state.log.slice(seen.current);
    seen.current = state.log.length;
    if (fresh.length === 0) return;
    const loud = fresh.find((e) => SOUND_FOR[e.kind]);
    if (loud && settings.sound) playSound(SOUND_FOR[loud.kind]!, settings.volume);
    const banner = BANNERS.map((kind) => fresh.find((e) => e.kind === kind)).find(Boolean);
    if (banner) setFx(banner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.log.length]);

  useEffect(() => {
    if (!fx) return;
    const timer = setTimeout(() => setFx(null), 1900);
    return () => clearTimeout(timer);
  }, [fx]);

  const needsHandoff = !solo && !!actor && !actor.isAI && revealedFor !== actorId;
  const seat = state.players.find((p) => p.id === (solo ? humans[0].id : seatId))!;
  const handVisible = solo || revealedFor === seat.id;
  const mine = handVisible && actorId === seat.id;
  const turnPlayer = currentPlayer(state);
  const myTurn = mine && turnPlayer.id === seat.id;
  const preroll = myTurn && state.phase === 'preroll';
  const landed = myTurn && state.phase === 'landed';
  const reacting = mine && state.phase === 'reaction';
  const here = BOARD[seat.position];
  const can = (action: BoardAction) => validateBoardAction(state, action) === null;

  const picked = seat.hand.find((c) => c.id === selectedCard);
  const rivals = state.players.filter((p) => p.id !== seat.id);
  const shown = BOARD[lookAt ?? turnPlayer.position];

  let status: string;
  if (finished) status = 'Game over';
  else if (needsHandoff) status = `Waiting for ${actor!.name}`;
  else if (preroll) status = solo ? 'Your turn — play a card or roll' : `${seat.name}'s turn — play a card or roll`;
  else if (landed) status = `You landed on ${here.name}`;
  else if (reacting) status = 'You are under attack!';
  else if (state.phase === 'reaction') status = `${actor!.name} is deciding whether to block…`;
  else status = `${actor!.name} is taking a turn…`;

  const hireLabel = (service: Service) => {
    const { price, payTo } = hireTerms(state, seat.id, service);
    const who = payTo ? ` → ${nameOf(payTo)}` : state.owners[BOARD.find((s) => s.kind === 'service' && s.service === service)!.index] === seat.id ? ' (yours: half price)' : '';
    return `Hire ${SERVICES[service].name} $${price}${who}`;
  };

  return (
    <div className="game boom">
      <header className="topbar">
        <button type="button" className="btn btn--ghost" onClick={onExit}>
          ← Menu
        </button>
        <div className="counter" role="img" aria-label={`Bankrupt cards played: ${state.bankruptsPlayed} of ${BANKRUPT_CARDS}`}>
          <span className="counter__label">Bankrupt cards played</span>
          <span className="counter__pips" aria-hidden="true">
            {Array.from({ length: BANKRUPT_CARDS }, (_, i) => (
              <span key={i} className={`pip${i < state.bankruptsPlayed ? ' pip--on' : ''}`} />
            ))}
          </span>
          <span className="counter__value" aria-hidden="true">
            {state.bankruptsPlayed} / {BANKRUPT_CARDS}
          </span>
        </div>
        <p className="boom__round">
          Round <b>{Math.min(state.round, MAX_ROUNDS)}</b>
          <small> of up to {MAX_ROUNDS}</small>
        </p>
        <button type="button" className="btn btn--ghost" onClick={onToggleSound} aria-pressed={settings.sound} aria-label="Sound">
          {settings.sound ? '🔊' : '🔇'}
        </button>
      </header>

      {state.finalRound && !finished && (
        <p className="finalbar" role="status">
          FINAL ROUND · {state.finalRound.turnsRemaining} {state.finalRound.turnsRemaining === 1 ? 'turn' : 'turns'} left
        </p>
      )}

      <section className="town" aria-label="The board">
        {BOARD.map((space) => {
          const { row, column } = cellPosition(space.index);
          const owner = state.owners[space.index];
          const tokens = state.players.filter((p) => p.position === space.index);
          const price = 'price' in space ? `$${space.price}` : space.kind === 'tax' ? `−$${space.amount}` : space.kind === 'bonus' ? `+$${space.amount}` : '';
          return (
            <button
              key={space.index}
              type="button"
              className={`space space--${space.kind}${space.kind === 'business' ? ` space--${space.district}` : ''}${shown.index === space.index ? ' is-shown' : ''}`}
              style={{ gridRow: row, gridColumn: column, '--owner': owner ? colorOf(owner) : 'transparent' } as CSSProperties}
              aria-label={`${space.name}${price ? `, ${price}` : ''}${owner ? `, owned by ${nameOf(owner)}` : ''}${tokens.length ? `, here: ${tokens.map((t) => t.name).join(', ')}` : ''}`}
              onClick={() => setLookAt(space.index)}
            >
              <span className="space__icon" aria-hidden="true">
                {space.icon}
              </span>
              <span className="space__name">{space.name}</span>
              {price && <span className="space__price">{price}</span>}
              {owner && <span className="space__owner" aria-hidden="true" />}
              {tokens.length > 0 && (
                <span className="space__tokens" aria-hidden="true">
                  {tokens.map((t) => (
                    <span key={t.id} className={`token${t.id === turnPlayer.id && !finished ? ' token--turn' : ''}`} style={{ background: colorOf(t.id) }}>
                      {t.name[0]}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}

        <div className="town__center">
          <p className={`status${mine ? ' status--you' : ''}`} role="status">
            {status}
          </p>
          {state.lastRoll && (
            <p className="dice" aria-label={`Last roll: ${state.lastRoll[0]} and ${state.lastRoll[1]}`}>
              <span>{state.lastRoll[0]}</span>
              <span>{state.lastRoll[1]}</span>
            </p>
          )}
          <SpaceInfo space={shown} state={state} nameOf={nameOf} />
          <ol className="log" aria-label="Recent events" aria-live="polite">
            {state.log.slice(-3).map((entry) => (
              <li key={entry.id} className="log__item">
                {entry.text}
              </li>
            ))}
          </ol>
          {fx && (
            <div key={fx.id} className={`banner banner--${fx.kind === 'swap' ? 'thief' : fx.kind}`}>
              {fx.text}
            </div>
          )}
        </div>
      </section>

      <section className={`me${mine ? ' is-active' : ''}`} aria-label={`${seat.name}'s cards and choices`}>
        <div className="me__head">
          <h2 className="me__name">{seat.name}'s cards</h2>
          <span className="tag">
            {seat.hand.length} of {HAND_LIMIT}
          </span>
        </div>
        <div className="boom__hand" role="group" aria-label={handVisible ? 'Your hand' : 'Hand, hidden'}>
          {seat.hand.length === 0 && <p className="hand__empty">No cards in hand</p>}
          {seat.hand.map((card) =>
            handVisible ? (
              <CardView
                key={card.id}
                card={asCard(card)}
                selected={selectedCard === card.id}
                onClick={preroll && !state.attacked ? () => setSelectedCard(selectedCard === card.id ? null : card.id) : undefined}
              />
            ) : (
              <CardView key={card.id} />
            ),
          )}
        </div>

        <div className="controls">
          {preroll &&
            picked &&
            rivals.map((r) => (
              <button
                key={r.id}
                type="button"
                className="btn btn--danger"
                onClick={() => dispatch({ type: 'play', playerId: seat.id, cardId: picked.id, targetId: r.id })}
              >
                {ATTACK_NAMES[picked.kind as AttackCardKind]} → {r.name} (${r.cash} cash)
              </button>
            ))}
          {(preroll || landed) &&
            SERVICE_KEYS.filter((service) => can({ type: 'hire', playerId: seat.id, service })).map((service) => (
              <button key={service} type="button" className="btn btn--shop" onClick={() => dispatch({ type: 'hire', playerId: seat.id, service })}>
                {SERVICES[service].icon} {hireLabel(service)}
              </button>
            ))}
          {preroll && (
            <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'roll', playerId: seat.id })}>
              🎲 Roll
            </button>
          )}
          {landed && can({ type: 'buy', playerId: seat.id }) && 'price' in here && (
            <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'buy', playerId: seat.id })}>
              Buy {here.name} ${here.price}
            </button>
          )}
          {landed && (
            <button type="button" className="btn" onClick={() => dispatch({ type: 'done', playerId: seat.id })}>
              End Turn
            </button>
          )}
          {preroll && (
            <p className="hint">
              {state.attacked
                ? 'You have played your attack card for this turn. Roll when you are ready.'
                : seat.hand.length > 0
                  ? 'Tap a card to play it on someone, or roll the dice.'
                  : 'Roll the dice.'}
            </p>
          )}
          {landed && here.kind === 'service' && (
            <p className="hint">
              Buy the whole {here.name} and everyone hires from you — or just hire one {SERVICES[here.service].name}.
            </p>
          )}
        </div>
      </section>

      <section className="boom__players" aria-label="Players">
        {state.players.map((p) => (
          <PlayerCard
            key={p.id}
            player={p}
            state={state}
            color={colorOf(p.id)}
            active={actorId === p.id && !finished}
            you={p.id === seat.id}
            hit={!!fx && (fx.kind === 'bankrupt' || fx.kind === 'thief' || fx.kind === 'swap') && fx.targetId === p.id}
          />
        ))}
      </section>

      {reacting && state.pending && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="react-title">
          <div className={`dialog dialog--${state.pending.kind}`}>
            <h2 id="react-title">
              {nameOf(state.pending.attackerId)} played {ATTACK_NAMES[state.pending.kind]} on you!
            </h2>
            <p>
              {state.pending.kind === 'bankrupt'
                ? `All $${seat.cash} of your cash will be wiped out.`
                : state.pending.kind === 'bank_thief'
                  ? `They will steal $${Math.min(THIEF_AMOUNT, seat.cash)} of your cash.`
                  : `They will swap their $${state.players.find((p) => p.id === state.pending!.attackerId)!.cash} for your $${seat.cash}.`}{' '}
              You have {seat.protectors[SERVICE_FOR[state.pending.kind]]}{' '}
              {seat.protectors[SERVICE_FOR[state.pending.kind]] === 1
                ? SERVICES[SERVICE_FOR[state.pending.kind]].name
                : SERVICES[SERVICE_FOR[state.pending.kind]].plural}
              .
            </p>
            <div className="dialog__actions">
              <button type="button" className="btn btn--primary" autoFocus onClick={() => dispatch({ type: 'respond', playerId: seat.id, block: true })}>
                Use {SERVICES[SERVICE_FOR[state.pending.kind]].name}
              </button>
              <button type="button" className="btn" onClick={() => dispatch({ type: 'respond', playerId: seat.id, block: false })}>
                Don't block
              </button>
            </div>
          </div>
        </div>
      )}

      {needsHandoff && (
        <div className="overlay overlay--solid" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
          <div className="dialog">
            <h2 id="handoff-title">Pass to {actor!.name}</h2>
            <p>{state.phase === 'reaction' ? `${actor!.name}, you are under attack!` : `It is ${actor!.name}'s turn.`} Everyone else, look away.</p>
            <button
              type="button"
              className="btn btn--primary"
              autoFocus
              onClick={() => {
                setSeatId(actor!.id);
                setRevealedFor(actor!.id);
              }}
            >
              I'm {actor!.name} — show my cards
            </button>
          </div>
        </div>
      )}

      {finished && <EndOfGame state={state} colorOf={colorOf} onPlayAgain={onPlayAgain} onExit={onExit} />}
    </div>
  );
}

function SpaceInfo({ space, state, nameOf }: { space: Space; state: BoardState; nameOf: (id: string) => string }) {
  const owner = state.owners[space.index];
  let detail = '';
  if (space.kind === 'business') {
    detail = owner ? `Owned by ${nameOf(owner)} · rent $${rentFor(state, space)}` : `For sale $${space.price} · rent $${space.rent}`;
  } else if (space.kind === 'service') {
    const info = SERVICES[space.service];
    detail = owner
      ? `Owned by ${nameOf(owner)} · ${info.plural} $${info.price} each`
      : `For sale $${space.price} · or hire a ${info.name} for $${info.price}`;
  } else if (space.kind === 'card') detail = 'Draw an extra card';
  else if (space.kind === 'tax') detail = `Pay $${space.amount}`;
  else if (space.kind === 'bonus') detail = `Collect $${space.amount}`;
  else if (space.kind === 'start') detail = `Collect $${PAYDAY} each time you pass`;
  else detail = 'A quiet rest';
  return (
    <p className="spaceinfo">
      <span aria-hidden="true">{space.icon}</span> <strong>{space.name}</strong>
      <small>{detail}</small>
    </p>
  );
}

function PlayerCard({
  player,
  state,
  color,
  active,
  you,
  hit,
}: {
  player: BoardPlayer;
  state: BoardState;
  color: string;
  active: boolean;
  you: boolean;
  hit: boolean;
}) {
  const owned = holdings(state, player.id);
  return (
    <article className={`panel boom__player${active ? ' is-active' : ''}${hit ? ' is-hit' : ''}`} style={{ '--owner': color } as CSSProperties}>
      <div className="panel__head">
        <h2 className="panel__name">
          <span className="token" style={{ background: color }} aria-hidden="true">
            {player.name[0]}
          </span>
          {player.name}
          {you && <span className="tag">you</span>}
          {player.isAI && <span className="tag">{player.difficulty} AI</span>}
        </h2>
        <span className="total" aria-label={`Cash $${player.cash}`}>
          ${player.cash}
        </span>
      </div>
      <p className="boom__worth">
        Worth <b>${netWorth(state, player.id)}</b> with property · {player.hand.length} {player.hand.length === 1 ? 'card' : 'cards'}
      </p>
      <p className="boom__guards" aria-label="Protection">
        {SERVICE_KEYS.map((service) => (
          <span key={service} className={player.protectors[service] ? 'has' : ''} title={SERVICES[service].plural}>
            <span aria-hidden="true">{SERVICES[service].icon}</span> {SERVICES[service].name} × {player.protectors[service]}
          </span>
        ))}
      </p>
      {owned.length > 0 && (
        <p className="boom__owned" aria-label="Owns">
          {owned.map((space) => (
            <span key={space.index} className={`chip chip--${space.kind === 'business' ? space.district : 'service'}`}>
              <span aria-hidden="true">{space.icon}</span> {space.name}
            </span>
          ))}
        </p>
      )}
    </article>
  );
}

function EndOfGame({
  state,
  colorOf,
  onPlayAgain,
  onExit,
}: {
  state: BoardState;
  colorOf: (id: string) => string;
  onPlayAgain: () => void;
  onExit: () => void;
}) {
  const { standings, winnerIds } = boardStandings(state);
  const winners = standings.filter((row) => winnerIds.includes(row.playerId)).map((row) => row.name);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div className="dialog dialog--end">
        <p className="dialog__eyebrow">{winners.length > 1 ? 'Shared victory' : 'Winner'}</p>
        <h2 id="end-title">
          {winners.join(' & ')} — ${standings[0].total}
        </h2>
        <div className="tablewrap">
          <table className="results">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Cash</th>
                <th scope="col">Property</th>
                <th scope="col">Total</th>
                <th scope="col">Earned from hires / rent</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => {
                const p = state.players.find((x) => x.id === row.playerId)!;
                return (
                  <tr key={row.playerId} className={row.rank === 1 ? 'is-winner' : undefined}>
                    <td>{row.rank}</td>
                    <th scope="row">
                      <span className="token" style={{ background: colorOf(row.playerId) }} aria-hidden="true">
                        {row.name[0]}
                      </span>{' '}
                      {row.name}
                    </th>
                    <td>${row.cash}</td>
                    <td>${row.property}</td>
                    <td>
                      <b>${row.total}</b>
                    </td>
                    <td>
                      ${p.serviceIncome} / ${p.rentIncome}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn btn--primary" autoFocus onClick={onPlayAgain}>
            Play Again
          </button>
          <button type="button" className="btn" onClick={onExit}>
            Return to Menu
          </button>
        </div>
      </div>
    </div>
  );
}
