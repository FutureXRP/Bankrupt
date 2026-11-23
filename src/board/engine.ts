// BANKRUPT: BOOMTOWN rules engine. Pure functions: state in, new state out.
//
// A turn: draw an action card, optionally play ONE attack card and hire
// protectors from buildings somebody owns, then roll, move and deal with the
// space you land on. The game ends one full round after the sixth Bankrupt card
// is played (or after the round limit). Richest in cash plus property wins.

import { nextRandom, shuffled } from '../engine/rng';
import type { Difficulty } from '../engine/state';
import {
  ATTACK_NAMES,
  BANKRUPT_CARDS,
  BOARD,
  BOARD_SIZE,
  HAND_LIMIT,
  LATE_START_BONUS,
  MAX_PROTECTORS,
  MAX_ROUNDS,
  PAYDAY,
  SERVICES,
  SERVICE_FOR,
  START_CASH,
  THIEF_AMOUNT,
  buildActionDeck,
  serviceSpace,
  type ActionCard,
  type AttackCardKind,
  type Service,
  type Space,
} from './data';

export type BoardPlayer = {
  id: string;
  name: string;
  isAI: boolean;
  difficulty?: Difficulty;
  cash: number;
  position: number;
  hand: ActionCard[]; // private
  protectors: Record<Service, number>;
  /** Money earned from other players hiring at buildings this player owns. */
  serviceIncome: number;
  rentIncome: number;
};

export type BoardPhase = 'preroll' | 'reaction' | 'landed' | 'finished';

export type BoardLogKind =
  | 'setup'
  | 'draw'
  | 'bonus'
  | 'roll'
  | 'buy'
  | 'rent'
  | 'hire'
  | 'attack'
  | 'bankrupt'
  | 'thief'
  | 'swap'
  | 'block'
  | 'tax'
  | 'final'
  | 'end';

export type BoardLogEntry = { id: number; kind: BoardLogKind; text: string; actorId?: string; targetId?: string };

export type BoardState = {
  players: BoardPlayer[];
  /** Owner id of each space (businesses and buildings), by board index. */
  owners: (string | null)[];
  deck: ActionCard[]; // top is the END of the array
  discard: ActionCard[];
  bankruptsPlayed: number;
  firstPlayerIndex: number;
  currentPlayerIndex: number;
  round: number;
  phase: BoardPhase;
  /** True once the current player has played their one attack card this turn. */
  attacked: boolean;
  pending?: { kind: AttackCardKind; attackerId: string; targetId: string };
  lastRoll?: [number, number];
  finalRound?: { turnsRemaining: number };
  rngState: number;
  log: BoardLogEntry[];
  winnerIds?: string[];
};

export type BoardAction =
  | { type: 'play'; playerId: string; cardId: string; targetId: string }
  /** The target of an attack decides whether to use their protector. */
  | { type: 'respond'; playerId: string; block: boolean }
  | { type: 'hire'; playerId: string; service: Service }
  | { type: 'roll'; playerId: string }
  /** Buy the business or building you are standing on. */
  | { type: 'buy'; playerId: string }
  /** Finish dealing with the space you landed on. */
  | { type: 'done'; playerId: string };

export type BoardSeat = { name: string; isAI: boolean; difficulty?: Difficulty };

const clone = (s: BoardState): BoardState => ({
  ...s,
  players: s.players.map((p) => ({ ...p, hand: [...p.hand], protectors: { ...p.protectors } })),
  owners: [...s.owners],
  deck: [...s.deck],
  discard: [...s.discard],
  pending: s.pending ? { ...s.pending } : undefined,
  finalRound: s.finalRound ? { ...s.finalRound } : undefined,
  log: [...s.log],
});

function log(s: BoardState, kind: BoardLogKind, text: string, actorId?: string, targetId?: string) {
  s.log.push({ id: s.log.length, kind, text, actorId, targetId });
}

const byId = (s: BoardState, id: string) => s.players.find((p) => p.id === id)!;
export const currentPlayer = (s: BoardState) => s.players[s.currentPlayerIndex];

