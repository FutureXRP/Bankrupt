// The tutorial is a scripted game on the real engine. This walks the whole
// script so a rules change can never leave the coach describing something that
// does not happen.

import { describe, expect, it } from 'vitest';
import {
  applyAction,
  bankTotal,
  checkInvariants,
  publicBankruptCount,
  validateAction,
  type Action,
  type GameState,
} from '../src/engine';
import { STEPS, stackedGame } from '../src/ui/Tutorial';

const hand = (s: GameState, i: number) => s.players[i].hand;
const ids = (s: GameState, i: number, kind: string, value?: number) =>
  hand(s, i)
    .filter((c) => c.kind === kind && (value === undefined || c.value === value))
    .map((c) => c.id);

/** The move the coach asks for at each "your move" step, in order. */
const coached: ((s: GameState) => Action)[] = [
  (s) => ({ type: 'bank', playerId: 'p1', cardIds: ids(s, 0, 'money', 100) }),
  (s) => ({ type: 'attack', playerId: 'p1', cardId: ids(s, 0, 'bank_thief')[0], targetId: 'p2' }),
  (s) => ({ type: 'steal', playerId: 'p1', cardId: s.players[1].bank[0].id }),
  (s) => ({ type: 'defend', playerId: 'p1', cardId: ids(s, 0, 'sheriff')[0] }),
  (s) => ({ type: 'discard', playerId: 'p1', cardIds: [hand(s, 0).find((c) => c.kind === 'money')!.id] }),
  (s) => ({ type: 'defend', playerId: 'p1', cardId: ids(s, 0, 'vault_lock')[0] }),
];

describe('tutorial script', () => {
  it('starts as a fair, complete deck with the coached hand', () => {
    const s = stackedGame();
    expect(checkInvariants(s)).toEqual([]);
    expect(s.currentPlayerIndex).toBe(0);
    expect(hand(s, 0).map((c) => (c.kind === 'money' ? `$${c.value}` : c.kind)).sort()).toEqual(
      ['$100', '$100', '$5', 'bank_thief', 'sheriff', 'vault_lock'].sort(),
    );
  });

  it('every step happens exactly as the coach describes, from first tap to last', () => {
    let s = stackedGame();
    let next = 0;
    for (const step of STEPS) {
      if (step.auto) {
        const action = step.auto(s);
        expect(validateAction(s, action), step.say).toBeNull();
        s = applyAction(s, action);
      } else if (step.expect) {
        const action = coached[next++](s);
        expect(step.expect(action, s), step.say).toBe(true);
        expect(validateAction(s, action), step.say).toBeNull();
        s = applyAction(s, action);
      }
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(next).toBe(coached.length);
    // Where the coach says you end up:
    expect(bankTotal(s.players[0])).toBe(250); // $200 banked + the stolen $50, saved by the Vault Lock
    expect(bankTotal(s.players[1])).toBe(0); // Penny was bankrupted
    expect(publicBankruptCount(s)).toBe(2);
    expect(s.phase).toBe('action');
    expect(s.players[0].stats).toMatchObject({ thiefPlayed: 1, bankruptPlayed: 1, bankruptBlocked: 1 });
  });

  it('the coached moments really are forced by the stacked deck', () => {
    let s = stackedGame();
    s = applyAction(s, coached[0](s));
    s = applyAction(s, STEPS[2].auto!(s));
    s = applyAction(s, coached[1](s));
    expect(s.phase).toBe('theft_selection'); // Penny had no Sheriff
    s = applyAction(s, coached[2](s));
    s = applyAction(s, STEPS[5].auto!(s));
    expect(s.phase).toBe('reaction'); // you are asked about your Sheriff
    s = applyAction(s, coached[3](s));
    // No match in hand now, so discarding is the natural move.
    const money = hand(s, 0).filter((c) => c.kind === 'money').map((c) => c.value);
    expect(new Set(money).size).toBe(money.length);
    s = applyAction(s, coached[4](s));
    expect(s.phase).toBe('bankrupt_draw'); // you drew Bankrupt while holding a Vault Lock
  });

  it('only the coached move is accepted', () => {
    const s = stackedGame();
    const discard: Action = { type: 'discard', playerId: 'p1', cardIds: [hand(s, 0)[5].id] };
    expect(STEPS[1].expect!(discard, s)).toBe(false);
    expect(STEPS[1].nudge).toBeTruthy();
    // Step 8 will not let you throw away the Vault Lock you are about to need.
    const lock: Action = { type: 'discard', playerId: 'p1', cardIds: ids(s, 0, 'vault_lock') };
    expect(STEPS[7].expect!(lock, s)).toBe(false);
    // And "Don't block" is refused when the coach is teaching the block.
    expect(STEPS[6].expect!({ type: 'defend', playerId: 'p1', cardId: null }, s)).toBe(false);
  });
});
