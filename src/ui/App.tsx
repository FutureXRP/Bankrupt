import { useCallback, useEffect, useState } from 'react';
import { RULE_SETS, createGame, randomSeed, type GameState, type RuleSetId, type SeatConfig } from '../engine';
import { Game } from './Game';
import { Friends, codeFromAddress } from './Online';
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

type Screen = 'menu' | 'setup' | 'game' | 'howto' | 'settings' | 'credits' | 'friends';

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
  const [game, setGame] = useState<{ key: number; state: GameState } | null>(null);
  const [saved, setSaved] = useState<SavedGame | null>(loadSavedGame);

  useEffect(() => {
    document.documentElement.dataset.text = settings.textSize;
    document.documentElement.dataset.motion = settings.motion;
    saveSettings(settings);
  }, [settings]);

  const start = (nextSeats: SeatConfig[], nextRules: RuleSetId = ruleSet) => {
    setSeats(nextSeats);
    setRuleSet(nextRules);
    const state = createGame({ players: nextSeats, seed: randomSeed(), rules: RULE_SETS[nextRules] });
    setGame({ key: Date.now(), state });
    setScreen('game');
  };

  const resume = () => {
    if (!saved) return;
    setSeats(saved.seats);
    setRuleSet(saved.ruleSet);
    setGame({ key: Date.now(), state: saved.state });
    setScreen('game');
  };

  const toMenu = () => {
    setSaved(loadSavedGame());
    setScreen('menu');
  };

  // Only solo games are saved: a pass-and-play save would expose hands on reload.
  const onStateChange = useCallback(
    (state: GameState) => {
      if (seats.filter((s) => !s.isAI).length !== 1) return;
      if (state.phase === 'finished') clearSavedGame();
      else saveGame({ seats, ruleSet, state });
    },
    [seats, ruleSet],
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
          onPlayAgain={() => start(seats)}
          onStateChange={onStateChange}
        />
      ) : null;
    case 'setup':
      return <Setup initialSeats={seats} initialRuleSet={ruleSet} onStart={start} onBack={toMenu} />;
    case 'howto':
      return (
        <HowToPlay
          onBack={toMenu}
          onPractice={() =>
            start(
              [
                { name: 'Player 1', isAI: false },
                { name: 'Penny', isAI: true, difficulty: 'casual' },
                { name: 'Buck', isAI: true, difficulty: 'casual' },
              ],
              'original',
            )
          }
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
          onNavigate={setScreen}
        />
      );
  }
}
