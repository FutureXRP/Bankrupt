// BANKRUPT: BOOMTOWN — rules tests and simulated games.

import { describe, expect, it } from 'vitest';
import { boardView, chooseBoardAction } from '../src/board/ai';
import {
  BANKRUPT_CARDS,
  BOARD,
  BUILDING_PRICE,
  HAND_LIMIT,
  LATE_START_BONUS,
  MAX_ROUNDS,
  PAYDAY,
  SERVICES,
  START_CASH,
  THIEF_AMOUNT,
  buildActionDeck,
  serviceSpace,
  type ActionCard,
} from '../src/board/data';
import {
  applyBoardAction,
  boardActorId,
  boardStandings,
  checkBoardInvariants,
  createBoardGame,
  currentPlayer,
  hireTerms,
  netWorth,
  rentFor,
  validateBoardAction,
  type BoardState,
} from '../src/board/engine';
import { makeRng, nextRandom, type Difficulty } from '../src/engine';

const seats = (n: number) => ['Ava', 'Ben', 'Chloe', 'Dev'].slice(0, n).map((name) => ({ name, isAI: false }));

/** A fresh game arranged so that Ava (p1) is up, with empty hands and a harmless card on top. */
function game(n = 3): BoardState {
  const s = createBoardGame({ players: seats(n), seed: 5 });
  for (const p of s.players) {
    s.deck.push(...p.hand);
    p.hand = [];
    p.cash = START_CASH;
  }
  // Windfalls go to the bottom, so the card each player draws at the start of a turn
  // never changes anyone's cash unless a test puts one on top on purpose.
  s.deck.sort((a, b) => Number(a.kind !== 'windfall') - Number(b.kind !== 'windfall'));
  s.firstPlayerIndex = 0;
  s.currentPlayerIndex = 0;
  s.phase = 'preroll';
  s.attacked = false;
  s.log = [];
  return s;
}

/** Move a card of this kind from the deck into a player's hand. */
function deal(s: BoardState, playerIndex: number, kind: ActionCard['kind']): string {
  const i = s.deck.findIndex((c) => c.kind === kind);
  const [card] = s.deck.splice(i, 1);
  s.players[playerIndex].hand.push(card);
  return card.id;
}

/** Put a card of this kind on top of the deck, so it is the next one drawn. */
function nextDraw(s: BoardState, kind: ActionCard['kind']) {
  const i = s.deck.findIndex((c) => c.kind === kind);
  s.deck.push(s.deck.splice(i, 1)[0]);
}

/** Fix the dice so the next roll adds up to `total`. */
function loadDice(s: BoardState, total: number) {
  for (let seed = 1; seed < 100000; seed++) {
    const a = nextRandom(seed);
    const b = nextRandom(a.state);
    if (2 + Math.floor(a.value * 6) + Math.floor(b.value * 6) === total) {
      s.rngState = seed;
      return;
    }
  }
  throw new Error('no such roll');
}

/** A do-nothing turn: the current player ends up resting in the Town Park. */
function rest(s: BoardState): BoardState {
  currentPlayer(s).position = 16;
  return rollTo(s, 23);
}

/** Roll for the current player so they land on board space `index`. */
function rollTo(s: BoardState, index: number): BoardState {
  const p = currentPlayer(s);
  const distance = (index - p.position + BOARD.length) % BOARD.length;
  loadDice(s, distance);
  return applyBoardAction(s, { type: 'roll', playerId: p.id });
}

