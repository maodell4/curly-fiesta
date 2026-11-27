// Saves your progress (games, rating history, settings) in this browser's localStorage.

const KEY = 'chess-coach.profile.v1';

export const DEFAULT_SETTINGS = {
  playAs: 'w', // 'w' | 'b' | 'random'
  opponent: 'adaptive', // 'adaptive' | 'fixed'
  fixedElo: 800,
  challenge: 0, // -150 easier, 0 even, +150 harder
  warnings: 'auto', // 'auto' | 'always' | 'off'
  evalBar: true,
};

function blank() {
  return { version: 1, games: [], settings: { ...DEFAULT_SETTINGS } };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const p = JSON.parse(raw);
    return { ...blank(), ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings || {}) } };
  } catch {
    return blank();
  }
}

export function save(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function reset() {
  const p = blank();
  save(p);
  return p;
}
