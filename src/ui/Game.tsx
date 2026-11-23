// The game table (spec §15.3) and endgame screen (§15.4).

import { useEffect, useRef, useState } from 'react';
import { chooseForPhase } from '../ai';
import {
  BANKRUPT_TOTAL,
  SHOP_ITEMS,
  bankTotal,
  canTarget,
  shopProblem,
  CARD_NAMES,
  DEFENSE_FOR,
  actorId,
  applyAction,
  cardName,
  getPlayerView,
  hasLegalPrimaryAction,
  isAttackKind,
  isMultiRound,
  matchWinnerIds,
  recordRound,
  publicBankruptCount,
  pileSavedFromBankrupt,
  scoreGame,
  sumMoney,
  validateAction,
  type Action,
  type AttackKind,
  type Card,
  type GameState,
  type LogEntry,
  type LogKind,
  type MatchState,
  type MoneyValue,
  type Player,
} from '../engine';
import { CardView } from './Card';
import { playSound } from './sound';
import type { Settings } from './storage';

const AI_DELAY = { fast: 450, normal: 1100, slow: 2000 } as const;
const GROUP_ORDER: MoneyValue[] = [100, 50, 25, 5];
const BANNER_KINDS: LogKind[] = ['final', 'bankrupt', 'block', 'thief', 'attack'];
const SOUND_ORDER: LogKind[] = ['end', 'final', 'bankrupt', 'block', 'thief', 'attack', 'shop', 'bank', 'discard'];

type Props = {
  initialState: GameState;
  settings: Settings;
  onToggleSound: () => void;
  onExit: () => void;
  /** Deal again (next round or a new game). Omitted for an online guest: only the host deals. */
  onPlayAgain?: (finished: GameState) => void;
  /** The match this game is a round of, as it stood before this round. */
  match?: MatchState;
  onStateChange?: (state: GameState) => void;
  /**
   * Invite-code play: the game state lives with the host and arrives from
   * outside. This device shows one seat, and moves are handed to `onAction`.
   */
  online?: { state: GameState; seatId: string; runAI: boolean; onAction: (action: Action) => void };
};

function BankView({
  bank,
  bonus,
  onPick,
  ownerName,
}: {
  bank: Card[];
  bonus: number;
  onPick?: (cardId: string) => void;
  ownerName: string;
}) {
  const groups = GROUP_ORDER.map((value) => bank.filter((c) => c.value === value)).filter((g) => g.length > 0);
  if (groups.length === 0 && bonus === 0) return <p className="bank bank--empty">Bank is empty</p>;
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
      {bonus > 0 && (
        <li className="bank__cash" aria-label={`$${bonus} in cash`}>
          +${bonus} cash
        </li>
      )}
    </ul>
  );
}