describe('Boomtown: the board and the cards', () => {
  it('has 24 spaces: 12 businesses in four districts of three, three service buildings on corners', () => {
    expect(BOARD).toHaveLength(24);
    const businesses = BOARD.filter((x) => x.kind === 'business');
    expect(businesses).toHaveLength(12);
    for (const d of ['green', 'blue', 'purple', 'gold']) expect(businesses.filter((b) => b.kind === 'business' && b.district === d)).toHaveLength(3);
    expect(BOARD.filter((x) => x.kind === 'service').map((x) => x.index)).toEqual([6, 12, 18]);
    expect(BOARD.every((space, i) => space.index === i)).toBe(true);
  });

  it('the action deck always has six Bankrupt cards and grows with the table', () => {
    const sizes = [2, 3, 4].map((n) => {
      const deck = buildActionDeck(n);
      expect(deck.filter((c) => c.kind === 'bankrupt')).toHaveLength(BANKRUPT_CARDS);
      expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length);
      return deck.length;
    });
    expect(sizes[0]).toBeLessThan(sizes[1]);
    expect(sizes[1]).toBeLessThan(sizes[2]);
  });

  it('starts fairly: later seats get a little more cash, and the first player has drawn a card', () => {
    const s = createBoardGame({ players: seats(4), seed: 12 });
    const first = s.firstPlayerIndex;
    const startingCash = s.players.map((_, i) => START_CASH + LATE_START_BONUS * ((i - first + 4) % 4));
    // The first player may already have been paid a Windfall by their opening draw.
    s.players.forEach((player, i) => expect(player.cash).toBeGreaterThanOrEqual(startingCash[i]));
    expect(s.phase).toBe('preroll');
    expect(checkBoardInvariants(s)).toEqual([]);
  });
});

describe('Boomtown: moving, buying and rent', () => {
  it('landing on a free business offers it for sale; buying takes the cash and ends the turn', () => {
    let s = rollTo(game(), 9); // Toy Store, $200
    expect(s.phase).toBe('landed');
    expect(validateBoardAction(s, { type: 'buy', playerId: 'p2' })).not.toBeNull();
    s = applyBoardAction(s, { type: 'buy', playerId: 'p1' });
    expect(s.owners[9]).toBe('p1');
    expect(s.players[0].cash).toBe(START_CASH - 200);
    expect(netWorth(s, 'p1')).toBe(START_CASH); // the money became property
    expect(s.currentPlayerIndex).toBe(1);
  });

  it('you may decline to buy', () => {
    let s = rollTo(game(), 9);
    s = applyBoardAction(s, { type: 'done', playerId: 'p1' });
    expect(s.owners[9]).toBeNull();
    expect(s.currentPlayerIndex).toBe(1);
  });

  it('landing on someone else’s business pays them rent, doubled if they own the whole colour', () => {
    const s = game();
    s.owners[9] = 'p2';
    const toy = BOARD[9] as Extract<(typeof BOARD)[number], { kind: 'business' }>;
    expect(rentFor(s, toy)).toBe(80);
    let after = rollTo(s, 9);
    expect(after.players[0].cash).toBe(START_CASH - 80);
    expect(after.players[1].cash).toBe(START_CASH + 80);
    expect(after.players[1].rentIncome).toBe(80);
    expect(after.currentPlayerIndex).toBe(1);

    const whole = game();
    whole.owners[7] = whole.owners[9] = whole.owners[10] = 'p2';
    expect(rentFor(whole, toy)).toBe(160);
    after = rollTo(whole, 9);
    expect(after.players[0].cash).toBe(START_CASH - 160);
  });

  it('rent never takes more than you have, and nobody is knocked out', () => {
    const s = game();
    s.owners[9] = 'p2';
    s.players[0].cash = 30;
    const after = rollTo(s, 9);
    expect(after.players[0].cash).toBe(0);
    expect(after.players[1].cash).toBe(START_CASH + 30);
    expect(after.phase).toBe('preroll');
  });

  it('passing START pays out', () => {
    const s = game();
    s.players[0].position = 16;
    const after = rollTo(s, 23); // not yet round the corner
    expect(after.players[0].cash).toBe(START_CASH);
    const s2 = game();
    s2.players[0].position = 20;
    const round = rollTo(s2, 2); // passes START and lands on a card space
    expect(round.players[0].cash).toBeGreaterThanOrEqual(START_CASH + PAYDAY);
  });

  it('tax and bonus spaces move money', () => {
    expect(rollTo(game(), 5).players[0].cash).toBe(START_CASH - 50);
    expect(rollTo(game(), 11).players[0].cash).toBe(START_CASH + 100);
  });
});

