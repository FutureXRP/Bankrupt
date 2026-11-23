// The game table (spec §15.3) and endgame screen (§15.4).

import { useEffect, useRef, useState } from 'react';
import { chooseForPhase } from '../ai';
import {
  BANKRUPT_TOTAL,
  CARD_NAMES,
  DEFENSE_FOR,
  actorId,
  applyAction,
  cardName,
  getPlayerView,
  hasLegalPrimaryAction,
  isAttackKind,
  scoreGame,
  sumMoney,
  validateAction,
  type Action,
  type Card,
  type GameState,
  type LogEntry,
  type LogKind,
  type MoneyValue,
  type Player,
} from '../engine';
import { CardView } from './Card';
import { playSound } from './sound';
import type { Settings } from './storage';

const AI_DELAY = { fast: 450, normal: 1100, slow: 2000 } as const;
const GROUP_ORDER: MoneyValue[] = [100, 50, 25, 5];
const BANNER_KINDS: LogKind[] = ['final', 'bankrupt', 'block', 'thief', 'attack'];
const SOUND_ORDER: LogKind[] = ['end', 'final', 'bankrupt', 'block', 'thief', 'attack', 'bank', 'discard'];

type Props = {
  initialState: GameState;
  settings: Settings;
  onToggleSound: () => void;
  onExit: () => void;
  onPlayAgain: () => void;
  onStateChange: (state: GameState) => void;
};

