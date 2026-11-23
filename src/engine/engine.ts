// Turn actions, reactions, refill and endgame.

import { BANKRUPT_TOTAL, CARD_NAMES, DEFENSE_FOR, cardName, sumMoney, type AttackKind, type Card } from './cards';
import { nextRandom } from './rng';
import { PEEK_COUNT, bankTotal, noBuffs, shopItem } from './shop';
import { cloneState, type Action, type GameState, type LogEntry, type Player } from './state';
import { pileSavedFromBankrupt, validateAction } from './validators';
import { publicBankruptCount } from './view';

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
      let doubled = '';
      if (s.buffs.doubleUp) {
        s.buffs.doubleUp = false;
        player.bonus += amount;
        s.bankedThisTurn += amount;
        doubled = ` DOUBLE UP — worth $${amount * 2}!`;
      }
      player.stats.largestBank = Math.max(player.stats.largestBank, s.bankedThisTurn);
      log(s, 'bank', `${player.name} banked ${cards.length} × $${cards[0].value} (+$${amount}).${doubled}`, player.id);
      if (s.rules.turnStyle === 'one_action') endTurn(s);
      break;
    }
    case 'attack': {
      const card = takeFromHand(player, action.cardId);
      s.discardPile.push(card); // the attack card is spent whether or not it lands
      const kind = card.kind as AttackKind;
      const target = byId(s, action.targetId);
      if (kind === 'bankrupt') player.stats.bankruptPlayed++;
      if (kind === 'bank_thief') player.stats.thiefPlayed++;
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
      if (pending.kind === 'bank_thief') attacker.stats.thiefBlocked++;
      log(
        s,
        'block',
        `${player.name} blocked ${attacker.name}'s ${CARD_NAMES[pending.kind]} with ${cardName(defense)}.`,
        player.id,
        attacker.id,
      );
      // The defender spent a card, so they restock first, then the attacker.
      endTurn(s, s.rules.refillAfterDefense ? [player.id] : []);
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
    case 'buy': {
      const item = shopItem(action.item);
      pay(s, player, item.price);
      s.buffs.bought = true;
      let note = '';
      if (item.id === 'double_up') s.buffs.doubleUp = true;
      if (item.id === 'big_heist') s.buffs.heist = true;
      if (item.id === 'overtime') s.buffs.extraTurn = true;
      if (item.id === 'insurance') player.insured = true;
      if (item.id === 'inside_tip') {
        player.peek = s.drawPile.slice(-PEEK_COUNT).reverse(); // first card drawn comes first
        note = ' and peeked at the deck';
      }
      log(s, 'shop', `${player.name} bought ${item.name} for $${item.price}${note}.`, player.id);
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

/**
 * Pay a shop price from a bank: loose cash first, then the smallest money
 * cards. Cards go to the discard pile and any overpayment comes back as cash,
 * so the bank always drops by exactly the price.
 */
function pay(s: GameState, player: Player, price: number) {
  const fromCash = Math.min(player.bonus, price);
  player.bonus -= fromCash;
  const due = price - fromCash;
  if (due === 0) return;
  const spent: Card[] = [];
  let paid = 0;
  for (const card of [...player.bank].sort((a, b) => a.value! - b.value!)) {
    if (paid >= due) break;
    spent.push(card);
    paid += card.value!;
  }
  player.bank = player.bank.filter((c) => !spent.includes(c));
  s.discardPile.push(...spent);
  player.bonus += paid - due;
}

/**
 * Empties a bank (except any pile the rules let the owner keep) and reports the
 * dollars lost and kept. Insurance pays back half of what was lost, as cash.
 */
function wipeBank(s: GameState, victim: Player): { lost: number; kept: number } {
  const keptPile = pileSavedFromBankrupt(victim.bank, s.rules);
  const destroyed = victim.bank.filter((c) => !keptPile.includes(c));
  s.discardPile.push(...destroyed);
  victim.bank = keptPile;
  const lost = sumMoney(destroyed) + victim.bonus;
  victim.bonus = 0;
  let payout = 0;
  if (victim.insured) {
    victim.insured = false;
    payout = Math.floor(lost / 2 / 5) * 5;
    victim.bonus = payout;
  }
  return { lost: lost - payout, kept: sumMoney(keptPile) + payout };
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

  if (pending.kind === 'bank_swap') {
    const [mine, theirs] = [bankTotal(attacker), bankTotal(target)];
    [attacker.bank, target.bank] = [target.bank, attacker.bank];
    [attacker.bonus, target.bonus] = [target.bonus, attacker.bonus];
    log(
      s,
      'thief',
      `BANK SWAP! ${attacker.name} traded a $${mine} bank for ${target.name}'s $${theirs}.`,
      attacker.id,
      target.id,
    );
    endTurn(s);
    return;
  }

  if (s.buffs.heist) {
    const haul = bankTotal(target);
    attacker.bank.push(...target.bank);
    attacker.bonus += target.bonus;
    target.bank = [];
    target.bonus = 0;
    log(s, 'thief', `BIG HEIST! ${attacker.name} cleaned out ${target.name}'s whole bank — $${haul}!`, attacker.id, target.id);
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

/**
 * The active player's action is over: restock hands, then pass the turn.
 * `first` lists anyone who must restock before the active player does.
 */
function endTurn(s: GameState, first: string[] = []) {
  s.pendingAttack = undefined;
  s.bankedThisTurn = 0;
  s.refillQueue = [...first, s.players[s.currentPlayerIndex].id];
  refill(s);
}

const counter = (s: GameState) => `${s.bankruptDrawnCount} / ${BANKRUPT_TOTAL}`;

/** In trap mode with an immediate ending, the sixth Bankrupt stops everything. */
const trapEndsGameNow = (s: GameState) =>
  s.rules.bankruptMode === 'trap' && s.rules.endTrigger === 'immediate' && s.bankruptDrawnCount >= BANKRUPT_TOTAL;

/**
 * Each queued player draws up to the hand limit, one card at a time. In trap
 * mode a drawn Bankrupt hits the player who drew it; if they hold a Vault Lock
 * the refill pauses for their decision and resumes afterwards.
 */
function refill(s: GameState) {
  while (s.refillQueue.length > 0) {
    const player = byId(s, s.refillQueue[0]);
    while (player.hand.length < s.rules.handSize && s.drawPile.length > 0) {
      const card = s.drawPile.pop()!;
      if (card.kind !== 'bankrupt') {
        player.hand.push(card);
        continue;
      }
      s.bankruptDrawnCount++;

      if (s.rules.bankruptMode === 'attack') {
        player.hand.push(card); // a secret: nobody is told until it is played
        continue;
      }

      s.discardPile.push(card);
      player.stats.bankruptPlayed++;
      if (bankTotal(player) === 0) {
        log(s, 'draw', `${player.name} drew BANKRUPT (${counter(s)}) — but had nothing in the bank to lose.`, player.id);
      } else if (player.hand.some((c) => c.kind === 'vault_lock')) {
        s.phase = 'bankrupt_draw';
        s.pendingDraw = { playerId: player.id };
        log(s, 'attack', `${player.name} drew BANKRUPT (${counter(s)})!`, player.id, player.id);
        return; // wait for the Vault Lock decision
      } else {
        bankruptDrawer(s, player);
      }
      if (trapEndsGameNow(s)) {
        s.refillQueue = [];
        return finishTurn(s);
      }
    }
    s.refillQueue.shift();
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
  if (trapEndsGameNow(s)) {
    s.refillQueue = [];
    finishTurn(s);
  } else {
    refill(s);
  }
}

/** Check the countdown and pass the turn (or end the game). */
function finishTurn(s: GameState) {
  const player = s.players[s.currentPlayerIndex];
  // Trap rules count Bankrupt cards drawn; attack rules count the ones played.
  const allOut = publicBankruptCount(s) >= BANKRUPT_TOTAL;
  const gameEndsNow = !s.finalRound && allOut && s.rules.endTrigger === 'immediate';
  const overtime = s.buffs.extraTurn && !gameEndsNow;
  s.buffs = noBuffs();
  player.peek = [];
  if (overtime) {
    // Overtime: the same player goes again, and it does not use up a Final Round turn.
    log(s, 'shop', `Overtime! ${player.name} takes another turn.`, player.id);
    s.turnNumber++;
    s.phase = 'action';
    return;
  }
  if (s.finalRound) {
    s.finalRound.turnsRemaining--;
    if (s.finalRound.turnsRemaining <= 0) return finish(s);
  } else if (allOut) {
    if (s.rules.endTrigger === 'immediate') return finish(s);
    s.finalRound = { triggeredByPlayerId: player.id, turnsRemaining: s.players.length };
    const what = s.rules.bankruptMode === 'attack' ? 'have been played' : 'are out';
    log(s, 'final', `All six Bankrupt cards ${what}. FINAL ROUND — everyone gets one last turn!`, player.id);
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
    .map((p) => ({ playerId: p.id, name: p.name, total: bankTotal(p), cards: p.bank.length, rank: 0 }))
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
  s.refillQueue = [];
  const { standings, winnerIds } = scoreGame(s);
  s.winnerIds = winnerIds;
  const names = winnerIds.map((id) => byId(s, id).name);
  const text =
    names.length === 1
      ? `${names[0]} wins with $${standings[0].total} in the bank!`
      : `Shared victory: ${names.join(' and ')} with $${standings[0].total} each!`;
  log(s, 'end', text);
}
