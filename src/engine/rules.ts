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
  /** Hand size (recovered rule: six). */
  handSize: number;
};

export const DEFAULT_RULES: RuleConfig = {
  minBankSetSize: 2,
  thiefSteals: 'chosen_card',
  discardOnlyWhenStuck: true,
  endTrigger: 'final_circuit',
  allowDeclineDefense: true,
  handSize: 6,
};
