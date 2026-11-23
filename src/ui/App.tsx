import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_EXTRAS,
  createGame,
  dealerForRound,
  matchWinnerIds,
  newMatch,
  recordRound,
  startingCashFor,
  randomSeed,
  rulesFor,
  type Extras,
  type GameState,
  type MatchState,
  type RuleSetId,
  type SeatConfig,
} from '../engine';
import { Game } from './Game';
import { Friends, codeFromAddress } from './Online';
import { Boomtown } from './Boomtown';
import { Tutorial, tutorialDone } from './Tutorial';
import { Credits, HowToPlay, Menu, SettingsScreen, Setup } from './Screens';
import {
  clearSavedGame,
  loadSavedGame,
  loadSettings,
  saveGame,
  saveSettings,
  type SavedGame,
  type Settings,
} from './storage';

type Screen = 'menu' | 'setup' | 'game' | 'howto' | 'settings' | 'credits' | 'friends' | 'tutorial' | 'board';

const DEFAULT_SEATS: SeatConfig[] = [
  { name: 'Player 1', isAI: false },
  { name: 'Penny', isAI: true, difficulty: 'casual' },
  { name: 'Buck', isAI: true, difficulty: 'casual' },
];

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  // An invite link (…?join=CODE) opens straight on the join screen.
  const [inviteCode] = useState(codeFromAddress);
  const [screen, setScreen] = useState<Screen>(inviteCode ? 'friends' : 'menu');
  const [seats, setSeats] = useState<SeatConfig[]>(DEFAULT_SEATS);
  const [ruleSet, setRuleSet] = useState<RuleSetId>('original');
  const [extras, setExtras] = useState<Extras>(DEFAULT_EXTRAS);
  const [match, setMatch] = useState<MatchState>(() => newMatch(1));
  const [game, setGame] = useState<{ key: number; state: GameState } | null>(null);
  const [saved, setSaved] = useState<SavedGame | null>(loadSavedGame);

  useEffect(() => {
    document.documentElement.dataset.text = settings.textSize;
    document.documentElement.dataset.motion = settings.motion;
    saveSettings(settings);
  }, [settings]);

  const deal = (nextSeats: SeatConfig[], nextRules: RuleSetId, nextExtras: Extras, nextMatch: MatchState) => {
    const state = createGame({
      players: nextSeats,
      seed: randomSeed(),
      rules: rulesFor(nextRules, nextExtras),
      dealerIndex: dealerForRound(nextMatch, nextSeats.length),
      startingCash: startingCashFor(nextMatch, nextSeats.map((_, i) => `p${i + 1}`)),
    });
    setMatch(nextMatch);
    setGame({ key: Date.now(), state });
    setScreen('game');
  };

  /** Start a brand-new game or match. */
  const start = (
    nextSeats: SeatConfig[],
    nextRules: RuleSetId = ruleSet,
    nextExtras: Extras = extras,
    target: number = match.target,
    carryOver: boolean = match.carryOver,
  ) => {
    setSeats(nextSeats);
    setRuleSet(nextRules);
    setExtras(nextExtras);
    deal(nextSeats, nextRules, nextExtras, newMatch(target, Math.floor(Math.random() * nextSeats.length), carryOver));
  };

  /** After a finished round: deal the next round, or a fresh match if this one is over. */
  const playOn = (finished: GameState) => {
    const after = recordRound(match, finished);
    if (matchWinnerIds(after)) start(seats);
    else deal(seats, ruleSet, extras, after);
  };

  /** A gentle first real game: the original rules against two easy computer players. */
  const practice = () =>
    start(
      [
        { name: 'Player 1', isAI: false },
        { name: 'Penny', isAI: true, difficulty: 'casual' },
        { name: 'Buck', isAI: true, difficulty: 'casual' },
      ],
      'original',
      extras,
      1,
      false,
    );

  const resume = () => {
    if (!saved) return;
    setSeats(saved.seats);
    setRuleSet(saved.ruleSet);
    setExtras(saved.extras);
    setMatch(saved.match);
    setGame({ key: Date.now(), state: saved.state });
    setScreen('game');
  };

  const toMenu = () => {
    setSaved(loadSavedGame());
    setScreen('menu');
  };

  // Every local game is saved as it goes, so a refresh, a phone call or the browser being
  // closed does not lose it. (A resumed pass-and-play game opens on the "pass to…" screen.)
  const onStateChange = useCallback(
    (state: GameState) => {
      if (state.phase === 'finished') clearSavedGame();
      else saveGame({ seats, ruleSet, extras, match, state });
    },
    [seats, ruleSet, extras, match],
  );

  switch (screen) {
    case 'game':
      return game ? (
        <Game
          key={game.key}
          initialState={game.state}
          settings={settings}
          onToggleSound={() => setSettings((s) => ({ ...s, sound: !s.sound }))}
          onExit={toMenu}
          onPlayAgain={playOn}
          match={match}
          onStateChange={onStateChange}
        />
      ) : null;
    case 'setup':
      return <Setup initialSeats={seats} initialRuleSet={ruleSet} initialExtras={extras} initialTarget={match.target} initialCarryOver={match.carryOver} onStart={start} onBack={toMenu} />;
    case 'howto':
      return <HowToPlay onBack={toMenu} onPractice={practice} onTutorial={() => setScreen('tutorial')} />;
    case 'board':
      return (
        <Boomtown
          settings={settings}
          onToggleSound={() => setSettings((current) => ({ ...current, sound: !current.sound }))}
          onExit={toMenu}
        />
      );
    case 'tutorial':
      return (
        <Tutorial
          settings={settings}
          onToggleSound={() => setSettings((current) => ({ ...current, sound: !current.sound }))}
          onExit={toMenu}
          onPlay={practice}
        />
      );
    case 'settings':
      return <SettingsScreen settings={settings} onChange={setSettings} onBack={toMenu} />;
    case 'credits':
      return <Credits onBack={toMenu} />;
    case 'friends':
      return (
        <Friends
          settings={settings}
          onToggleSound={() => setSettings((s) => ({ ...s, sound: !s.sound }))}
          onExit={toMenu}
          initialCode={inviteCode}
        />
      );
    default:
      return (
        <Menu
          hasSave={!!saved}
          onContinue={resume}
          onSolo={() => {
            setSeats((current) => current.map((s, i) => (i === 0 ? { ...s, isAI: false } : { ...s, isAI: true, difficulty: s.difficulty ?? 'casual' })));
            setScreen('setup');
          }}
          onLocal={() => {
            setSeats((current) => current.map((s, i) => (i < 2 ? { name: s.isAI ? `Player ${i + 1}` : s.name, isAI: false } : s)));
            setScreen('setup');
          }}
          onFriends={() => setScreen('friends')}
          onBoard={() => setScreen('board')}
          onTutorial={() => setScreen('tutorial')}
          isNew={!tutorialDone()}
          onNavigate={setScreen}
        />
      );
  }
}
