// Turn actions, reactions, refill and endgame (spec §6–§11).

import { BANKRUPT_TOTAL, CARD_NAMES, DEFENSE_FOR, cardName, sumMoney, type AttackKind, type Card } from './cards';
import { nextRandom } from './rng';
import { cloneState, type Action, type GameState, type LogEntry, type Player } from './state';
import { validateAction } from './validators';

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
      player.stats.largestBank = Math.max(player.stats.largestBank, amount);
      log(s, 'bank', `${player.name} banked ${cards.length} × $${cards[0].value} (+$${amount}).`, player.id);
      endTurn(s);
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
      const card = takeFromHand(player, action.cardId);
      s.discardPile.push(card);
      log(s, 'discard', `${player.name} discarded ${cardName(card)}.`, player.id);
      endTurn(s);
      break;
    }
    case 'pass':
      log(s, 'pass', `${player.name} has no cards and passes.`, player.id);
      endTurn(s);
      break;
  }
  return s;
}

function resolveUnblocked(s: GameState) {
  const pending = s.pendingAttack!;
  const attacker = byId(s, pending.attackerId);
  const target = byId(s, pending.targetId);

  if (pending.kind === 'bankrupt') {
    const lost = sumMoney(target.bank);
    s.discardPile.push(...target.bank);
    target.bank = [];
    log(s, 'bankrupt', `${attacker.name} bankrupted ${target.name} — $${lost} wiped out!`, attacker.id, target.id);
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

/** Refill the active player's hand, check the countdown, and pass the turn. */
function endTurn(s: GameState) {
  s.pendingAttack = undefined;
  const player = s.players[s.currentPlayerIndex];
  const wasFinalTurn = !!s.finalRound;

  let bankruptsDrawn = 0;
  while (player.hand.length < s.rules.handSize && s.drawPile.length > 0) {
    const card = s.drawPile.pop()!;
    player.hand.push(card);
    if (card.kind === 'bankrupt') {
      s.bankruptDrawnCount++;
      bankruptsDrawn++;
    }
  }
  if (bankruptsDrawn > 0) {
    const what = bankruptsDrawn === 1 ? 'A Bankrupt card was' : `${bankruptsDrawn} Bankrupt cards were`;
    log(s, 'draw', `${what} drawn — ${s.bankruptDrawnCount} / ${BANKRUPT_TOTAL} revealed.`, player.id);
  }

  if (wasFinalTurn) {
    s.finalRound!.turnsRemaining--;
    if (s.finalRound!.turnsRemaining <= 0) return finish(s);
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
 * Final scoring (spec §3, §25 #10): most banked money wins; ties go to the player
 * with more banked cards; if that also ties, the win is shared.
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
  const { standings, winnerIds } = scoreGame(s);
  s.winnerIds = winnerIds;
  const names = winnerIds.map((id) => byId(s, id).name);
  const text =
    names.length === 1
      ? `${names[0]} wins with $${standings[0].total} in the bank!`
      : `Shared victory: ${names.join(' and ')} with $${standings[0].total} each!`;
  log(s, 'end', text);
}
