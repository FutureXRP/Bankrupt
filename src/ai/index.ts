// AI entry points. Difficulty changes decision quality only — never the cards
// dealt and never what the AI is allowed to see (spec §14 fairness guarantee).

import { DEFENSE_FOR, type Action, type Difficulty, type PlayerView } from '../engine';
import { casualChoice } from './casual';
import { bestSteal, pick, toAction, type Rand } from './common';
import { competitiveChoice } from './competitive';
import { expertChoice } from './expert';

export type { Rand } from './common';

/** The AI's move on its own turn. */
export function chooseAction(view: PlayerView, difficulty: Difficulty, rand: Rand): Action {
  const option =
    difficulty === 'expert'
      ? expertChoice(view, rand)
      : difficulty === 'competitive'
        ? competitiveChoice(view, rand)
        : casualChoice(view, rand);
  return toAction(view, option);
}

/** Reaction policy (spec §14): if the matching defense is in hand, block. */
export function chooseDefense(view: PlayerView): Action {
  const pending = view.pendingAttack!;
  const card = view.hand.find((c) => c.kind === DEFENSE_FOR[pending.kind]);
  return { type: 'defend', playerId: view.selfId, cardId: card ? card.id : null };
}

/** Which banked card the AI's thief takes. Casual sometimes grabs at random. */
export function chooseSteal(view: PlayerView, difficulty: Difficulty, rand: Rand): Action {
  const target = view.players.find((p) => p.id === view.pendingAttack!.targetId)!;
  const cardId =
    difficulty === 'casual' && rand() < 0.3 ? pick(target.bank, rand).id : bestSteal(target.bank, view).cardId;
  return { type: 'steal', playerId: view.selfId, cardId };
}

/** Whatever decision the view's owner currently owes the game. */
export function chooseForPhase(view: PlayerView, difficulty: Difficulty, rand: Rand): Action {
  if (view.phase === 'reaction') return chooseDefense(view);
  if (view.phase === 'theft_selection') return chooseSteal(view, difficulty, rand);
  return chooseAction(view, difficulty, rand);
}
