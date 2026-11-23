// Small seeded random generator (mulberry32) so shuffles are repeatable in tests.

export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/** Fisher–Yates shuffle. Returns a new array and the advanced generator state. */
export function shuffled<T>(items: readonly T[], rngState: number): { items: T[]; rngState: number } {
  const out = [...items];
  let state = rngState;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextRandom(state);
    state = r.state;
    const j = Math.floor(r.value * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { items: out, rngState: state };
}

/** A stateful generator for callers that just want numbers (the AI). */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    const r = nextRandom(state);
    state = r.state;
    return r.value;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