export function createBoardGame(options: { players: BoardSeat[]; seed: number }): BoardState {
  const count = options.players.length;
  if (count < 2 || count > 4) throw new Error('Boomtown is for 2 to 4 players.');
  let rngState = options.seed >>> 0;
  const deck = shuffled(buildActionDeck(count), rngState);
  rngState = deck.rngState;
  const first = nextRandom(rngState);
  rngState = first.state;
  const firstPlayerIndex = Math.floor(first.value * count);
  const s: BoardState = {
    players: options.players.map((seat, i) => ({
      id: `p${i + 1}`,
      name: seat.name,
      isAI: seat.isAI,
      difficulty: seat.isAI ? (seat.difficulty ?? 'casual') : undefined,
      cash: START_CASH + LATE_START_BONUS * ((i - firstPlayerIndex + count) % count),
      position: 0,
      hand: [],
      protectors: { deputy: 0, lawyer: 0, vault: 0 },
      serviceIncome: 0,
      rentIncome: 0,
    })),
    owners: BOARD.map(() => null),
    deck: deck.items,
    discard: [],
    bankruptsPlayed: 0,
    firstPlayerIndex,
    currentPlayerIndex: firstPlayerIndex,
    round: 1,
    phase: 'preroll',
    attacked: false,
    rngState,
    log: [],
  };
  log(
    s,
    'setup',
    `${s.players[firstPlayerIndex].name} goes first with $${START_CASH}. Each player after starts with $${LATE_START_BONUS} more.`,
  );
  beginTurn(s);
  return s;
}

// ---------- money and property ----------

/** Businesses and buildings a player owns. */
export function holdings(s: BoardState, playerId: string): Space[] {
  return BOARD.filter((space) => s.owners[space.index] === playerId);
}

export function propertyValue(s: BoardState, playerId: string): number {
  return holdings(s, playerId).reduce((sum, space) => sum + ('price' in space ? space.price : 0), 0);
}

/** What wins the game: cash plus the price of everything owned. */
export function netWorth(s: BoardState, playerId: string): number {
  return byId(s, playerId).cash + propertyValue(s, playerId);
}

/** Rent for a business: doubled when one player owns its whole district. */
export function rentFor(s: BoardState, space: Extract<Space, { kind: 'business' }>): number {
  const owner = s.owners[space.index];
  const district = BOARD.filter((x) => x.kind === 'business' && x.district === space.district);
  const whole = owner !== null && district.every((x) => s.owners[x.index] === owner);
  return space.rent * (whole ? 2 : 1);
}

/**
 * What hiring a protector costs this player right now, and who gets the money.
 * The owner of the building hires at half price; everyone else pays the owner
 * in full. With no owner, the full price goes to the bank.
 */
export function hireTerms(s: BoardState, playerId: string, service: Service): { price: number; payTo: string | null } {
  const owner = s.owners[serviceSpace(service).index];
  const full = SERVICES[service].price;
  if (owner === playerId) return { price: full / 2, payTo: null };
  return { price: full, payTo: owner };
}

// ---------- validation ----------

export function validateBoardAction(s: BoardState, a: BoardAction): string | null {
  if (s.phase === 'finished') return 'The game is over.';
  const player = s.players.find((p) => p.id === a.playerId);
  if (!player) return 'Unknown player.';

  if (a.type === 'respond') {
    if (s.phase !== 'reaction' || s.pending?.targetId !== player.id) return 'There is nothing to respond to.';
    if (a.block && player.protectors[SERVICE_FOR[s.pending.kind]] < 1) return 'You have nothing to block that with.';
    return null;
  }
  if (currentPlayer(s).id !== player.id) return 'It is not your turn.';

  switch (a.type) {
    case 'play': {
      if (s.phase !== 'preroll') return 'Cards are played before you roll.';
      if (s.attacked) return 'One attack card per turn.';
      const card = player.hand.find((c) => c.id === a.cardId);
      if (!card) return 'That card is not in your hand.';
      if (card.kind === 'windfall') return 'That card cannot be played on someone.';
      if (a.targetId === player.id) return 'Pick another player.';
      if (!s.players.some((p) => p.id === a.targetId)) return 'Unknown target.';
      return null;
    }
    case 'hire': {
      const space = serviceSpace(a.service);
      const info = SERVICES[a.service];
      const standingThere = s.phase === 'landed' && player.position === space.index;
      const owned = s.owners[space.index] !== null;
      if (s.phase === 'preroll') {
        if (!owned) return `Nobody owns the ${info.building} yet — you have to land on it.`;
      } else if (!standingThere) {
        return `You are not at the ${info.building}.`;
      }
      if (player.protectors[a.service] >= MAX_PROTECTORS) return `You can hold at most ${MAX_PROTECTORS} ${info.plural}.`;
      if (player.cash < hireTerms(s, player.id, a.service).price) return 'You cannot afford that.';
      return null;
    }
    case 'roll':
      return s.phase === 'preroll' ? null : 'You have already rolled.';
    case 'buy': {
      if (s.phase !== 'landed') return 'There is nothing to buy right now.';
      const space = BOARD[player.position];
      if (space.kind !== 'business' && space.kind !== 'service') return 'This space is not for sale.';
      if (s.owners[space.index] !== null) return 'Somebody already owns this.';
      return player.cash >= space.price ? null : 'You cannot afford it.';
    }
    case 'done':
      return s.phase === 'landed' ? null : 'Roll first.';
  }
}

