// Settings and the unfinished solo game are kept in the browser's local storage.

import {
  checkInvariants,
  type Extras,
  type GameState,
  type MatchState,
  type RuleSetId,
  type SeatConfig,
} from '../engine';

export type Settings = {
  aiSpeed: 'fast' | 'normal' | 'slow';
  sound: boolean;
  volume: number; // 0–1
  motion: 'system' | 'reduced' | 'full';
  textSize: 'normal' | 'large' | 'xl';
};

export const DEFAULT_SETTINGS: Settings = {
  aiSpeed: 'normal',
  sound: true,
  volume: 0.6,
  motion: 'system',
  textSize: 'normal',
};

export type SavedGame = {
  seats: SeatConfig[];
  ruleSet: RuleSetId;
  extras: Extras;
  match: MatchState;
  state: GameState;
};

const SETTINGS_KEY = 'bankrupt.settings.v1';
const SAVE_KEY = 'bankrupt.save.v4';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private windows); the game still works without it.
  }
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
}

export function saveSettings(settings: Settings) {
  write(SETTINGS_KEY, settings);
}

/** Returns the saved game only if it is still a valid, unfinished game. */
export function loadSavedGame(): SavedGame | null {
  const saved = read<SavedGame>(SAVE_KEY);
  try {
    if (!saved || saved.state.phase === 'finished' || checkInvariants(saved.state).length > 0) return null;
    return saved;
  } catch {
    return null;
  }
}

export function saveGame(game: SavedGame) {
  write(SAVE_KEY, game);
}

export function clearSavedGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
