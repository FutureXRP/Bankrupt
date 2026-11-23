// Computer players for Boomtown. They work from a view of the game that holds
// only what a person in their seat could see: their own cards, and everyone's
// cash, property, protectors and hand SIZE — never other hands or the deck order.

import type { Difficulty } from '../engine/state';
import {
  BOARD,
  MAX_PROTECTORS,
  MAX_ROUNDS,
  SERVICES,
  SERVICE_FOR,
  serviceSpace,
  type ActionCard,
  type Service,
} from './data';
import { hireTerms, netWorth, type BoardAction, type BoardPhase, type BoardState } from './engine';

export type BoardView = {
  selfId: string;
  hand: ActionCard[];
  players: { id: string; name: string; cash: number; position: number; handCount: number; protectors: Record<Service, number>; worth: number }[];
  owners: (string | null)[];
  phase: BoardPhase;
  attacked: boolean;
  pending?: BoardState['pending'];
  round: number;
  bankruptsPlayed: number;
  finalRound: boolean;
  /** Hire price for the viewer at each building (null when it cannot be hired right now). */
  hire: Record<Service, { price: number; available: boolean }>;
};

export function boardView(s: BoardState, playerId: string): BoardView {
  const me = s.players.find((p) => p.id === playerId)!;
  const hire = {} as BoardView['hire'];
  for (const service of Object.keys(SERVICES) as Service[]) {
    const space = serviceSpace(service);
    const here = s.phase === 'landed' && me.position === space.index;
    const remote = s.phase === 'preroll' && s.owners[space.index] !== null;
    hire[service] = {
      price: hireTerms(s, playerId, service).price,
      available: (here || remote) && me.protectors[service] < MAX_PROTECTORS,
    };
  }
  return {
    selfId: playerId,
    hand: [...me.hand],
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      cash: p.cash,
      position: p.position,
      handCount: p.hand.length,
      protectors: { ...p.protectors },
      worth: netWorth(s, p.id),
    })),
    owners: [...s.owners],
    phase: s.phase,
    attacked: s.attacked,
    pending: s.pending ? { ...s.pending } : undefined,
    round: s.round,
    bankruptsPlayed: s.bankruptsPlayed,
    finalRound: !!s.finalRound,
    hire,
  };
}

type Rand = () => number;

export function chooseBoardAction(view: BoardView, difficulty: Difficulty, rand: Rand): BoardAction {
  const playerId = view.selfId;
  const me = view.players.find((p) => p.id === playerId)!;
  const rivals = view.players.filter((p) => p.id !== playerId);
  const casual = difficulty === 'casual';

  if (view.phase === 'reaction') {
    const pending = view.pending!;
    const attacker = view.players.find((p) => p.id === pending.attackerId)!;
    // Worth a protector? Not when there is almost nothing to lose, or a swap would help us.
    const worthIt =
      pending.kind === 'bank_swap' ? attacker.cash < me.cash : pending.kind === 'bankrupt' ? me.cash >= 100 : me.cash >= 50;
    return { type: 'respond', playerId, block: casual ? true : worthIt };
  }

  if (view.phase === 'preroll') {
    const late = view.finalRound || view.round >= MAX_ROUNDS - 2;
    if (!view.attacked && view.hand.length > 0) {
      const richest = rivals.reduce((a, b) => (b.cash > a.cash ? b : a));
      const leader = rivals.reduce((a, b) => (b.worth > a.worth ? b : a));
      const pickTarget = casual ? rivals[Math.floor(rand() * rivals.length)] : richest;
      const has = (kind: ActionCard['kind']) => view.hand.find((c) => c.kind === kind);

      const swap = has('bank_swap');
      const best = rivals.reduce((a, b) => (b.cash > a.cash ? b : a));
      if (swap && best.cash - me.cash >= (casual ? 50 : 150)) {
        return { type: 'play', playerId, cardId: swap.id, targetId: best.id };
      }
      const bankrupt = has('bankrupt');
      if (bankrupt) {
        // Save Bankrupt for a big pile of cash, unless time (or hand space) is running out.
        const target = casual ? pickTarget : richest.cash >= 300 ? richest : leader;
        const bankrupts = view.hand.filter((c) => c.kind === 'bankrupt').length;
        const now = casual ? rand() < 0.6 : richest.cash >= 300 || late || bankrupts >= 2 || view.hand.length >= 4;
        if (now) return { type: 'play', playerId, cardId: bankrupt.id, targetId: target.id };
      }
      const thief = has('bank_thief');
      if (thief && pickTarget.cash >= 50) return { type: 'play', playerId, cardId: thief.id, targetId: pickTarget.id };
    }
    // Hire protection from a building somebody owns, if we are carrying cash worth protecting.
    if (!casual || rand() < 0.3) {
      const wants: [Service, number][] = [
        ['vault', 350],
        ['deputy', 300],
        ['lawyer', 450],
      ];
      for (const [service, cashNeeded] of wants) {
        const offer = view.hire[service];
        if (offer.available && me.protectors[service] === 0 && me.cash >= cashNeeded) {
          return { type: 'hire', playerId, service };
        }
      }
    }
    return { type: 'roll', playerId };
  }

  // Landed on something with a decision to make.
  const space = BOARD[me.position];
  const reserve = casual ? 0 : 100;
  if (space.kind === 'business') {
    const keen = casual ? rand() < 0.8 : true;
    return keen && me.cash - space.price >= reserve ? { type: 'buy', playerId } : { type: 'done', playerId };
  }
  if (space.kind === 'service') {
    const unowned = view.owners[space.index] === null;
    if (unowned && me.cash - space.price >= reserve && (!casual || rand() < 0.6)) return { type: 'buy', playerId };
    const offer = view.hire[space.service];
    const blocks = SERVICES[space.service].blocks;
    const threatened = SERVICE_FOR[blocks] === space.service && me.cash >= 250;
    if (offer.available && me.protectors[space.service] === 0 && threatened && me.cash - offer.price >= reserve) {
      return { type: 'hire', playerId, service: space.service };
    }
  }
  return { type: 'done', playerId };
}
