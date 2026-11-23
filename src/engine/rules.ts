// Every rule the spec marks [PROPOSED] / [TO CONFIRM] that the creator still has
// to sign off on (spec §25) lives here, so changing her game never means
// rewriting the engine. The defaults are the spec's recommended playtest rules.

export type RuleConfig = {
  /** §25 #2 — smallest set of matching money that can be banked. 1 allows single cards. */
  minBankSetSize: 1 | 2;
  /**
   * §25 #4 — what an unblocked Bank Thief takes.
   * chosen_card: the thief picks one visible card.
   * random_card: one random card.
   * matching_group: the thief picks a denomination and takes every card of it.
   */
  thiefSteals: 'chosen_card' | 'random_card' | 'matching_group';
  /** §25 #7 — true: discarding is only allowed when no other move is legal. */
  discardOnlyWhenStuck: boolean;
  /**
   * §25 #9 — what happens when the sixth Bankrupt is drawn.
   * final_circuit: everyone gets one more turn. immediate: the game ends with that turn.
   */
  endTrigger: 'final_circuit' | 'immediate';
  /** §15.3 — may a defender holding the right defense choose not to play it? */
  allowDeclineDefense: boolean;
  /**
   * §25 #3 — how much a player may do on a turn.
   * one_action: exactly one of bank / attack / discard.
   * bank_then_attack: bank any number of matching sets, then optionally finish
   * with one attack. A player who does neither discards one card.
   */
  turnStyle: 'one_action' | 'bank_then_attack';
  /** What an unblocked Bankrupt destroys: the whole bank, or everything except the victim's smallest pile. */
  bankruptDestroys: 'all' | 'all_but_smallest_pile';
  /**
   * How many cards a stuck player may discard at once (they then refill as usual).
   * 1 = exactly one card (spec §9). 6 = "dump and redraw" as many as they like.
   */
  stuckDiscardLimit: number;
  /** Copies of Vault Lock and of Sheriff used in a 2-player game (the rest stay in the box). */
  twoPlayerDefenseCopies: number;
  /** Hand size (recovered rule: six). */
  handSize: number;
};

export const DEFAULT_RULES: RuleConfig = {
  minBankSetSize: 2,
  thiefSteals: 'chosen_card',
  discardOnlyWhenStuck: true,
  endTrigger: 'final_circuit',
  allowDeclineDefense: true,
  turnStyle: 'one_action',
  bankruptDestroys: 'all',
  stuckDiscardLimit: 1,
  twoPlayerDefenseCopies: 6,
  handSize: 6,
};

/**
 * The two rule sets offered on the setup screen.
 * original: the spec's recommended playtest rules, unchanged.
 * piggy: the same game with two changes chosen from simulated play —
 *   1. Bankrupt leaves the victim their smallest pile (almost nobody ends on $0);
 *   2. a 2-player game uses 4 Vault Locks and 4 Sheriffs, so attacks land more often.
 */
export const RULE_SETS = {
  piggy: { ...DEFAULT_RULES, bankruptDestroys: 'all_but_smallest_pile', twoPlayerDefenseCopies: 4 },
  original: DEFAULT_RULES,
} as const satisfies Record<string, RuleConfig>;

export type RuleSetId = keyof typeof RULE_SETS;