describe('Boomtown: attack cards and protection', () => {
  it('Bankrupt wipes out cash but never property, and the card leaves the game', () => {
    let s = game();
    s.owners[9] = 'p2';
    const card = deal(s, 0, 'bankrupt');
    s = applyBoardAction(s, { type: 'play', playerId: 'p1', cardId: card, targetId: 'p2' });
    expect(s.players[1].cash).toBe(0);
    expect(netWorth(s, 'p2')).toBe(200);
    expect(s.bankruptsPlayed).toBe(1);
    expect(s.phase).toBe('preroll'); // the attacker still rolls
    expect(checkBoardInvariants(s)).toEqual([]);
  });

  it('Bank Thief steals a fixed amount and Bank Swap trades cash piles', () => {
    let s = game();
    let card = deal(s, 0, 'bank_thief');
    s = applyBoardAction(s, { type: 'play', playerId: 'p1', cardId: card, targetId: 'p2' });
    expect([s.players[0].cash, s.players[1].cash]).toEqual([START_CASH + THIEF_AMOUNT, START_CASH - THIEF_AMOUNT]);

    s = game();
    s.players[0].cash = 40;
    s.players[2].cash = 900;
    card = deal(s, 0, 'bank_swap');
    s = applyBoardAction(s, { type: 'play', playerId: 'p1', cardId: card, targetId: 'p3' });
    expect([s.players[0].cash, s.players[2].cash]).toEqual([900, 40]);
  });

  it('only one attack card per turn, and only before rolling', () => {
    let s = game();
    const a = deal(s, 0, 'bank_thief');
    const b = deal(s, 0, 'bank_thief');
    s = applyBoardAction(s, { type: 'play', playerId: 'p1', cardId: a, targetId: 'p2' });
    expect(validateBoardAction(s, { type: 'play', playerId: 'p1', cardId: b, targetId: 'p3' })).toMatch(/One attack/);
    expect(validateBoardAction(s, { type: 'play', playerId: 'p1', cardId: b, targetId: 'p1' })).not.toBeNull();
  });

  it('each protector stops exactly its own attack, once', () => {
    const pairs = [
      ['bank_thief', 'deputy'],
      ['bank_swap', 'lawyer'],
      ['bankrupt', 'vault'],
    ] as const;
    for (const [attack, guard] of pairs) {
      let s = game();
      s.players[1].protectors = { deputy: 0, lawyer: 0, vault: 0 };
      s.players[1].protectors[guard] = 1;
      const card = deal(s, 0, attack);
      s = applyBoardAction(s, { type: 'play', playerId: 'p1', cardId: card, targetId: 'p2' });
      expect(s.phase).toBe('reaction');
      expect(boardActorId(s)).toBe('p2');
      s = applyBoardAction(s, { type: 'respond', playerId: 'p2', block: true });
      expect(s.players[1].cash).toBe(START_CASH);
      expect(s.players[1].protectors[guard]).toBe(0);
      expect(s.phase).toBe('preroll');
      expect(boardActorId(s)).toBe('p1');
    }
    // The wrong protector gives no chance to respond.
    let s = game();
    s.players[1].protectors = { deputy: 2, lawyer: 2, vault: 0 };
    const card = deal(s, 0, 'bankrupt');
    s = applyBoardAction(s, { type: 'play', playerId: 'p1', cardId: card, targetId: 'p2' });
    expect(s.players[1].cash).toBe(0);
  });

  it('a player may hold their protector back', () => {
    let s = game();
    s.players[1].protectors.deputy = 1;
    const card = deal(s, 0, 'bank_thief');
    s = applyBoardAction(s, { type: 'play', playerId: 'p1', cardId: card, targetId: 'p2' });
    s = applyBoardAction(s, { type: 'respond', playerId: 'p2', block: false });
    expect(s.players[1].cash).toBe(START_CASH - THIEF_AMOUNT);
    expect(s.players[1].protectors.deputy).toBe(1);
  });
});

