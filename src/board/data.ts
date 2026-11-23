// BANKRUPT: BOOMTOWN — the board, the cards and the numbers.
// An original roll-and-move game built on the Bankrupt card game's idea: cash
// is exposed (it can be stolen, swapped or bankrupted), while what you own is safe.

export type Service = 'deputy' | 'lawyer' | 'vault';
export type AttackCardKind = 'bankrupt' | 'bank_thief' | 'bank_swap';
export type ActionCardKind = AttackCardKind | 'windfall';
export type District = 'green' | 'blue' | 'purple' | 'gold';

export type Space =
  | { index: number; kind: 'start'; name: string; icon: string }
  | { index: number; kind: 'business'; name: string; icon: string; price: number; rent: number; district: District }
  | { index: number; kind: 'service'; name: string; icon: string; price: number; service: Service }
  | { index: number; kind: 'card'; name: string; icon: string }
  | { index: number; kind: 'tax'; name: string; icon: string; amount: number }
  | { index: number; kind: 'bonus'; name: string; icon: string; amount: number }
  | { index: number; kind: 'park'; name: string; icon: string };

export const START_CASH = 500;
/** Going later means last pick of the board, so each seat after the first starts with this much more. */
export const LATE_START_BONUS = 50;
export const PAYDAY = 200; // collected each time you pass or land on START
export const THIEF_AMOUNT = 150;
export const HAND_LIMIT = 5;
export const MAX_PROTECTORS = 2; // of each kind
export const BANKRUPT_CARDS = 6;
export const MAX_ROUNDS = 25; // the bank closes: the final round starts even if Bankrupt cards are still held
export const BUILDING_PRICE = 400;

/** What each protector is, what it stops, and what one costs to hire. */
export const SERVICES: Record<Service, { name: string; plural: string; icon: string; price: number; blocks: AttackCardKind; building: string }> = {
  deputy: { name: 'Deputy', plural: 'Deputies', icon: '⭐', price: 100, blocks: 'bank_thief', building: "Sheriff's Station" },
  lawyer: { name: 'Lawyer', plural: 'Lawyers', icon: '⚖️', price: 100, blocks: 'bank_swap', building: 'Law Firm' },
  vault: { name: 'Vault Lock', plural: 'Vault Locks', icon: '🔒', price: 150, blocks: 'bankrupt', building: 'Vault Works' },
};

export const SERVICE_FOR: Record<AttackCardKind, Service> = { bank_thief: 'deputy', bank_swap: 'lawyer', bankrupt: 'vault' };

export const ATTACK_NAMES: Record<AttackCardKind, string> = {
  bankrupt: 'Bankrupt',
  bank_thief: 'Bank Thief',
  bank_swap: 'Bank Swap',
};

const business = (index: number, name: string, icon: string, price: number, district: District): Space => ({
  index,
  kind: 'business',
  name,
  icon,
  price,
  rent: Math.round((price * 0.4) / 10) * 10,
  district,
});
const service = (index: number, s: Service, icon: string): Space => ({
  index,
  kind: 'service',
  name: SERVICES[s].building,
  icon,
  price: BUILDING_PRICE,
  service: s,
});
const card = (index: number): Space => ({ index, kind: 'card', name: 'Draw a Card', icon: '🃏' });

/** The 24 spaces, clockwise from START. Corners are 0, 6, 12 and 18. */
export const BOARD: readonly Space[] = [
  { index: 0, kind: 'start', name: 'START', icon: '🏁' },
  business(1, 'Lemonade Stand', '🍋', 100, 'green'),
  card(2),
  business(3, 'Ice Cream Shop', '🍦', 120, 'green'),
  business(4, 'Candy Store', '🍬', 140, 'green'),
  { index: 5, kind: 'tax', name: 'Town Tax', icon: '🧾', amount: 50 },
  service(6, 'deputy', '⭐'),
  business(7, 'Pet Shop', '🐶', 180, 'blue'),
  card(8),
  business(9, 'Toy Store', '🧸', 200, 'blue'),
  business(10, 'Bike Shop', '🚲', 220, 'blue'),
  { index: 11, kind: 'bonus', name: 'Lucky Day', icon: '🍀', amount: 100 },
  service(12, 'lawyer', '⚖️'),
  business(13, 'Arcade', '🕹️', 260, 'purple'),
  card(14),
  business(15, 'Pizza Place', '🍕', 280, 'purple'),
  business(16, 'Movie Theater', '🎬', 300, 'purple'),
  { index: 17, kind: 'tax', name: 'Town Tax', icon: '🧾', amount: 100 },
  service(18, 'vault', '🔒'),
  business(19, 'Water Park', '💦', 350, 'gold'),
  card(20),
  business(21, 'Toy Factory', '🏭', 380, 'gold'),
  business(22, 'Theme Park', '🎢', 400, 'gold'),
  { index: 23, kind: 'park', name: 'Town Park', icon: '🌳' },
];

export const BOARD_SIZE = BOARD.length;

export const serviceSpace = (s: Service) => BOARD.find((space) => space.kind === 'service' && space.service === s)! as Extract<Space, { kind: 'service' }>;

export type ActionCard = { id: string; kind: ActionCardKind; amount?: number };

/**
 * The action deck. Six Bankrupt cards, always. The rest grows with the table so
 * the game lasts about as long for 2, 3 or 4 players. Bankrupt cards leave the
 * game when played; everything else is reshuffled when the deck runs out.
 */
export function buildActionDeck(playerCount: number): ActionCard[] {
  const deck: ActionCard[] = [];
  const add = (kind: ActionCardKind, count: number, amount?: number) => {
    const have = deck.filter((c) => c.kind === kind).length;
    for (let i = 1; i <= count; i++) deck.push({ id: `${kind}-${have + i}`, kind, amount });
  };
  add('bankrupt', BANKRUPT_CARDS);
  add('bank_thief', 2 + 3 * playerCount);
  add('bank_swap', 1 + playerCount);
  add('windfall', 2 * playerCount, 100);
  add('windfall', 1 + playerCount, 150);
  add('windfall', playerCount, 200);
  return deck;
}
