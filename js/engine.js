// Stockfish wrapper: runs the engine in a Web Worker and speaks UCI to it.
// Tries the fast WebAssembly build first, then falls back to a pure-JavaScript build.

const ENGINES = [
  {
    name: 'Stockfish 19 (lite)',
    url: 'vendor/stockfish/stockfish-19-lite-single.js',
    depth: 14,
    multipv: 4,
    needsWasm: true,
  },
  {
    name: 'Stockfish 10 (compatibility mode)',
    url: 'vendor/stockfish/stockfish-10-asm.js',
    depth: 10,
    multipv: 4,
  },
];

function parseInfo(line) {
  const t = line.split(' ');
  const info = { multipv: 1 };
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        info.depth = +t[++i];
        break;
      case 'multipv':
        info.multipv = +t[++i];
        break;
      case 'score': {
        const kind = t[++i];
        const v = +t[++i];
        info.score = kind === 'mate' ? { mate: v } : { cp: v };
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') {
          info.bound = true;
          i++;
        }
        break;
      }
      case 'pv':
        info.pv = t.slice(i + 1);
        i = t.length;
        break;
      case 'string':
        i = t.length;
        break;
      case 'seldepth':
      case 'nodes':
      case 'nps':
      case 'hashfull':
      case 'tbhits':
      case 'time':
      case 'currmove':
      case 'currmovenumber':
      case 'cpuload':
        i++;
        break;
      default:
        break;
    }
  }
  return info;
}

export class Engine {
  constructor() {
    this.worker = null;
    this.spec = null;
    // Analyses queue up until the engine is ready.
    this.queue = new Promise((resolve) => (this._ready = resolve));
    this.cache = new Map();
    this.onLine = null;
    this.multipvSet = 0;
    this.timings = [];
  }

  async init() {
    let lastErr;
    for (const spec of ENGINES) {
      if (spec.needsWasm && typeof WebAssembly !== 'object') continue;
      try {
        await this._start(spec);
        this.spec = { ...spec };
        this._ready();
        return this.spec;
      } catch (e) {
        lastErr = e;
        console.warn(`Engine ${spec.name} failed to start:`, e);
        this._kill();
      }
    }
    throw lastErr || new Error('No chess engine could be started in this browser.');
  }

  _kill() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
  }

  _start(spec) {
    return new Promise((resolve, reject) => {
      let w;
      try {
        w = new Worker(spec.url);
      } catch (e) {
        reject(e);
        return;
      }
      this.worker = w;
      const timer = setTimeout(() => reject(new Error('Engine start timed out')), 20000);
      w.onerror = (e) => {
        clearTimeout(timer);
        reject(new Error(e.message || 'Engine worker error'));
      };
      w.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : String(e.data);
        if (line === 'uciok') {
          w.postMessage('setoption name Hash value 32');
          w.postMessage('isready');
        } else if (line === 'readyok' && !this.spec) {
          clearTimeout(timer);
          w.onmessage = (ev) => this.onLine && this.onLine(String(ev.data));
          resolve();
        }
      };
      w.postMessage('uci');
    });
  }

  _send(cmd) {
    this.worker.postMessage(cmd);
  }

  newGame() {
    this.queue = this.queue.then(
      () =>
        new Promise((resolve) => {
          this.onLine = (line) => {
            if (line === 'readyok') resolve();
          };
          this._send('ucinewgame');
          this._send('isready');
        }),
    );
    return this.queue;
  }

  /**
   * Analyses a position. Scores are from the side to move's point of view.
   * @returns {Promise<{fen, depth, lines: Array<{multipv, uci, pv, score}>}>}
   */
  analyze(fen, opts = {}) {
    const key = `${fen}|${opts.depth || 'd'}|${opts.multipv || 'm'}`;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.cache.size > 3000) this.cache.delete(this.cache.keys().next().value);
    const job = this.queue.then(
      () =>
        new Promise((resolve) => {
          const depth = opts.depth || this.spec.depth;
          const multipv = opts.multipv || this.spec.multipv;
          const started = performance.now();
          const lines = new Map();
          let maxDepth = 0;
          this.onLine = (line) => {
            if (line.startsWith('info ') && line.includes(' pv ')) {
              const info = parseInfo(line);
              if (info.depth && info.score && info.pv && info.pv.length && !info.bound) {
                lines.set(info.multipv, { multipv: info.multipv, uci: info.pv[0], pv: info.pv, score: info.score, depth: info.depth });
                maxDepth = Math.max(maxDepth, info.depth);
              }
            } else if (line.startsWith('bestmove')) {
              const best = line.split(' ')[1];
              const sorted = [...lines.values()].sort((a, b) => a.multipv - b.multipv);
              if (best && best !== '(none)' && sorted.length && sorted[0].uci !== best) {
                // Keep the engine's final choice on top.
                const idx = sorted.findIndex((l) => l.uci === best);
                if (idx > 0) sorted.unshift(sorted.splice(idx, 1)[0]);
              }
              this._adapt(performance.now() - started, opts.depth);
              resolve({ fen, depth: maxDepth, lines: best === '(none)' ? [] : sorted });
            }
          };
          if (this.multipvSet !== multipv) {
            this._send(`setoption name MultiPV value ${multipv}`);
            this.multipvSet = multipv;
          }
          this._send(`position fen ${fen}`);
          this._send(`go depth ${depth} movetime ${opts.movetime || 4000}`);
        }),
    );
    this.queue = job.catch(() => {});
    this.cache.set(key, job);
    return job;
  }

  /** On slow devices (older phones), search a little less deeply so the app stays snappy. */
  _adapt(ms, explicitDepth) {
    if (explicitDepth) return;
    this.timings.push(ms);
    if (this.timings.length < 4) return;
    const recent = this.timings.slice(-4).sort((a, b) => a - b);
    const median = (recent[1] + recent[2]) / 2;
    if (median > 1800 && this.spec.depth > 10) {
      this.spec.depth -= 2;
      this.timings = [];
    }
  }
}