describe('Boomtown: deputy or the whole station?', () => {
  const station = serviceSpace('deputy').index;

  it('with no owner you must land there: hire one (the bank is paid) or buy the building', () => {
    const s = game();
    expect(validateBoardAction(s, { type: 'hire', playerId: 'p1', service: 'deputy' })).toMatch(/land on it/);
    let landed = rollTo(s, station);
    expect(landed.phase).toBe('landed');
    landed = applyBoardAction(landed, { type: 'hire', playerId: 'p1', service: 'deputy' });
    expect(landed.players[0].cash).toBe(START_CASH - SERVICES.deputy.price);
    expect(landed.players[0].protectors.deputy).toBe(1);
    expect(landed.phase).toBe('landed'); // can still buy the building, or stop
    landed = applyBoardAction(landed, { type: 'buy', playerId: 'p1' });
    expect(landed.owners[station]).toBe('p1');
    expect(landed.players[0].cash).toBe(START_CASH - SERVICES.deputy.price - BUILDING_PRICE);
  });

  it('once it is owned, anyone can hire from anywhere and the OWNER is paid', () => {
    let s = game();
    s.owners[station] = 'p2';
    expect(hireTerms(s, 'p1', 'deputy')).toEqual({ price: 100, payTo: 'p2' });
    s = applyBoardAction(s, { type: 'hire', playerId: 'p1', service: 'deputy' });
    expect(s.players[0].cash).toBe(START_CASH - 100);
    expect(s.players[1].cash).toBe(START_CASH + 100);
    expect(s.players[1].serviceIncome).toBe(100);
    expect(s.phase).toBe('preroll'); // hiring does not use up the turn
  });

  it('the owner hires from their own building at half price', () => {
    let s = game();
    s.owners[station] = 'p1';
    expect(hireTerms(s, 'p1', 'deputy')).toEqual({ price: 50, payTo: null });
    s = applyBoardAction(s, { type: 'hire', playerId: 'p1', service: 'deputy' });
    expect(s.players[0].cash).toBe(START_CASH - 50);
  });

  it('you can hold at most two of each, and must be able to pay', () => {
    let s = game();
    s.owners[station] = 'p2';
    s = applyBoardAction(s, { type: 'hire', playerId: 'p1', service: 'deputy' });
    s = applyBoardAction(s, { type: 'hire', playerId: 'p1', service: 'deputy' });
    expect(validateBoardAction(s, { type: 'hire', playerId: 'p1', service: 'deputy' })).toMatch(/at most 2/);
    const poor = game();
    poor.owners[station] = 'p2';
    poor.players[0].cash = 60;
    expect(validateBoardAction(poor, { type: 'hire', playerId: 'p1', service: 'deputy' })).toMatch(/afford/);
  });

  it('a service building charges no rent for landing on it', () => {
    const s = game();
    s.owners[station] = 'p2';
    s.players[0].protectors.deputy = 2; // nothing to hire
    const after = rollTo(s, station);
    expect(after.players[0].cash).toBe(START_CASH);
    expect(after.currentPlayerIndex).toBe(1);
  });
});

describe('Boomtown: drawing cards', () => {
  it('a Windfall pays out at once; an attack card goes into the hand', () => {
    let s = game();
    nextDraw(s, 'windfall');
    s = rollTo(s, 2); // a "draw a card" space
    expect(s.players[0].cash).toBeGreaterThan(START_CASH);
    expect(s.players[0].hand).toHaveLength(0);

    s = game();
    nextDraw(s, 'bank_thief');
    s = rollTo(s, 2);
    expect(s.players[0].hand.map((c) => c.kind)).toEqual(['bank_thief']);
  });

  it('a full hand sends the drawn card to the bottom of the deck', () => {
    let s = game();
    for (let i = 0; i < HAND_LIMIT; i++) deal(s, 0, 'bank_thief');
    nextDraw(s, 'bankrupt');
    const cards = s.deck.length;
    s = rollTo(s, 2);
    expect(s.players[0].hand).toHaveLength(HAND_LIMIT);
    expect(s.deck[0].kind).toBe('bankrupt');
    // (The next player then drew their start-of-turn card.)
    expect(s.deck.length).toBe(cards - 1);
    expect(checkBoardInvariants(s)).toEqual([]);
  });

  it('used cards are reshuffled when the deck runs out — except Bankrupt cards', () => {
    let s = game(2);
    const bankrupt = deal(s, 0, 'bankrupt');
    s = applyBoardAction(s, { type: 'play', playerId: 'p1', cardId: bankrupt, targetId: 'p2' });
    s.discard.push(...s.deck.splice(0)); // everything else has been used
    s = rollTo(s, 2);
    expect(s.deck.length + s.discard.length + s.players.reduce((n, p) => n + p.hand.length, 0)).toBe(buildActionDeck(2).length - 1);
    expect([...s.deck, ...s.discard, ...s.players.flatMap((p) => p.hand)].filter((c) => c.kind === 'bankrupt')).toHaveLength(BANKRUPT_CARDS - 1);
  });
});

