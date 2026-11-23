// Every rule the spec marks [PROPOSED] / [TO CONFIRM] that the creator still has
// to sign off on (spec §25) lives here, so changing her game never means
// rewriting the engine. The defaults are the spec's recommended playtest rules.

export type RuleConfig = {
  /**
   * How Bankrupt works.
   * trap (the creator's rule): Bankrupt is never held or played. The player who
   *   DRAWS it loses their own bank unless they play Vault Lock.
   * attack (offered as the "Bankrupt Attack" mode): Bankrupt goes to the hand
   *   and is played on an opponent, who can block with Vault Lock.
   */
  bankruptMode: 'trap' | 'attack';
  /** §25 #2 — smallest set of matching money that can be banked. 1 allows single cards. */
  minBankSetSize: 1 | 2;
  /**
   * §25 #4 — what an unblocked Bank Thief takes.
   * chosen_card: the thief picks one visible card.
   * random_card: one random card.
   * matching_group: the thief picks a denomination and takes every card of it.
   */
  thiefSteals: 'chosen_card' | 'random_card' | 'matching_group';
  /**
   * false (the creator's rule): a player may always discard one card as their
   * turn, even when they could bank or attack. true: only when nothing else is legal.
   */
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
  /**
   * Copies of Vault Lock and of Sheriff used in a 2-player game, counted against
   * the basic six (the rest stay in the box). Scales up with a bigger deck.
   */
  twoPlayerDefenseCopies: number;
  /**
   * fixed: always the basic 80-card deck.
   * by_players: 2 players use 1.5×, 3 players 2× and 4 players 2.5× the money,
   *   Vault Lock, Bank Thief and Sheriff cards (still six Bankrupt), so games
   *   last about 14–16 rounds at every table size with ten-card hands.
   */
  deckScale: 'fixed' | 'by_players';
  /**
   * true: a player who uses a Vault Lock or Sheriff out of turn draws back up to
   *   a full hand straight away. false: they wait until the end of their own turn.
   */
  refillAfterDefense: boolean;
  /**
   * Bank Swap cards in the basic deck (0 = none; scaled up with the deck). Played
   * on another player to trade whole banks. The same number of Lawyer cards is
   * added; a Lawyer is the only card that stops a Bank Swap.
   */
  bankSwapCards: number;
  /** Power-up shop: spend banked money on one power-up at the start of your turn. */
  shop: boolean;
  /** Cards each player is dealt and refills to. The game uses HAND_SIZE (ten); the basic rules object keeps six. */
  handSize: number;
};

export const DEFAULT_RULES: RuleConfig = {
  bankruptMode: 'trap',
  minBankSetSize: 2,
  thiefSteals: 'chosen_card',
  discardOnlyWhenStuck: false,
  endTrigger: 'immediate',
  allowDeclineDefense: true,
  turnStyle: 'one_action',
  bankruptDestroys: 'all',
  stuckDiscardLimit: 1,
  twoPlayerDefenseCopies: 6,
  deckScale: 'fixed',
  refillAfterDefense: true,
  bankSwapCards: 0,
  shop: false,
  handSize: 6,
};

/**
 * The three rule sets offered on the setup screen.
 * original: the creator's game. Whoever draws Bankrupt loses their own bank
 *   unless they play Vault Lock, and the game ends the moment the sixth is drawn.
 * piggy: the same game with a softer landing, chosen from simulated play —
 *   1. a bankrupted player keeps their smallest pile (far fewer $0 finishes);
 *   2. after the sixth Bankrupt everyone gets one last turn;
 *   3. a 2-player game uses 4 Vault Locks and 4 Sheriffs (fewer dead turns).
 * All three use a deck that grows with the number of players (deckScale).
 * attack: Bankrupt goes into your hand when you draw it and you play it on
 *   another player, who can block with Vault Lock. After the sixth Bankrupt is
 *   drawn everyone gets one last turn, so the last ones can still be played.
 */
/** Every rule set deals ten cards and refills to ten (the creator's rule; it was six at first). */
export const HAND_SIZE = 10;

const TABLE_RULES: RuleConfig = { ...DEFAULT_RULES, deckScale: 'by_players', handSize: HAND_SIZE };

export const RULE_SETS = {
  original: TABLE_RULES,
  piggy: {
    ...TABLE_RULES,
    bankruptDestroys: 'all_but_smallest_pile',
    endTrigger: 'final_circuit',
    twoPlayerDefenseCopies: 4,
  },
  attack: { ...TABLE_RULES, bankruptMode: 'attack', endTrigger: 'final_circuit' },
} as const satisfies Record<string, RuleConfig>;

export type RuleSetId = keyof typeof RULE_SETS;

/** Optional extras that can be added to any rule set. */
export type Extras = { shop: boolean; bankSwap: boolean };

export const DEFAULT_EXTRAS: Extras = { shop: true, bankSwap: true };

/** Bank Swap cards (and, separately, Lawyer cards) in the basic deck when that extra is on. */
export const BANK_SWAP_CARDS = 2;

export function rulesFor(ruleSet: RuleSetId, extras: Extras): RuleConfig {
  return { ...RULE_SETS[ruleSet], shop: extras.shop, bankSwapCards: extras.bankSwap ? BANK_SWAP_CARDS : 0 };
}
