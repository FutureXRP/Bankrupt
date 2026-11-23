// Turn actions, reactions, refill and endgame.

import { BANKRUPT_TOTAL, CARD_NAMES, DEFENSE_FOR, cardName, sumMoney, type AttackKind, type Card } from './cards';
import { nextRandom } from './rng';
import { cloneState, type Action, type GameState, type LogEntry, type Player } from './state';
import { pileSavedFromBankrupt, validateAction } from './validators';

export class RuleError extends Error {}

function log(s: GameState, kind: LogEntry['kind'], text: string, actorId?: string, targetId?: string) {
  s.actionLog.push({ id: s.actionLog.length, turn: s.turnNumber, kind, text, actorId, targetId });
}

const byId = (s: GameState, id: string): Player => s.players.find((p) => p.id === id)!;

function takeFromHand(player: Player, cardId: string): Card {
  const index = player.hand.findIndex((c) => c.id === cardId);
  return player.hand.splice(index, 1)[0];
}

/** Applies a legal action and returns the new state. Throws RuleError if it is not legal. */
export function applyAction(prev: GameState, action: Action): GameState {
  const problem = validateAction(prev, action);
  if (problem) throw new RuleError(problem);

  const s = cloneState(prev);
  const player = byId(s, action.playerId);

  switch (action.type) {
    case 'bank': {
      const ids = new Set(action.cardIds);
      const cards = player.hand.filter((c) => ids.has(c.id));
      player.hand = player.hand.filter((c) => !ids.has(c.id));
      player.bank.push(...cards);
      const amount = sumMoney(cards);
      s.bankedThisTurn += amount;
      player.stats.largestBank = Math.max(player.stats.largestBank, s.bankedThisTurn);
      log(s, 'bank', `${player.name} banked ${cards.length} × $${cards[0].value} (+$${amount}).`, player.id);
      if (s.rules.turnStyle === 'one_action') endTurn(s);
      break;
    }
    case 'attack': {
      const card = takeFromHand(player, action.cardId);
      s.discardPile.push(card); // the attack card is spent whether or not it lands
      const kind = card.kind as AttackKind;
      const target = byId(s, action.targetId);
      if (kind === 'bankrupt') player.stats.bankruptPlayed++;
      else player.stats.thiefPlayed++;
      s.pendingAttack = { kind, attackerId: player.id, targetId: target.id, cardId: card.id };
      if (target.hand.some((c) => c.kind === DEFENSE_FOR[kind])) {
        s.phase = 'reaction';
        log(s, 'attack', `${player.name} played ${CARD_NAMES[kind]} on ${target.name}!`, player.id, target.id);
      } else {
        resolveUnblocked(s);
      }
      break;
    }
    case 'defend': {
      if (s.phase === 'bankrupt_draw') {
        answerDrawnBankrupt(s, player, action.cardId);
        break;
      }
      if (action.cardId === null) {
        resolveUnblocked(s);
        break;
      }
      const pending = s.pendingAttack!;
      const attacker = byId(s, pending.attackerId);
      const defense = takeFromHand(player, action.cardId);
      s.discardPile.push(defense);
      if (pending.kind === 'bankrupt') attacker.stats.bankruptBlocked++;
      else attacker.stats.thiefBlocked++;
      log(
        s,
        'block',
        `${player.name} blocked ${attacker.name}'s ${CARD_NAMES[pending.kind]} with ${cardName(defense)}.`,
        player.id,
        attacker.id,
      );
      endTurn(s);
      break;
    }
    case 'steal':
      completeTheft(s, action.cardId);
      break;
    case 'discard': {
      const cards = action.cardIds.map((id) => takeFromHand(player, id));
      s.discardPile.push(...cards);
      log(s, 'discard', `${player.name} discarded ${cards.map(cardName).join(', ')}.`, player.id);
      endTurn(s);
      break;
    }
    case 'pass':
      log(s, 'pass', `${player.name} has no cards and passes.`, player.id);
      endTurn(s);
      break;
    case 'end_turn':
      endTurn(s);
      break;
  }
  return s;
}

/** Empties a bank (except any pile the rules let the owner keep) and reports the dollars lost and kept. */
function wipeBank(s: GameState, victim: Player): { lost: number; kept: number } {
  const kept = pileSavedFromBankrupt(victim.bank, s.rules);
  const destroyed = victim.bank.filter((c) => !kept.includes(c));
  s.discardPile.push(...destroyed);
  victim.bank = kept;
  return { lost: sumMoney(destroyed), kept: sumMoney(kept) };
}

function resolveUnblocked(s: GameState) {
  const pending = s.pendingAttack!;
  const attacker = byId(s, pending.attackerId);
  const target = byId(s, pending.targetId);

  if (pending.kind === 'bankrupt') {
    const { lost, kept } = wipeBank(s, target);
    const saved = kept > 0 ? ` They keep $${kept}.` : '';
    log(
      s,
      'bankrupt',
      `${attacker.name} bankrupted ${target.name} — $${lost} wiped out!${saved}`,
      attacker.id,
      target.id,
    );
    endTurn(s);
    return;
  }

  if (s.rules.thiefSteals === 'random_card') {
    const r = nextRandom(s.rngState);
    s.rngState = r.state;
    completeTheft(s, target.bank[Math.floor(r.value * target.bank.length)].id);
  } else if (target.bank.length === 1) {
    completeTheft(s, target.bank[0].id);
  } else {
    s.phase = 'theft_selection';
  }
}