function BankView({ bank, onPick, ownerName }: { bank: Card[]; onPick?: (cardId: string) => void; ownerName: string }) {
  const groups = GROUP_ORDER.map((value) => bank.filter((c) => c.value === value)).filter((g) => g.length > 0);
  if (groups.length === 0) return <p className="bank bank--empty">Bank is empty</p>;
  return (
    <ul className="bank" aria-label={`${ownerName}'s bank`}>
      {groups.map((cards) => (
        <li key={cards[0].value} className="bank__group">
          <CardView
            card={cards[0]}
            size="sm"
            onClick={onPick ? () => onPick(cards[0].id) : undefined}
            label={
              onPick
                ? `Steal a $${cards[0].value} card from ${ownerName}`
                : `${cards.length} × $${cards[0].value}`
            }
          />
          <span className="bank__count" aria-hidden="true">
            ×{cards.length}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Game({ initialState, settings, onToggleSound, onExit, onPlayAgain, onStateChange }: Props) {
  const [state, setState] = useState(initialState);
  const [selected, setSelected] = useState<string[]>([]);
  const [fx, setFx] = useState<LogEntry | null>(null);
  const seenLog = useRef(initialState.actionLog.length);

  const humans = state.players.filter((p) => !p.isAI);
  const solo = humans.length === 1;
  const [revealedFor, setRevealedFor] = useState<string | null>(solo ? humans[0].id : null);
  const [seatId, setSeatId] = useState(humans[0].id);

  const actor = actorId(state);
  const actorPlayer = state.players.find((p) => p.id === actor);
  const finished = state.phase === 'finished';

  const dispatch = (action: Action) => {
    setState((current) => (validateAction(current, action) ? current : applyAction(current, action)));
  };

  // Let the app save progress.
  useEffect(() => onStateChange(state), [state, onStateChange]);

  // Computer players act after a short, visible pause.
  useEffect(() => {
    if (!actorPlayer?.isAI) return;
    const timer = setTimeout(() => {
      const view = getPlayerView(state, actorPlayer.id);
      dispatch(chooseForPhase(view, actorPlayer.difficulty ?? 'casual', Math.random));
    }, AI_DELAY[settings.aiSpeed]);
    return () => clearTimeout(timer);
  }, [state, actorPlayer, settings.aiSpeed]);

  // Pass-and-play: hide the hand whenever the decision moves to someone else.
  useEffect(() => {
    if (!solo) setRevealedFor((current) => (current === actor ? current : null));
  }, [actor, solo]);

  useEffect(() => setSelected([]), [state.turnNumber, state.phase]);

  // Announce new events: banner, highlight and sound.
  useEffect(() => {
    const fresh = state.actionLog.slice(seenLog.current);
    seenLog.current = state.actionLog.length;
    if (fresh.length === 0) return;
    const loudest = SOUND_ORDER.map((kind) => fresh.find((e) => e.kind === kind)).find(Boolean);
    if (loudest && settings.sound) playSound(loudest.kind, settings.volume);
    const banner = BANNER_KINDS.map((kind) => fresh.find((e) => e.kind === kind)).find(Boolean);
    if (banner) setFx(banner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.actionLog.length]);

  useEffect(() => {
    if (!fx) return;
    const timer = setTimeout(() => setFx(null), 1700);
    return () => clearTimeout(timer);
  }, [fx]);

  const needsHandoff = !solo && !!actorPlayer && !actorPlayer.isAI && revealedFor !== actor;
  const seat = state.players.find((p) => p.id === (solo ? humans[0].id : seatId))!;
  const handVisible = solo || revealedFor === seat.id;
  const seatIndex = state.players.indexOf(seat);
  const rivals = state.players.map((_, i) => state.players[(seatIndex + 1 + i) % state.players.length]).slice(0, -1);
  const iAmActor = handVisible && actor === seat.id;
  const myTurn = iAmActor && state.phase === 'action';
  const pending = state.pendingAttack;
  const stealing = iAmActor && state.phase === 'theft_selection';
  const defending = iAmActor && state.phase === 'reaction';

  // What the current selection can do.
  const picked = seat.hand.filter((c) => selected.includes(c.id));
  const bankAction: Action = { type: 'bank', playerId: seat.id, cardIds: selected };
  const canBank = myTurn && picked.length > 0 && validateAction(state, bankAction) === null;
  const single = picked.length === 1 ? picked[0] : undefined;
  const attackCard = myTurn && single && isAttackKind(single.kind) ? single : undefined;
  const targets = attackCard ? rivals.filter((p) => p.bank.length > 0) : [];
  const canDiscard =
    myTurn && !!single && validateAction(state, { type: 'discard', playerId: seat.id, cardId: single.id }) === null;
  const stuck = myTurn && !hasLegalPrimaryAction(seat.hand, rivals, state.rules);

  const toggle = (card: Card) => {
    if (!myTurn) return;
    setSelected((current) => {
      if (current.includes(card.id)) return current.filter((id) => id !== card.id);
      if (card.kind !== 'money') return [card.id];
      const sameValue = seat.hand.filter((c) => c.kind === 'money' && c.value === card.value).map((c) => c.id);
      const alreadyPicking = current.some((id) => sameValue.includes(id));
      // First tap on a denomination picks the whole matching set; tap a card again to leave it out.
      return alreadyPicking ? [...current, card.id] : sameValue;
    });
  };

  let hint = '';
  if (myTurn) {
    if (seat.hand.length === 0) hint = 'You have no cards left. Pass your turn.';
    else if (stuck) hint = single ? '' : 'No move available — choose one card to discard.';
    else if (picked.length === 0) hint = 'Pick matching money to bank, or pick an attack card to play.';
    else if (canBank || attackCard) hint = '';
    else if (single?.kind === 'money') hint = `You need ${state.rules.minBankSetSize} or more matching cards to bank.`;
    else if (single) hint = 'Defense cards are saved for when you are attacked.';
    else hint = 'Banked money must all be the same value.';
  }

  let status: string;
  if (finished) status = 'Game over';
  else if (needsHandoff) status = `Waiting for ${actorPlayer!.name}`;
  else if (myTurn) status = solo ? 'Your turn' : `${seat.name}'s turn`;
  else if (stealing) status = `Choose a card to steal from ${nameOf(state, pending!.targetId)}'s bank`;
  else if (defending) status = 'You are under attack!';
  else if (state.phase === 'reaction') status = `${actorPlayer!.name} is deciding whether to block…`;
  else if (state.phase === 'theft_selection') status = `${actorPlayer!.name} is choosing what to steal…`;
  else status = `${actorPlayer!.name} is thinking…`;

  const top = state.discardPile[state.discardPile.length - 1];

  return (
    <div className="game">
      <header className="topbar">
        <button type="button" className="btn btn--ghost" onClick={onExit}>
          ← Menu
        </button>
        <div
          className="counter"
          role="img"
          aria-label={`Bankrupt cards revealed: ${state.bankruptDrawnCount} of ${BANKRUPT_TOTAL}`}
        >
          <span className="counter__label">Bankrupt cards revealed</span>
          <span className="counter__pips" aria-hidden="true">
            {Array.from({ length: BANKRUPT_TOTAL }, (_, i) => (
              <span key={i} className={`pip${i < state.bankruptDrawnCount ? ' pip--on' : ''}`} />
            ))}
          </span>
          <span className="counter__value" aria-hidden="true">
            {state.bankruptDrawnCount} / {BANKRUPT_TOTAL}
          </span>
        </div>
        <div className="piles">
          <div className="pile" aria-label={`Draw deck: ${state.drawPile.length} cards`}>
            {state.drawPile.length > 0 ? <CardView size="sm" /> : <span className="pile__empty" aria-hidden="true" />}
            <span className="pile__text" aria-hidden="true">
              Deck <b>{state.drawPile.length}</b>
            </span>
          </div>
          <div className="pile" aria-label={`Discard pile: ${state.discardPile.length} cards`}>
            {top ? <CardView card={top} size="sm" /> : <span className="pile__empty" aria-hidden="true" />}
            <span className="pile__text" aria-hidden="true">
              Discard <b>{state.discardPile.length}</b>
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onToggleSound}
          aria-pressed={settings.sound}
          aria-label="Sound"
        >
          {settings.sound ? '🔊' : '🔇'}
        </button>
      </header>

      {state.finalRound && !finished && (
        <p className="finalbar" role="status">
          FINAL ROUND · {state.finalRound.turnsRemaining} {state.finalRound.turnsRemaining === 1 ? 'turn' : 'turns'} left
        </p>
      )}

      <section className="rivals" aria-label="Other players">
        {rivals.map((p) => (
          <PlayerPanel
            key={p.id}
            player={p}
            active={actor === p.id && !finished}
            fx={fx}
            onPick={stealing && pending!.targetId === p.id ? (cardId) => dispatch({ type: 'steal', playerId: seat.id, cardId }) : undefined}
          />
        ))}
      </section>

      <section className="center">
        <p className={`status${iAmActor ? ' status--you' : ''}`} role="status">
          {status}
        </p>
        {fx && (
          <div key={fx.id} className={`banner banner--${fx.kind}`}>
            {fx.text}
          </div>
        )}
        <ol className="log" aria-label="Recent actions" aria-live="polite">
          {state.actionLog.slice(-4).map((entry) => (
            <li key={entry.id} className={`log__item log__item--${entry.kind}`}>
              {entry.text}
            </li>
          ))}
        </ol>
      </section>

      <section className={`me${actor === seat.id && !finished ? ' is-active' : ''}${hitClass(fx, seat.id)}`} aria-label={`${seat.name}'s area`}>
        <div className="me__head">
          <h2 className="me__name">{seat.name}</h2>
          <span className="total" aria-label={`Bank total $${sumMoney(seat.bank)}`}>
            ${sumMoney(seat.bank)}
          </span>
          <BankView bank={seat.bank} ownerName={seat.name} />
        </div>

        <div className="hand" role="group" aria-label={handVisible ? 'Your hand' : `${seat.name}'s hand, hidden`}>
          {seat.hand.map((card) =>
            handVisible ? (
              <CardView
                key={card.id}
                card={card}
                selected={selected.includes(card.id)}
                onClick={myTurn ? () => toggle(card) : undefined}
              />
            ) : (
              <CardView key={card.id} />
            ),
          )}
          {seat.hand.length === 0 && <p className="hand__empty">No cards in hand</p>}
        </div>

        <div className="controls">
          {canBank && (
            <button type="button" className="btn btn--primary" onClick={() => dispatch(bankAction)}>
              Bank ${sumMoney(picked)}
            </button>
          )}
          {attackCard &&
            targets.map((t) => (
              <button
                key={t.id}
                type="button"
                className="btn btn--danger"
                onClick={() => dispatch({ type: 'attack', playerId: seat.id, cardId: attackCard.id, targetId: t.id })}
              >
                {attackCard.kind === 'bankrupt' ? 'Bankrupt' : 'Rob'} {t.name} (${sumMoney(t.bank)})
              </button>
            ))}
          {attackCard && targets.length === 0 && !canDiscard && (
            <p className="hint">Nobody has money in the bank to attack yet.</p>
          )}
          {canDiscard && single && (
            <button type="button" className="btn" onClick={() => dispatch({ type: 'discard', playerId: seat.id, cardId: single.id })}>
              Discard {cardName(single)}
            </button>
          )}
          {myTurn && seat.hand.length === 0 && (
            <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'pass', playerId: seat.id })}>
              Pass
            </button>
          )}
          {hint && <p className="hint">{hint}</p>}
        </div>
      </section>

      {defending && pending && (
        <DefensePrompt
          state={state}
          defender={seat}
          onAnswer={(cardId) => dispatch({ type: 'defend', playerId: seat.id, cardId })}
        />
      )}

      {needsHandoff && (
        <div className="overlay overlay--solid" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
          <div className="dialog">
            <h2 id="handoff-title">Pass to {actorPlayer!.name}</h2>
            <p>
              {state.phase === 'reaction'
                ? `${actorPlayer!.name}, you are under attack!`
                : state.phase === 'theft_selection'
                  ? `${actorPlayer!.name}, choose what to steal.`
                  : `It is ${actorPlayer!.name}'s turn.`}{' '}
              Everyone else, look away.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              autoFocus
              onClick={() => {
                setSeatId(actorPlayer!.id);
                setRevealedFor(actorPlayer!.id);
              }}
            >
              I'm {actorPlayer!.name} — show my cards
            </button>
          </div>
        </div>
      )}

      {finished && <EndScreen state={state} onPlayAgain={onPlayAgain} onExit={onExit} />}
    </div>
  );
}

const nameOf = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.name;

function hitClass(fx: LogEntry | null, playerId: string): string {
  if (!fx) return '';
  if ((fx.kind === 'bankrupt' || fx.kind === 'thief') && fx.targetId === playerId) return ' is-hit';
  if (fx.kind === 'block' && fx.actorId === playerId) return ' is-blocked';
  return '';
}

function PlayerPanel({
  player,
  active,
  fx,
  onPick,
}: {
  player: Player;
  active: boolean;
  fx: LogEntry | null;
  onPick?: (cardId: string) => void;
}) {
  const total = sumMoney(player.bank);
  return (
    <article className={`panel${active ? ' is-active' : ''}${onPick ? ' is-target' : ''}${hitClass(fx, player.id)}`}>
      <div className="panel__head">
        <h2 className="panel__name">
          {player.name}
          {player.isAI && <span className="tag">{player.difficulty} AI</span>}
        </h2>
        <span className="total" aria-label={`Bank total $${total}`}>
          ${total}
        </span>
      </div>
      <div className="panel__hand" role="img" aria-label={`${player.hand.length} cards in hand`}>
        {player.hand.map((c) => (
          <CardView key={c.id} size="xs" />
        ))}
        <span className="panel__handcount" aria-hidden="true">
          {player.hand.length} in hand
        </span>
      </div>
      <BankView bank={player.bank} ownerName={player.name} onPick={onPick} />
    </article>
  );
}

function DefensePrompt({
  state,
  defender,
  onAnswer,
}: {
  state: GameState;
  defender: Player;
  onAnswer: (cardId: string | null) => void;
}) {
  const pending = state.pendingAttack!;
  const defense = defender.hand.find((c) => c.kind === DEFENSE_FOR[pending.kind])!;
  const attacker = nameOf(state, pending.attackerId);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="defense-title">
      <div className={`dialog dialog--${pending.kind}`}>
        <h2 id="defense-title">
          {attacker} played {CARD_NAMES[pending.kind]} on you!
        </h2>
        <p>
          {pending.kind === 'bankrupt'
            ? `Your whole bank ($${sumMoney(defender.bank)}) will be wiped out unless you block it.`
            : 'They will steal a card from your bank unless you block it.'}
        </p>
        <div className="dialog__card">
          <CardView card={defense} />
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn btn--primary" autoFocus onClick={() => onAnswer(defense.id)}>
            Play {cardName(defense)}
          </button>
          {state.rules.allowDeclineDefense && (
            <button type="button" className="btn" onClick={() => onAnswer(null)}>
              Don't block
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EndScreen({ state, onPlayAgain, onExit }: { state: GameState; onPlayAgain: () => void; onExit: () => void }) {
  const { standings, winnerIds } = scoreGame(state);
  const winners = winnerIds.map((id) => nameOf(state, id));
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
                <th scope="col">Banked</th>
                <th scope="col">Bankrupt used / blocked</th>
                <th scope="col">Thief used / blocked</th>
                <th scope="col">Best bank turn</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => {
                const stats = state.players.find((p) => p.id === row.playerId)!.stats;
                return (
                  <tr key={row.playerId} className={row.rank === 1 ? 'is-winner' : undefined}>
                    <td>{row.rank}</td>
                    <th scope="row">{row.name}</th>
                    <td>
                      ${row.total} <small>({row.cards} cards)</small>
                    </td>
                    <td>
                      {stats.bankruptPlayed} / {stats.bankruptBlocked}
                    </td>
                    <td>
                      {stats.thiefPlayed} / {stats.thiefBlocked}
                    </td>
                    <td>${stats.largestBank}</td>
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