// ---------- actions ----------

export function applyBoardAction(prev: BoardState, a: BoardAction): BoardState {
  const problem = validateBoardAction(prev, a);
  if (problem) throw new Error(problem);
  const s = clone(prev);
  const player = byId(s, a.playerId);

  switch (a.type) {
    case 'play': {
      const index = player.hand.findIndex((c) => c.id === a.cardId);
      const card = player.hand.splice(index, 1)[0];
      const kind = card.kind as AttackCardKind;
      const target = byId(s, a.targetId);
      s.attacked = true;
      // Bankrupt cards leave the game when played; the others can come round again.
      if (kind === 'bankrupt') s.bankruptsPlayed++;
      else s.discard.push(card);
      s.pending = { kind, attackerId: player.id, targetId: target.id };
      if (target.protectors[SERVICE_FOR[kind]] > 0) {
        s.phase = 'reaction';
        log(s, 'attack', `${player.name} played ${ATTACK_NAMES[kind]} on ${target.name}!`, player.id, target.id);
      } else {
        resolveAttack(s);
      }
      break;
    }
    case 'respond': {
      const pending = s.pending!;
      if (a.block) {
        const service = SERVICE_FOR[pending.kind];
        player.protectors[service]--;
        log(
          s,
          'block',
          `${player.name}'s ${SERVICES[service].name} stopped ${byId(s, pending.attackerId).name}'s ${ATTACK_NAMES[pending.kind]}.`,
          player.id,
          pending.attackerId,
        );
        s.pending = undefined;
        s.phase = 'preroll';
      } else {
        resolveAttack(s);
      }
      break;
    }
    case 'hire': {
      const info = SERVICES[a.service];
      const { price, payTo } = hireTerms(s, player.id, a.service);
      player.cash -= price;
      player.protectors[a.service]++;
      if (payTo) {
        const owner = byId(s, payTo);
        owner.cash += price;
        owner.serviceIncome += price;
        log(s, 'hire', `${player.name} hired a ${info.name} from ${owner.name}'s ${info.building} for $${price}.`, player.id, owner.id);
      } else {
        log(s, 'hire', `${player.name} hired a ${info.name} for $${price}.`, player.id);
      }
      break;
    }
    case 'roll': {
      const d1 = rollDie(s);
      const d2 = rollDie(s);
      s.lastRoll = [d1, d2];
      const from = player.position;
      player.position = (from + d1 + d2) % BOARD_SIZE;
      const space = BOARD[player.position];
      log(s, 'roll', `${player.name} rolled ${d1} + ${d2} and landed on ${space.name}.`, player.id);
      if (player.position < from) {
        player.cash += PAYDAY;
        log(s, 'bonus', `${player.name} passed START and collected $${PAYDAY}.`, player.id);
      }
      land(s, player, space);
      break;
    }
    case 'buy': {
      const space = BOARD[player.position] as Extract<Space, { kind: 'business' | 'service' }>;
      player.cash -= space.price;
      s.owners[space.index] = player.id;
      log(s, 'buy', `${player.name} bought the ${space.name} for $${space.price}.`, player.id);
      endTurn(s);
      break;
    }
    case 'done':
      endTurn(s);
      break;
  }
  return s;
}