function completeTheft(s: GameState, cardId: string) {
  const pending = s.pendingAttack!;
  const attacker = byId(s, pending.attackerId);
  const target = byId(s, pending.targetId);
  const picked = target.bank.find((c) => c.id === cardId)!;
  const taken =
    s.rules.thiefSteals === 'matching_group' ? target.bank.filter((c) => c.value === picked.value) : [picked];
  const takenIds = new Set(taken.map((c) => c.id));
  target.bank = target.bank.filter((c) => !takenIds.has(c.id));
  attacker.bank.push(...taken);
  log(
    s,
    'thief',
    `${attacker.name}'s Bank Thief stole $${sumMoney(taken)} from ${target.name}.`,
    attacker.id,
    target.id,
  );
  endTurn(s);
}

/** The active player's action is over: refill their hand, then pass the turn. */
function endTurn(s: GameState) {
  s.pendingAttack = undefined;
  s.bankedThisTurn = 0;
  refill(s);
}

const counter = (s: GameState) => `${s.bankruptDrawnCount} / ${BANKRUPT_TOTAL}`;

/** In trap mode with an immediate ending, the sixth Bankrupt stops everything. */
const trapEndsGameNow = (s: GameState) =>
  s.rules.bankruptMode === 'trap' && s.rules.endTrigger === 'immediate' && s.bankruptDrawnCount >= BANKRUPT_TOTAL;

/**
 * Draw up to the hand limit, one card at a time. In trap mode a drawn Bankrupt
 * hits the player who drew it; if they hold a Vault Lock the refill pauses for
 * their decision and resumes afterwards.
 */
function refill(s: GameState) {
  const player = s.players[s.currentPlayerIndex];
  while (player.hand.length < s.rules.handSize && s.drawPile.length > 0) {
    const card = s.drawPile.pop()!;
    if (card.kind !== 'bankrupt') {
      player.hand.push(card);
      continue;
    }
    s.bankruptDrawnCount++;

    if (s.rules.bankruptMode === 'attack') {
      player.hand.push(card);
      log(s, 'draw', `A Bankrupt card was drawn — ${counter(s)} revealed.`, player.id);
      continue;
    }

    s.discardPile.push(card);
    player.stats.bankruptPlayed++;
    if (player.bank.length === 0) {
      log(s, 'draw', `${player.name} drew BANKRUPT (${counter(s)}) — but had nothing in the bank to lose.`, player.id);
    } else if (player.hand.some((c) => c.kind === 'vault_lock')) {
      s.phase = 'bankrupt_draw';
      s.pendingDraw = { playerId: player.id };
      log(s, 'attack', `${player.name} drew BANKRUPT (${counter(s)})!`, player.id, player.id);
      return; // wait for the Vault Lock decision
    } else {
      bankruptDrawer(s, player);
    }
    if (trapEndsGameNow(s)) break;
  }
  finishTurn(s);
}

function bankruptDrawer(s: GameState, player: Player) {
  const { lost, kept } = wipeBank(s, player);
  const saved = kept > 0 ? ` They keep $${kept}.` : '';
  log(
    s,
    'bankrupt',
    `${player.name} drew BANKRUPT (${counter(s)}) — $${lost} wiped out!${saved}`,
    player.id,
    player.id,
  );
}

function answerDrawnBankrupt(s: GameState, player: Player, cardId: string | null) {
  s.pendingDraw = undefined;
  s.phase = 'action';
  if (cardId === null) {
    bankruptDrawer(s, player);
  } else {
    s.discardPile.push(takeFromHand(player, cardId));
    player.stats.bankruptBlocked++;
    log(s, 'block', `${player.name}'s Vault Lock saved the bank from BANKRUPT!`, player.id);
  }
  if (trapEndsGameNow(s)) finishTurn(s);
  else refill(s);
}

/** Check the countdown and pass the turn (or end the game). */
function finishTurn(s: GameState) {
  const player = s.players[s.currentPlayerIndex];
  if (s.finalRound) {
    s.finalRound.turnsRemaining--;
    if (s.finalRound.turnsRemaining <= 0) return finish(s);
  } else if (s.bankruptDrawnCount >= BANKRUPT_TOTAL) {
    if (s.rules.endTrigger === 'immediate') return finish(s);
    s.finalRound = { triggeredByPlayerId: player.id, turnsRemaining: s.players.length };
    log(s, 'final', 'All six Bankrupt cards are out. FINAL ROUND — everyone gets one last turn!', player.id);
  }

  s.currentPlayerIndex = (s.currentPlayerIndex + 1) % s.players.length;
  s.turnNumber++;
  s.phase = 'action';
}

export type Standing = { playerId: string; name: string; total: number; cards: number; rank: number };

/**
 * Final scoring: most banked money wins; ties go to the player with more banked
 * cards; if that also ties, the win is shared.
 */
export function scoreGame(state: GameState): { standings: Standing[]; winnerIds: string[] } {
  const rows = state.players
    .map((p) => ({ playerId: p.id, name: p.name, total: sumMoney(p.bank), cards: p.bank.length, rank: 0 }))
    .sort((a, b) => b.total - a.total || b.cards - a.cards);
  rows.forEach((row, i) => {
    const above = rows[i - 1];
    row.rank = above && above.total === row.total && above.cards === row.cards ? above.rank : i + 1;
  });
  return { standings: rows, winnerIds: rows.filter((r) => r.rank === 1).map((r) => r.playerId) };
}

function finish(s: GameState) {
  s.phase = 'finished';
  s.pendingAttack = undefined;
  s.pendingDraw = undefined;
  const { standings, winnerIds } = scoreGame(s);
  s.winnerIds = winnerIds;
  const names = winnerIds.map((id) => byId(s, id).name);
  const text =
    names.length === 1
      ? `${names[0]} wins with $${standings[0].total} in the bank!`
      : `Shared victory: ${names.join(' and ')} with $${standings[0].total} each!`;
  log(s, 'end', text);
}