export function Game({
  initialState,
  settings,
  onToggleSound,
  onExit,
  onPlayAgain,
  onStateChange,
  online,
  match,
}: Props) {
  const [localState, setState] = useState(initialState);
  const state = online ? online.state : localState;
  const [selected, setSelected] = useState<string[]>([]);
  const [fx, setFx] = useState<LogEntry | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  // Id of the next log entry not yet announced. (Online guests only receive the tail of the log.)
  const seenLog = useRef((initialState.actionLog[initialState.actionLog.length - 1]?.id ?? -1) + 1);

  // Players using THIS device. Online, that is exactly one seat.
  const humans = online ? state.players.filter((p) => p.id === online.seatId) : state.players.filter((p) => !p.isAI);
  const solo = humans.length === 1;
  const [revealedFor, setRevealedFor] = useState<string | null>(solo ? humans[0].id : null);
  const [seatId, setSeatId] = useState(humans[0].id);

  const actor = actorId(state);
  const actorPlayer = state.players.find((p) => p.id === actor);
  const finished = state.phase === 'finished';

  const dispatch = (action: Action) => {
    if (online) {
      if (!validateAction(state, action)) online.onAction(action);
      return;
    }
    setState((current) => (validateAction(current, action) ? current : applyAction(current, action)));
  };

  // Let the app save progress.
  useEffect(() => onStateChange?.(state), [state, onStateChange]);

  // Computer players act after a short, visible pause (on the host's device when online).
  useEffect(() => {
    if (!actorPlayer?.isAI || (online && !online.runAI)) return;
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

  useEffect(() => {
    setSelected([]);
    setShopOpen(false);
  }, [state.turnNumber, state.phase]);

  const lastLogId = state.actionLog[state.actionLog.length - 1]?.id ?? -1;

  // Announce new events: banner, highlight and sound.
  useEffect(() => {
    const fresh = state.actionLog.filter((entry) => entry.id >= seenLog.current);
    seenLog.current = lastLogId + 1;
    if (fresh.length === 0) return;
    const loudest = SOUND_ORDER.map((kind) => fresh.find((e) => e.kind === kind)).find(Boolean);
    if (loudest && settings.sound) playSound(loudest.kind, settings.volume);
    const banner = BANNER_KINDS.map((kind) => fresh.find((e) => e.kind === kind)).find(Boolean);
    if (banner) setFx(banner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastLogId]);

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
  const defending = iAmActor && (state.phase === 'reaction' || state.phase === 'bankrupt_draw');
  const trap = state.rules.bankruptMode === 'trap';
  const bankruptCount = publicBankruptCount(state);
  const counterLabel = trap ? 'Bankrupt cards drawn' : 'Bankrupt cards played';

  // What the current selection can do.
  const picked = seat.hand.filter((c) => selected.includes(c.id));
  const bankAction: Action = { type: 'bank', playerId: seat.id, cardIds: selected };
  const canBank = myTurn && picked.length > 0 && validateAction(state, bankAction) === null;
  const single = picked.length === 1 ? picked[0] : undefined;
  const attackCard = myTurn && single && isAttackKind(single.kind) ? single : undefined;
  const targets = attackCard ? rivals.filter((p) => canTarget(attackCard.kind as AttackKind, p, state.buffs.heist)) : [];
  const canDiscard =
    myTurn && !!single && validateAction(state, { type: 'discard', playerId: seat.id, cardIds: [single.id] }) === null;
  const stuck = myTurn && !hasLegalPrimaryAction(seat.hand, rivals, state.rules, state.buffs.heist);

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
    if (state.bankedThisTurn > 0) hint = picked.length === 0 ? 'Bank more, play an attack, or end your turn.' : '';
    else if (seat.hand.length === 0) hint = 'You have no cards left. Pass your turn.';
    else if (stuck) hint = single ? '' : 'No move available — choose one card to discard.';
    else if (picked.length === 0) hint = state.rules.discardOnlyWhenStuck
      ? 'Pick matching money to bank, or pick an attack card to play.'
      : 'Pick matching money to bank, an attack card to play, or one card to discard.';
    else if (canBank || attackCard) hint = '';
    else if (single?.kind === 'money') {
      hint = `You need ${state.rules.minBankSetSize} or more matching cards to bank${canDiscard ? ' — or you can discard this one' : ''}.`;
    } else if (single) {
      hint = `Defense cards are saved for when you are attacked${canDiscard ? ' — or you can discard this one' : ''}.`;
    }
    else hint = 'Banked money must all be the same value.';
  }

  let status: string;
  if (finished) status = 'Game over';
  else if (needsHandoff) status = `Waiting for ${actorPlayer!.name}`;
  else if (myTurn) status = solo ? 'Your turn' : `${seat.name}'s turn`;
  else if (stealing) status = `Choose a card to steal from ${nameOf(state, pending!.targetId)}'s bank`;
  else if (defending) status = state.phase === 'bankrupt_draw' ? 'You drew BANKRUPT!' : 'You are under attack!';
  else if (state.phase === 'bankrupt_draw') status = `${actorPlayer!.name} drew BANKRUPT…`;
  else if (state.phase === 'reaction') status = `${actorPlayer!.name} is deciding whether to block…`;
  else if (state.phase === 'theft_selection') status = `${actorPlayer!.name} is choosing what to steal…`;
  else status = `${actorPlayer!.name} is thinking…`;

  const top = state.discardPile[state.discardPile.length - 1];

  return (
    <div className="game">
      <header className="topbar">
        <button type="button" className="btn btn--ghost" onClick={onExit}>
          {online ? '← Leave' : '← Menu'}
        </button>
        <div
          className="counter"
          role="img"
          aria-label={`${counterLabel}: ${bankruptCount} of ${BANKRUPT_TOTAL}`}
        >
          <span className="counter__label">{counterLabel}</span>
          <span className="counter__pips" aria-hidden="true">
            {Array.from({ length: BANKRUPT_TOTAL }, (_, i) => (
              <span key={i} className={`pip${i < bankruptCount ? ' pip--on' : ''}`} />
            ))}
          </span>
          <span className="counter__value" aria-hidden="true">
            {bankruptCount} / {BANKRUPT_TOTAL}
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

      {isMultiRound(match) && (
        <p className="matchbar" aria-label="Match score">
          <strong>Round {match.round}</strong>
          <span>first to {match.target} wins</span>
          {state.players.map((p) => (
            <span key={p.id} className="matchbar__player">
              {p.name} <b>{match.wins[p.id] ?? 0}</b>
            </span>
          ))}
        </p>
      )}

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
          <h2 className="me__name">
            {seat.name}
            {seat.insured && <span className="tag tag--good">insured</span>}
          </h2>
          <span className="total" aria-label={`Bank total $${bankTotal(seat)}`}>
            ${bankTotal(seat)}
          </span>
          <BankView bank={seat.bank} bonus={seat.bonus} ownerName={seat.name} />
        </div>

        {handVisible && (state.buffs.doubleUp || state.buffs.heist || state.buffs.extraTurn) && actor === seat.id && (
          <p className="buffs" role="status">
            {state.buffs.doubleUp && <span className="tag tag--gold">Double Up ready — bank a match!</span>}
            {state.buffs.heist && <span className="tag tag--gold">Big Heist ready — play your Bank Thief!</span>}
            {state.buffs.extraTurn && <span className="tag tag--gold">Overtime — you go again after this</span>}
          </p>
        )}
        {handVisible && seat.peek.length > 0 && (
          <div className="peek" aria-label="Top of the deck">
            <span className="peek__label">Inside Tip — next cards off the deck:</span>
            {seat.peek.map((card, i) => (
              <CardView key={card.id} card={card} size="sm" label={`Card ${i + 1} from the top: ${cardName(card)}`} />
            ))}
          </div>
        )}

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
          {myTurn && state.rules.shop && !state.buffs.bought && state.bankedThisTurn === 0 && (
            <button type="button" className="btn btn--shop" onClick={() => setShopOpen(true)}>
              🛒 Shop
            </button>
          )}
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
                {attackCard.kind === 'bankrupt'
                  ? 'Bankrupt'
                  : attackCard.kind === 'bank_swap'
                    ? 'Swap banks with'
                    : state.buffs.heist
                      ? 'Big Heist on'
                      : 'Rob'}{' '}
                {t.name} (${bankTotal(t)})
              </button>
            ))}
          {attackCard && targets.length === 0 && !canDiscard && (
            <p className="hint">Nobody has money in the bank to attack yet.</p>
          )}
          {canDiscard && single && (
            <button type="button" className="btn" onClick={() => dispatch({ type: 'discard', playerId: seat.id, cardIds: [single.id] })}>
              Discard {cardName(single)}
            </button>
          )}
          {myTurn && state.bankedThisTurn > 0 && (
            <button type="button" className="btn" onClick={() => dispatch({ type: 'end_turn', playerId: seat.id })}>
              End Turn
            </button>
          )}
          {myTurn && seat.hand.length === 0 && state.bankedThisTurn === 0 && (
            <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'pass', playerId: seat.id })}>
              Pass
            </button>
          )}
          {hint && <p className="hint">{hint}</p>}
        </div>
      </section>

      {shopOpen && myTurn && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="shop-title">
          <div className="dialog dialog--shop">
            <h2 id="shop-title">Shop</h2>
            <p className="note">
              You have <strong>${bankTotal(seat)}</strong> in your bank. One power-up per turn, bought before you play.
            </p>
            <ul className="shop">
              {SHOP_ITEMS.map((item) => {
                const problem = shopProblem(state, seat.id, item.id);
                return (
                  <li key={item.id} className="shop__item">
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.blurb}</span>
                      {problem && <em>{problem}</em>}
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={!!problem}
                      aria-label={`Buy ${item.name} for $${item.price}`}
                      onClick={() => {
                        dispatch({ type: 'buy', playerId: seat.id, item: item.id });
                        setShopOpen(false);
                      }}
                    >
                      ${item.price}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="btn" onClick={() => setShopOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {defending && (
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
              {state.phase === 'bankrupt_draw'
                ? `${actorPlayer!.name}, you drew BANKRUPT!`
                : state.phase === 'reaction'
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

      {finished && (
        <EndScreen
          state={state}
          match={match}
          onPlayAgain={onPlayAgain ? () => onPlayAgain(state) : undefined}
          onExit={onExit}
          online={!!online}
        />
      )}
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
  const total = bankTotal(player);
  return (
    <article className={`panel${active ? ' is-active' : ''}${onPick ? ' is-target' : ''}${hitClass(fx, player.id)}`}>
      <div className="panel__head">
        <h2 className="panel__name">
          {player.name}
          {player.isAI && <span className="tag">{player.difficulty} AI</span>}
          {player.insured && <span className="tag tag--good">insured</span>}
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
      <BankView bank={player.bank} bonus={player.bonus} ownerName={player.name} onPick={onPick} />
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
  const pending = state.pendingAttack;
  const kind = pending?.kind ?? 'bankrupt';
  const defense = defender.hand.find((c) => c.kind === DEFENSE_FOR[kind])!;
  const saved = sumMoney(pileSavedFromBankrupt(defender.bank, state.rules));
  const mine = bankTotal(defender);
  const attackerBank = pending ? bankTotal(state.players.find((p) => p.id === pending.attackerId)!) : 0;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="defense-title">
      <div className={`dialog dialog--${kind}`}>
        <h2 id="defense-title">
          {pending ? `${nameOf(state, pending.attackerId)} played ${CARD_NAMES[kind]} on you!` : 'You drew BANKRUPT!'}
        </h2>
        <p>
          {kind === 'bankrupt'
            ? saved > 0
              ? `You will lose $${mine - saved} and keep only your smallest pile ($${saved}) unless you block it.`
              : `Your whole bank ($${mine}) will be wiped out unless you block it.`
            : kind === 'bank_swap'
              ? `They will trade their $${attackerBank} bank for your $${mine} unless you block it.`
              : state.buffs.heist
                ? `It's a BIG HEIST: they will steal your whole bank ($${mine}) unless you block it.`
                : 'They will steal a card from your bank unless you block it.'}
          {defender.insured && kind === 'bankrupt' && ' Your Insurance would pay half back.'}
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

function EndScreen({
  state,
  match,
  onPlayAgain,
  onExit,
  online,
}: {
  state: GameState;
  match?: MatchState;
  onPlayAgain?: () => void;
  onExit: () => void;
  online: boolean;
}) {
  const { standings, winnerIds } = scoreGame(state);
  const winners = winnerIds.map((id) => nameOf(state, id));
  // Match play: score this round into the match to show where things stand.
  const after = isMultiRound(match) ? recordRound(match, state) : undefined;
  const champions = after ? matchWinnerIds(after) : null;
  const again = !after ? 'Play Again' : champions ? 'New Match' : `Play Round ${after.round}`;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div className="dialog dialog--end">
        {after && match ? (
          <>
            <p className="dialog__eyebrow">
              {champions ? 'Match over' : `Round ${match.round} — ${winners.length > 1 ? 'shared win' : 'winner'}`}
            </p>
            <h2 id="end-title">
              {champions
                ? `${champions.map((id) => nameOf(state, id)).join(' & ')} ${champions.length > 1 ? 'share' : 'wins'} the match!`
                : `${winners.join(' & ')} — $${standings[0].total}`}
            </h2>
            <ul className="matchscore" aria-label="Match score">
              {[...state.players]
                .sort((x, y) => (after.wins[y.id] ?? 0) - (after.wins[x.id] ?? 0) || (after.money[y.id] ?? 0) - (after.money[x.id] ?? 0))
                .map((p) => (
                  <li key={p.id} className={champions?.includes(p.id) ? 'is-winner' : undefined}>
                    <strong>{p.name}</strong>
                    <span
                      className="matchscore__pips"
                      role="img"
                      aria-label={`${after.wins[p.id] ?? 0} of ${after.target} round wins`}
                    >
                      {Array.from({ length: after.target }, (_, i) => (
                        <span key={i} className={`pip${i < (after.wins[p.id] ?? 0) ? ' pip--won' : ''}`} />
                      ))}
                    </span>
                    <small>${after.money[p.id] ?? 0} banked in all</small>
                  </li>
                ))}
            </ul>
            <p className="note">
              {champions
                ? `This round went to ${winners.join(' & ')} with $${standings[0].total}.`
                : `First to ${after.target} round wins takes the match.`}
            </p>
          </>
        ) : (
          <>
            <p className="dialog__eyebrow">{winners.length > 1 ? 'Shared victory' : 'Winner'}</p>
            <h2 id="end-title">
              {winners.join(' & ')} — ${standings[0].total}
            </h2>
          </>
        )}
        <div className="tablewrap">
          <table className="results">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Banked</th>
                <th scope="col">{state.rules.bankruptMode === 'trap' ? 'Bankrupts drawn / blocked' : 'Bankrupt used / blocked'}</th>
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
          {onPlayAgain ? (
            <button type="button" className="btn btn--primary" autoFocus onClick={onPlayAgain}>
              {again}
            </button>
          ) : (
            <p className="note" role="status">
              Waiting for the host to deal again…
            </p>
          )}
          <button type="button" className="btn" onClick={onExit}>
            {online ? 'Leave Game' : 'Return to Menu'}
          </button>
        </div>
      </div>
    </div>
  );
}
