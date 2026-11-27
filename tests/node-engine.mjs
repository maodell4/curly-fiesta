// Runs the vendored Stockfish build under Node (for offline checks such as verify-lessons).
import { createRequire } from 'node:module';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const VENDOR = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'stockfish');

export async function createEngine() {
  // The package is ESM ("type": "module"), so copy the CommonJS engine to a .cjs file.
  const dir = mkdtempSync(join(tmpdir(), 'sf-'));
  copyFileSync(join(VENDOR, 'stockfish-19-lite-single.js'), join(dir, 'stockfish-19-lite-single.cjs'));
  copyFileSync(join(VENDOR, 'stockfish-19-lite-single.wasm'), join(dir, 'stockfish-19-lite-single.wasm'));
  const require = createRequire(import.meta.url);
  let listener = null;
  const engine = require(join(dir, 'stockfish-19-lite-single.cjs'))();
  engine.listener = (line) => listener && listener(line);
  const send = (c) => engine.processCommand(c);
  const until = (pred, cmds) =>
    new Promise((res) => {
      listener = (l) => pred(l) && res(l);
      cmds.forEach(send);
    });
  await until((l) => l === 'uciok', ['uci']);
  await until((l) => l === 'readyok', ['setoption name Hash value 32', 'isready']);
  let mpv = 0;

  async function analyze(fen, { depth = 16, multipv = 3 } = {}) {
    const lines = new Map();
    if (mpv !== multipv) {
      send(`setoption name MultiPV value ${multipv}`);
      mpv = multipv;
    }
    await until((l) => {
      if (l.startsWith('info ') && l.includes(' pv ') && !l.includes('bound')) {
        const t = l.split(' ');
        const at = (k) => t[t.indexOf(k) + 1];
        const kind = at('score');
        const v = +t[t.indexOf('score') + 2];
        lines.set(+at('multipv') || 1, { uci: at('pv'), pv: t.slice(t.indexOf('pv') + 1), score: kind === 'mate' ? { mate: v } : { cp: v } });
      }
      return l.startsWith('bestmove');
    }, [`position fen ${fen}`, `go depth ${depth}`]);
    return { fen, lines: [...lines.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]) };
  }
  return { analyze, quit: () => send('quit') };
}