function rollDie(s: BoardState): number {
  const r = nextRandom(s.rngState);
  s.rngState = r.state;
  return 1 + Math.floor(r.value * 6);
}

function resolveAttack(s: BoardState) {
  const pending = s.pending!;
  const attacker = byId(s, pending.attackerId);
  const target = byId(s, pending.targetId);
  if (pending.kind === 'bankrupt') {
    const lost = target.cash;
    target.cash = 0;
    log(s, 'bankrupt', `${attacker.name} BANKRUPTED ${target.name} — $${lost} in cash wiped out!`, attacker.id, target.id);
  } else if (pending.kind === 'bank_thief') {
    const taken = Math.min(THIEF_AMOUNT, target.cash);
    target.cash -= taken;
    attacker.cash += taken;
    log(s, 'thief', `${attacker.name}'s Bank Thief stole $${taken} from ${target.name}.`, attacker.id, target.id);
  } else {
    const [mine, theirs] = [attacker.cash, target.cash];
    attacker.cash = theirs;
    target.cash = mine;
    log(s, 'swap', `BANK SWAP! ${attacker.name} traded $${mine} in cash for ${target.name}'s $${theirs}.`, attacker.id, target.id);
  }
  s.pending = undefined;
  s.phase = 'preroll';
}

/** Draw the top action card. Windfalls pay out at once; a full hand sends the card to the bottom. */
function drawCard(s: BoardState, player: BoardPlayer) {
  if (s.deck.length === 0 && s.discard.length > 0) {
    const mixed = shuffled(s.discard, s.rngState);
    s.deck = mixed.items;
    s.rngState = mixed.rngState;
    s.discard = [];
  }
  const card = s.deck.pop();
  if (!card) return;
  if (card.kind === 'windfall') {
    player.cash += card.amount!;
    s.discard.push(card);
    log(s, 'bonus', `${player.name} drew a Windfall: +$${card.amount}.`, player.id);
  } else if (player.hand.length >= HAND_LIMIT) {
    s.deck.unshift(card);
    log(s, 'draw', `${player.name}'s hand is full, so the card went to the bottom of the deck.`, player.id);
  } else {
    player.hand.push(card);
    log(s, 'draw', `${player.name} drew a card.`, player.id);
  }
}

function land(s: BoardState, player: BoardPlayer, space: Space) {
  switch (space.kind) {
    case 'business': {
      const ownerId = s.owners[space.index];
      if (ownerId === null) {
        if (player.cash >= space.price) {
          s.phase = 'landed';
          return;
        }
      } else if (ownerId !== player.id) {
        const owner = byId(s, ownerId);
        const paid = Math.min(player.cash, rentFor(s, space));
        player.cash -= paid;
        owner.cash += paid;
        owner.rentIncome += paid;
        log(s, 'rent', `${player.name} paid ${owner.name} $${paid} at the ${space.name}.`, player.id, owner.id);
      }
      break;
    }
    case 'service': {
      const ownerId = s.owners[space.index];
      const canBuy = ownerId === null && player.cash >= space.price;
      const canHire =
        player.protectors[space.service] < MAX_PROTECTORS && player.cash >= hireTerms(s, player.id, space.service).price;
      if (canBuy || canHire) {
        s.phase = 'landed';
        return;
      }
      break;
    }
    case 'card':
      drawCard(s, player);
      break;
    case 'tax': {
      const paid = Math.min(player.cash, space.amount);
      player.cash -= paid;
      log(s, 'tax', `${player.name} paid $${paid} in Town Tax.`, player.id);
      break;
    }
    case 'bonus':
      player.cash += space.amount;
      log(s, 'bonus', `Lucky Day! ${player.name} collected $${space.amount}.`, player.id);
      break;
    default:
      break;
  }
  endTurn(s);
}

function beginTurn(s: BoardState) {
  s.phase = 'preroll';
  s.attacked = false;
  s.pending = undefined;
  drawCard(s, currentPlayer(s));
}