describe('Boomtown: how it ends', () => {
  it('after the sixth Bankrupt: finish the round, then one final round, so turns are equal', () => {
    let s = game(3);
    s.bankruptsPlayed = 5;
    for (let i = 0; i < 5; i++) s.deck.splice(s.deck.findIndex((c) => c.kind === 'bankrupt'), 1);
    s.currentPlayerIndex = 1; // Ben plays it in the middle of a round
    const card = deal(s, 1, 'bankrupt');
    s = applyBoardAction(s, { type: 'play', playerId: 'p2', cardId: card, targetId: 'p1' });
    expect(s.finalRound).toBeUndefined();
    s = rest(s);
    // Chloe still has her turn in this round, then all three play the final round: 4 turns.
    expect(s.finalRound).toEqual({ turnsRemaining: 4 });
    const turns: string[] = [];
    while (s.phase !== 'finished') {
      const p = currentPlayer(s);
      turns.push(p.name);
      s = rest(s);
    }
    expect(turns).toEqual(['Chloe', 'Ava', 'Ben', 'Chloe']);
    expect(s.winnerIds!.length).toBeGreaterThan(0);
  });

  it('the bank closes after the round limit even if Bankrupt cards are still held', () => {
    let s = game(2);
    s.round = MAX_ROUNDS;
    s.currentPlayerIndex = 1;
    s = rest(s);
    expect(s.round).toBe(MAX_ROUNDS + 1);
    expect(s.finalRound).toEqual({ turnsRemaining: 2 });
  });

  it('the winner has the most cash plus property; ties go to more property, then are shared', () => {
    const s = game(3);
    s.players[0].cash = 900;
    s.players[1].cash = 500;
    s.owners[22] = 'p2'; // Theme Park, $400
    s.players[2].cash = 100;
    const result = boardStandings(s);
    expect(result.standings.map((r) => [r.name, r.total])).toEqual([
      ['Ben', 900],
      ['Ava', 900],
      ['Chloe', 100],
    ]);
    expect(result.winnerIds).toEqual(['p2']);
    s.owners[22] = null;
    s.players[1].cash = 900;
    expect(boardStandings(s).winnerIds).toEqual(['p1', 'p2']);
  });
});

describe('Boomtown: computer players', () => {
  it('see only what a person in their seat could see', () => {
    const s = createBoardGame({ players: seats(3).map((x) => ({ ...x, isAI: true })), seed: 3 });
    deal(s, 1, 'bankrupt');
    deal(s, 2, 'bank_thief');
    const view = JSON.stringify(boardView(s, 'p1'));
    for (const card of [...s.players[1].hand, ...s.players[2].hand, ...s.deck]) expect(view).not.toContain(`"${card.id}"`);
    expect(boardView(s, 'p1').players.map((p) => p.handCount)).toEqual(s.players.map((p) => p.hand.length));
  });

  it('1,200 simulated games finish, always with legal moves and a healthy state', () => {
    const levels: Difficulty[] = ['casual', 'competitive'];
    let longest = 0;
    for (let seed = 1; seed <= 1200; seed++) {
      const n = 2 + (seed % 3);
      const rand = makeRng(seed * 17);
      let s = createBoardGame({
        players: Array.from({ length: n }, (_, i) => ({ name: `Bot ${i + 1}`, isAI: true, difficulty: levels[(seed + i) % 2] })),
        seed,
      });
      let steps = 0;
      while (s.phase !== 'finished') {
        if (++steps > 4000) throw new Error(`seed ${seed}: game did not finish`);
        const id = boardActorId(s)!;
        const action = chooseBoardAction(boardView(s, id), s.players.find((p) => p.id === id)!.difficulty!, rand);
        const problem = validateBoardAction(s, action);
        if (problem) throw new Error(`seed ${seed}: illegal move (${problem})`);
        s = applyBoardAction(s, action);
        const broken = checkBoardInvariants(s);
        if (broken.length) throw new Error(`seed ${seed}: ${broken.join(' ')}`);
      }
      longest = Math.max(longest, s.round);
      expect(s.round).toBeLessThanOrEqual(MAX_ROUNDS + 2);
      // Everybody had the same number of turns.
      expect(s.currentPlayerIndex).toBe((s.firstPlayerIndex + n - 1) % n);
    }
    expect(longest).toBeGreaterThan(8);
  });
});
