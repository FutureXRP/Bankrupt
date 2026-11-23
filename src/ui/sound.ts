// Tiny synthesized sound effects — no audio files. Sound is never needed to
// follow the game; every event is also shown on screen and in the log.

import type { LogKind } from '../engine';

let context: AudioContext | null = null;

function tone(ctx: AudioContext, freq: number, at: number, length: number, type: OscillatorType, gain: number) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + at);
  amp.gain.setValueAtTime(0.0001, ctx.currentTime + at);
  amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + at + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + length);
  osc.connect(amp).connect(ctx.destination);
  osc.start(ctx.currentTime + at);
  osc.stop(ctx.currentTime + at + length + 0.05);
}

const TUNES: Partial<Record<LogKind, [number, number, number, OscillatorType][]>> = {
  bank: [[880, 0, 0.12, 'triangle'], [1320, 0.09, 0.2, 'triangle']],
  thief: [[520, 0, 0.1, 'square'], [390, 0.1, 0.1, 'square'], [290, 0.2, 0.22, 'square']],
  bankrupt: [[220, 0, 0.22, 'sawtooth'], [165, 0.22, 0.22, 'sawtooth'], [110, 0.44, 0.5, 'sawtooth']],
  block: [[300, 0, 0.07, 'square'], [900, 0.07, 0.25, 'triangle']],
  attack: [[440, 0, 0.1, 'square'], [440, 0.15, 0.1, 'square']],
  final: [[523, 0, 0.15, 'triangle'], [659, 0.15, 0.15, 'triangle'], [784, 0.3, 0.35, 'triangle']],
  end: [[523, 0, 0.14, 'triangle'], [659, 0.14, 0.14, 'triangle'], [784, 0.28, 0.14, 'triangle'], [1047, 0.42, 0.5, 'triangle']],
  discard: [[240, 0, 0.08, 'triangle']],
  shop: [[660, 0, 0.08, 'triangle'], [990, 0.08, 0.08, 'triangle'], [1320, 0.16, 0.18, 'triangle']],
};

export function playSound(kind: LogKind, volume: number) {
  const tune = TUNES[kind];
  if (!tune || volume <= 0) return;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    for (const [freq, at, length, type] of tune) tone(context, freq, at, length, type, 0.25 * volume);
  } catch {
    // Audio is optional.
  }
}