function endTurn(s: BoardState) {
  if (s.finalRound) {
    s.finalRound.turnsRemaining--;
    if (s.finalRound.turnsRemaining <= 0) return finish(s);
  }
  const next = (s.currentPlayerIndex + 1) % s.players.length;
  if (next === s.firstPlayerIndex) s.round++;
  if (!s.finalRound && (s.bankruptsPlayed >= BANKRUPT_CARDS || s.round > MAX_ROUNDS)) {
    // Finish the round in progress, then play one more full round, so that
    // everybody ends the game having had exactly the same number of turns.
    const leftThisRound = (s.firstPlayerIndex - next + s.players.length) % s.players.length;
    s.finalRound = { turnsRemaining: leftThisRound + s.players.length };
    const why = s.bankruptsPlayed >= BANKRUPT_CARDS ? 'All six Bankrupt cards have been played.' : 'The bank is closing.';
    const when = leftThisRound > 0 ? 'Finish this round, then everyone gets one FINAL ROUND!' : 'FINAL ROUND — everyone gets one last turn!';
    log(s, 'final', `${why} ${when}`);
  }
  s.currentPlayerIndex = next;
  beginTurn(s);
}

export type BoardStanding = { playerId: string; name: string; cash: number; property: number; total: number; rank: number };

export function boardStandings(s: BoardState): { standings: BoardStanding[]; winnerIds: string[] } {
  const rows = s.players
    .map((p) => ({ playerId: p.id, name: p.name, cash: p.cash, property: propertyValue(s, p.id), total: netWorth(s, p.id), rank: 0 }))
    .sort((a, b) => b.total - a.total || b.property - a.property);
  rows.forEach((row, i) => {
    const above = rows[i - 1];
    row.rank = above && above.total === row.total && above.property === row.property ? above.rank : i + 1;
  });
  return { standings: rows, winnerIds: rows.filter((r) => r.rank === 1).map((r) => r.playerId) };
}

function finish(s: BoardState) {
  s.phase = 'finished';
  s.pending = undefined;
  const { standings, winnerIds } = boardStandings(s);
  s.winnerIds = winnerIds;
  const names = winnerIds.map((id) => byId(s, id).name);
  log(
    s,
    'end',
    names.length === 1
      ? `${names[0]} wins Boomtown with $${standings[0].total}!`
      : `Shared victory: ${names.join(' and ')} with $${standings[0].total} each!`,
  );
}

/** Who has to decide something right now. */
export function boardActorId(s: BoardState): string | null {
  if (s.phase === 'finished') return null;
  return s.phase === 'reaction' ? s.pending!.targetId : currentPlayer(s).id;
}

/** Sanity checks used by the tests and simulations. */
export function checkBoardInvariants(s: BoardState): string[] {
  const problems: string[] = [];
  for (const p of s.players) {
    if (p.cash < 0 || !Number.isInteger(p.cash)) problems.push(`${p.name} has $${p.cash}.`);
    if (p.hand.length > HAND_LIMIT) problems.push(`${p.name} holds ${p.hand.length} cards.`);
    if (p.hand.some((c) => c.kind === 'windfall')) problems.push(`${p.name} is holding a Windfall.`);
    for (const k of Object.keys(p.protectors) as Service[]) {
      if (p.protectors[k] < 0 || p.protectors[k] > MAX_PROTECTORS) problems.push(`${p.name} has ${p.protectors[k]} ${k}.`);
    }
  }
  const cards = [...s.deck, ...s.discard, ...s.players.flatMap((p) => p.hand)];
  const expected = buildActionDeck(s.players.length).length - s.bankruptsPlayed;
  if (cards.length !== expected) problems.push(`Expected ${expected} action cards, found ${cards.length}.`);
  if (new Set(cards.map((c) => c.id)).size !== cards.length) problems.push('An action card is in two places.');
  if (cards.filter((c) => c.kind === 'bankrupt').length !== BANKRUPT_CARDS - s.bankruptsPlayed) {
    problems.push('Bankrupt cards do not add up.');
  }
  if (s.discard.some((c) => c.kind === 'bankrupt')) problems.push('A Bankrupt card is in the discard pile.');
  if ((s.phase === 'reaction') !== !!s.pending) problems.push('Pending attack does not match the phase.');
  return problems;
}
