// Saves your progress: settings, rating history, full games for review, lesson progress.
//
// Data is always kept in this browser (localStorage). When the app runs as a claude.ai
// artifact and you're signed in, it is also saved privately to your Claude account, so
// it follows you between your phone and computer. Nobody else (not even the artifact's
// owner) can read that private space.

const KEY = 'chess-coach.profile.v1';
const GAMES_KEY = 'chess-coach.games.v1';
const LOCAL_GAMES = 25; // full games kept in browser storage
const CLOUD_GAMES = 100; // full games kept in your account

export const DEFAULT_SETTINGS = {
  playAs: 'w',
  opponent: 'adaptive',
  fixedElo: 800,
  challenge: 0,
  warnings: 'auto',
  evalBar: true,
  explainOpponent: true,
};

function blank() {
  return { version: 2, updatedAt: 0, games: [], lessons: {}, mistakesSolved: {}, settings: { ...DEFAULT_SETTINGS } };
}

function normalize(p) {
  const b = blank();
  return {
    ...b,
    ...p,
    settings: { ...DEFAULT_SETTINGS, ...(p?.settings || {}) },
    lessons: { ...(p?.lessons || {}) },
    mistakesSolved: { ...(p?.mistakesSolved || {}) },
    games: Array.isArray(p?.games) ? p.games : [],
  };
}

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

let profile = normalize(readLocal(KEY, null));
let archive = readLocal(GAMES_KEY, []);
if (!Array.isArray(archive)) archive = [];
let cloud = null; // {root}
let writeChain = Promise.resolve();
const listeners = new Set();

export const status = { cloud: false, checking: false };

export function onChange(fn) {
  listeners.add(fn);
}
function emit() {
  for (const fn of listeners) fn();
}

export function load() {
  return profile;
}

export function games() {
  return archive;
}

export function gameById(id) {
  return archive.find((g) => g.id === id) || null;
}

function queue(fn) {
  writeChain = writeChain.then(fn).catch((e) => console.warn('Cloud save failed:', e?.code || e));
  return writeChain;
}

export function save(p = profile) {
  profile = p;
  profile.updatedAt = Date.now();
  if (profile.games.length > 300) profile.games.splice(0, profile.games.length - 300);
  writeLocal(KEY, profile);
  if (cloud) {
    const body = JSON.parse(JSON.stringify(profile));
    queue(() => cloud.root.set(body));
  }
  return true;
}

export function addGame(record) {
  archive = [record, ...archive.filter((g) => g.id !== record.id)];
  writeLocal(GAMES_KEY, archive.slice(0, LOCAL_GAMES));
  if (cloud) {
    const body = JSON.parse(JSON.stringify(record));
    queue(() => cloud.root.collection('games').doc(record.id).set(body));
    const stale = archive.slice(CLOUD_GAMES);
    for (const g of stale) queue(() => cloud.root.collection('games').doc(g.id).delete());
    archive = archive.slice(0, CLOUD_GAMES);
  }
}

export function deleteGame(id) {
  archive = archive.filter((g) => g.id !== id);
  writeLocal(GAMES_KEY, archive.slice(0, LOCAL_GAMES));
  if (cloud) queue(() => cloud.root.collection('games').doc(id).delete());
}

export function reset() {
  const old = archive;
  profile = blank();
  archive = [];
  writeLocal(KEY, profile);
  writeLocal(GAMES_KEY, []);
  if (cloud) {
    queue(() => cloud.root.set(JSON.parse(JSON.stringify(profile))));
    for (const g of old) queue(() => cloud.root.collection('games').doc(g.id).delete());
  }
  return profile;
}

/** Connects to your Claude account's private storage when available. Never throws. */
export async function connectCloud() {
  const claude = typeof window !== 'undefined' ? window.claude : null;
  if (!claude?.use) return false;
  status.checking = true;
  try {
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    if (!db || !user) return false;
    const uid = await user.id();
    if (!uid) return false;
    const root = db.doc(`data/users/${uid}/profile`);
    const snap = await root.get();
    const remote = snap.exists ? normalize(snap.data()) : null;
    const gamesSnap = await root.collection('games').orderBy('date', 'desc').limit(CLOUD_GAMES).get();
    const remoteGames = gamesSnap.docs.map((d) => d.data()).filter(Boolean);
    cloud = { root };
    status.cloud = true;

    // Merge: the newer profile wins; games are merged by id.
    if (remote && remote.updatedAt >= profile.updatedAt) {
      profile = remote;
      writeLocal(KEY, profile);
    } else {
      save(profile);
    }
    const byId = new Map(remoteGames.map((g) => [g.id, g]));
    for (const g of archive) {
      if (!byId.has(g.id)) {
        byId.set(g.id, g);
        const body = JSON.parse(JSON.stringify(g));
        queue(() => root.collection('games').doc(g.id).set(body));
      }
    }
    archive = [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, CLOUD_GAMES);
    writeLocal(GAMES_KEY, archive.slice(0, LOCAL_GAMES));
    emit();
    return true;
  } catch (e) {
    console.warn('Account storage unavailable, using this browser only:', e?.code || e);
    cloud = null;
    status.cloud = false;
    return false;
  } finally {
    status.checking = false;
  }
}
