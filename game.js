/** @typedef {0 | 1 | 2} Cell — 0 空, 1 黒, 2 白 */
/** @typedef {'normal' | 'flippedSelf' | 'flipsMade'} Rule */
/** @typedef {'pvp' | 'cpu'} GameMode */
/** @typedef {'first' | 'second' | 'random'} CpuOrder */

const BLACK = 1;
const WHITE = 2;
const EMPTY = 0;

const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

/** @returns {Cell[][]} */
function emptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
}

/** @returns {Cell[][]} */
function initialBoard() {
  const b = emptyBoard();
  b[3][3] = WHITE;
  b[3][4] = BLACK;
  b[4][3] = BLACK;
  b[4][4] = WHITE;
  return b;
}

/**
 * @param {Cell[][]} board
 * @param {number} r
 * @param {number} c
 * @param {1|2} player
 * @param {number} dr
 * @param {number} dc
 */
function collectFlipLine(board, r, c, player, dr, dc) {
  const opp = player === BLACK ? WHITE : BLACK;
  const cells = [];
  let nr = r + dr;
  let nc = c + dc;
  while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === opp) {
    cells.push([nr, nc]);
    nr += dr;
    nc += dc;
  }
  if (
    cells.length > 0 &&
    nr >= 0 && nr < 8 && nc >= 0 && nc < 8 &&
    board[nr][nc] === player
  ) {
    return cells;
  }
  return [];
}

/**
 * @param {Cell[][]} board
 * @param {1|2} player
 */
function getFlippableForMove(board, r, c, player) {
  if (board[r][c] !== EMPTY) return [];
  const all = [];
  for (const [dr, dc] of DIRS) {
    all.push(...collectFlipLine(board, r, c, player, dr, dc));
  }
  return all;
}

/**
 * @param {Cell[][]} board
 * @param {1|2} player
 */
function hasLegalMove(board, player) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (getFlippableForMove(board, r, c, player).length > 0) return true;
    }
  }
  return false;
}

/**
 * @param {Cell[][]} board
 * @param {1|2} player
 * @returns {Array<[number, number]>}
 */
function listLegalMoves(board, player) {
  const out = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (getFlippableForMove(board, r, c, player).length > 0) out.push([r, c]);
    }
  }
  return out;
}

/**
 * @param {Cell[][]} board
 * @param {1|2} player
 */
function countDiscs(board, player) {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === player) n++;
    }
  }
  return n;
}

/**
 * @param {Array<[number, number]>} cells
 * @returns {Array<[number, number]>}
 */
function dedupeCells(cells) {
  const seen = new Set();
  const out = [];
  for (const [fr, fc] of cells) {
    const k = `${fr},${fc}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([fr, fc]);
  }
  return out;
}

/**
 * @param {Cell[][]} board
 * @param {number} r
 * @param {number} c
 * @param {1|2} player
 */
function applyMove(board, r, c, player) {
  const toFlip = dedupeCells(getFlippableForMove(board, r, c, player));
  board[r][c] = player;
  for (const [fr, fc] of toFlip) {
    board[fr][fc] = player;
  }
  return { flippedCount: toFlip.length, toFlipCells: toFlip };
}

/** @param {1|2} p */
function playerName(p) {
  return p === BLACK ? "黒" : "白";
}

/** @param {1|2} p */
function opposite(p) {
  return p === BLACK ? WHITE : BLACK;
}

const ruleHints = {
  normal: "終局時、盤上の自色の石の数が多い方の勝ちです。",
  flippedSelf:
    "終局時、盤上の自色の石に表示されている「その石がひっくり返った回数」をすべて足した値が大きい方の勝ちです。",
  flipsMade:
    "終局時、「自分の手でひっくり返した相手の石の枚数」の累計が多い方の勝ちです。",
};

const ruleLabels = {
  normal: "通常",
  flippedSelf: "返り回数合計",
  flipsMade: "ひっくり返し累計",
};

/** @returns {number[][]} */
function emptyFlipGrid() {
  return Array.from({ length: 8 }, () => Array(8).fill(0));
}

/**
 * @param {Rule} rule
 * @param {GameMode} mode
 * @param {1|2 | null} humanColor 対人時は null
 * @param {{ grayDiscs?: boolean, showLegalHints?: boolean, initialLives?: number }} [options]
 */
function createState(rule, mode, humanColor, options = {}) {
  const grayDiscs = Boolean(options.grayDiscs);
  const showLegalHints = options.showLegalHints !== false;
  const initialLives = Math.max(0, Number(options.initialLives) || 0);
  return {
    rule,
    mode,
    humanColor,
    grayDiscs,
    showLegalHints,
    initialLives,
    lives: { [BLACK]: initialLives, [WHITE]: initialLives },
    board: initialBoard(),
    discFlips: emptyFlipGrid(),
    current: /** @type {1|2} */ (BLACK),
    gameOver: false,
    winner: /** @type {null | 1 | 2 | 'draw'} */ (null),
    totalFlipsMade: { [BLACK]: 0, [WHITE]: 0 },
    movesPlayed: 0,
  };
}

/** 先手（黒）の最初の番 — 灰色石・ライフ減少の猶予 */
function isOpeningGraceTurn() {
  return state.movesPlayed === 0 && state.current === BLACK;
}

/**
 * @param {ReturnType<typeof createState>} s
 * @returns {1|2}
 */
function cpuPlayerFromState(s) {
  return opposite(/** @type {1|2} */ (s.humanColor));
}

/**
 * @param {Cell[][]} board
 * @param {number[][]} discFlips
 * @param {1|2} player
 */
function scoreFlippedSelfFrom(board, discFlips, player) {
  let sum = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === player) sum += discFlips[r][c];
    }
  }
  return sum;
}

/**
 * @param {Omit<ReturnType<typeof createState>, 'humanColor'> & { humanColor?: 1|2 | null }} s
 */
function resolveWinnerOf(s) {
  const { rule, board, totalFlipsMade } = s;
  if (rule === "normal") {
    const b = countDiscs(board, BLACK);
    const w = countDiscs(board, WHITE);
    if (b > w) return BLACK;
    if (w > b) return WHITE;
    return "draw";
  }
  if (rule === "flippedSelf") {
    const b = scoreFlippedSelfFrom(board, s.discFlips, BLACK);
    const w = scoreFlippedSelfFrom(board, s.discFlips, WHITE);
    if (b > w) return BLACK;
    if (w > b) return WHITE;
    return "draw";
  }
  const b = totalFlipsMade[BLACK];
  const w = totalFlipsMade[WHITE];
  if (b > w) return BLACK;
  if (w > b) return WHITE;
  return "draw";
}

function endGameIfNeeded() {
  const full = state.board.every((row) => row.every((cell) => cell !== EMPTY));
  const blackCan = hasLegalMove(state.board, BLACK);
  const whiteCan = hasLegalMove(state.board, WHITE);
  if (full || (!blackCan && !whiteCan)) {
    state.gameOver = true;
    state.winner = resolveWinnerOf(state);
    return true;
  }
  return false;
}

function fixTurnIfCurrentCannotMove() {
  if (state.gameOver) return;
  if (hasLegalMove(state.board, state.current)) return;
  state.current = opposite(state.current);
  if (!hasLegalMove(state.board, state.current)) {
    state.gameOver = true;
    state.winner = resolveWinnerOf(state);
  }
}

function advanceTurnAfterMove() {
  const p = state.current;
  const q = opposite(p);
  if (hasLegalMove(state.board, q)) {
    state.current = q;
  } else if (hasLegalMove(state.board, p)) {
    state.current = p;
  } else {
    state.gameOver = true;
    state.winner = resolveWinnerOf(state);
    return;
  }
  fixTurnIfCurrentCannotMove();
}

/** @type {ReturnType<typeof createState>} */
let state = createState("normal", "pvp", null);

let cpuThinking = false;
let cpuSession = 0;

/** @type {Worker | null} */
let aiWorker = null;
/** Blob Worker 用（破棄時に revoke） */
let aiWorkerObjectUrl = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let cpuMoveWatchdog = null;

const screenSetup = document.getElementById("screenSetup");
const screenGame = document.getElementById("screenGame");
const modeSelect = document.getElementById("modeSelect");
const cpuOptionsField = document.getElementById("cpuOptionsField");
const cpuOrderSelect = document.getElementById("cpuOrderSelect");
const setupRuleSelect = document.getElementById("setupRuleSelect");
const livesSelect = document.getElementById("livesSelect");
const grayDiscsToggle = document.getElementById("grayDiscsToggle");
const showLegalHintsToggle = document.getElementById("showLegalHintsToggle");
const showFlipCountToggle = document.getElementById("showFlipCountToggle");
const startGameBtn = document.getElementById("startGameBtn");
const toMenuBtn = document.getElementById("toMenuBtn");
const gameMetaEl = document.getElementById("gameMeta");

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const toggleScoresBtn = document.getElementById("toggleScoresBtn");
const scoresPanelEl = document.getElementById("scoresPanel");
const blackScoresEl = document.getElementById("blackScores");
const whiteScoresEl = document.getElementById("whiteScores");
const blackLabelEl = document.getElementById("blackLabel");
const whiteLabelEl = document.getElementById("whiteLabel");
const ruleHintEl = document.getElementById("ruleHint");
const livesPanelEl = document.getElementById("livesPanel");
let showDiscFlipCount = false;
let scoresCollapsed = true;
/** @type {null | 1 | 2} 直前の不正着手でライフを失ったプレイヤー */
let lastLifePenaltyPlayer = null;

// 左パネルのカウント表示（黒/白の詳細）を折りたたむ。
function syncScoresVisibility() {
  if (!scoresPanelEl || !toggleScoresBtn) return;
  scoresPanelEl.classList.toggle("is-collapsed", scoresCollapsed);
  toggleScoresBtn.textContent = scoresCollapsed ? "カウントを表示" : "カウントを非表示";
  toggleScoresBtn.setAttribute("aria-expanded", scoresCollapsed ? "false" : "true");
}

/** game.js と同じディレクトリの ai-worker.js（相対パスずれ対策） */
function resolveAiWorkerUrl() {
  const scripts = document.getElementsByTagName("script");
  for (let i = scripts.length - 1; i >= 0; i--) {
    const src = scripts[i].src;
    if (src && /game\.js(\?|$)/i.test(src)) {
      try {
        return new URL("ai-worker.js", src).href;
      } catch (_) {
        break;
      }
    }
  }
  try {
    return new URL("ai-worker.js", window.location.href).href;
  } catch (_) {
    return "ai-worker.js";
  }
}

function clearCpuMoveWatchdog() {
  if (cpuMoveWatchdog != null) {
    clearTimeout(cpuMoveWatchdog);
    cpuMoveWatchdog = null;
  }
}

/** Worker 失敗時: ひっくり返せる枚数が最大の手（メインスレッド・同期） */
function pickGreedyCpuMove() {
  const cpu = cpuPlayerFromState(state);
  const moves = listLegalMoves(state.board, cpu);
  if (moves.length === 0) return null;
  let best = moves[0];
  let bestN = dedupeCells(getFlippableForMove(state.board, best[0], best[1], cpu)).length;
  for (let i = 1; i < moves.length; i++) {
    const r = moves[i][0];
    const c = moves[i][1];
    const n = dedupeCells(getFlippableForMove(state.board, r, c, cpu)).length;
    if (n > bestN) {
      bestN = n;
      best = moves[i];
    }
  }
  return best;
}

function applyCpuMoveNow(pick) {
  const cpuNow = cpuPlayerFromState(state);
  const [r, c] = pick;
  const mover = state.current;
  if (mover !== cpuNow || getFlippableForMove(state.board, r, c, cpuNow).length === 0) return false;
  const { flippedCount, toFlipCells } = applyMove(state.board, r, c, mover);
  for (const [fr, fc] of toFlipCells) {
    state.discFlips[fr][fc] += 1;
  }
  state.totalFlipsMade[mover] += flippedCount;
  state.movesPlayed += 1;
  afterHumanOrInternalMove();
  return true;
}

/** fetch 不能環境向けの最終フォールバック Worker ソース */
function inlineAiWorkerSource() {
  return `
const B=1,W=2,E=0,D=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const PW=[[100,-28,12,6,6,12,-28,100],[-28,-48,-4,-3,-3,-4,-48,-28],[12,-4,6,0,0,6,-4,12],[6,-3,0,2,2,0,-3,6],[6,-3,0,2,2,0,-3,6],[12,-4,6,0,0,6,-4,12],[-28,-48,-4,-3,-3,-4,-48,-28],[100,-28,12,6,6,12,-28,100]];
const C=[[0,0],[0,7],[7,0],[7,7]];
const O=p=>p===B?W:B;
function fl(b,r,c,p,dr,dc){const o=O(p),a=[];let nr=r+dr,nc=c+dc;while(nr>=0&&nr<8&&nc>=0&&nc<8&&b[nr][nc]===o){a.push([nr,nc]);nr+=dr;nc+=dc;}if(a.length&&nr>=0&&nr<8&&nc>=0&&nc<8&&b[nr][nc]===p)return a;return [];}
function mv(b,r,c,p){if(b[r][c]!==E)return[];const x=[];for(const [dr,dc] of D)x.push(...fl(b,r,c,p,dr,dc));return x;}
function legal(b,p){const a=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(mv(b,r,c,p).length)a.push([r,c]);return a;}
function ap(s,r,c){const p=s.current,t=mv(s.board,r,c,p);if(!t.length)return false;s.board[r][c]=p;for(const [fr,fc] of t){s.board[fr][fc]=p;s.discFlips[fr][fc]++;}s.totalFlipsMade[p]+=t.length;s.current=O(p);if(!legal(s.board,s.current).length)s.current=O(s.current);return true;}
function cnt(b,p){let n=0;for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(b[r][c]===p)n++;return n;}
function emp(b){let n=0;for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(b[r][c]===E)n++;return n;}
function cor(b,p){let n=0;for(const [r,c] of C)if(b[r][c]===p)n++;return n;}
function val(s,cpu){const hum=O(cpu),e=emp(s.board),m1=legal(s.board,cpu).length,m2=legal(s.board,hum).length;let p=0;for(let r=0;r<8;r++)for(let c=0;c<8;c++){const v=s.board[r][c];if(v===cpu)p+=PW[r][c];else if(v===hum)p-=PW[r][c];}const d=cnt(s.board,cpu)-cnt(s.board,hum);return p+(m1-m2)*(e>24?8:4)+(cor(s.board,cpu)-cor(s.board,hum))*30+(e>20?-d*2:d*4);}
function cl(s){return{...s,board:s.board.map(r=>r.slice()),discFlips:s.discFlips.map(r=>r.slice()),totalFlipsMade:{1:s.totalFlipsMade[1]||0,2:s.totalFlipsMade[2]||0}};}
function ab(s,d,a,b,cpu,max){const m=legal(s.board,s.current);if(d===0||!m.length)return val(s,cpu);if(max){let best=-1e9;for(const [r,c] of m){const n=cl(s);ap(n,r,c);best=Math.max(best,ab(n,d-1,a,b,cpu,false));a=Math.max(a,best);if(a>=b)break;}return best;}let best=1e9;for(const [r,c] of m){const n=cl(s);ap(n,r,c);best=Math.min(best,ab(n,d-1,a,b,cpu,true));b=Math.min(b,best);if(a>=b)break;}return best;}
self.onmessage=e=>{const st=e.data.state,sid=Number(e.data.session);try{const cpu=O(Number(st.humanColor));const moves=legal(st.board,Number(st.current));if(!moves.length){self.postMessage({session:sid,move:null});return;}let best=moves[0],score=-1e9,depth=emp(st.board)<=18?10:8;for(const [r,c] of moves){const n=cl(st);ap(n,r,c);const sc=ab(n,depth-1,-1e9,1e9,cpu,false);if(sc>score){score=sc;best=[r,c];}}self.postMessage({session:sid,move:best});}catch(err){self.postMessage({session:sid,move:null,error:String(err&&err.message?err.message:err)});}};
`;
}

/**
 * file:// では Worker(外部URL) が禁止される場合があるため、
 * 1) 通常URL 2) fetch→Blob 3) インラインBlob の順で生成する。
 * @returns {Promise<Worker | null>}
 */
async function ensureAiWorkerAsync() {
  if (aiWorker) return aiWorker;

  // Worker の結果受信/エラー処理を 1 か所に束ねる。
  const bindHandlers = (w) => {
    w.onmessage = handleAiWorkerMessage;
    w.onerror = (ev) => {
      console.error(ev.message || ev);
      handleCpuWorkerFailed();
    };
    aiWorker = w;
    return w;
  };

  // Worker コード文字列から Blob URL を作って起動。
  const createFromCodeBlob = (code) => {
    if (aiWorkerObjectUrl) {
      URL.revokeObjectURL(aiWorkerObjectUrl);
      aiWorkerObjectUrl = null;
    }
    aiWorkerObjectUrl = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
    return bindHandlers(new Worker(aiWorkerObjectUrl));
  };

  // ai-worker.js を取得して Blob 化。
  const createFromFetchedBlob = async () => {
    const srcUrl = new URL("ai-worker.js", window.location.href);
    const res = await fetch(srcUrl);
    if (!res.ok) throw new Error(`ai-worker.js: ${res.status}`);
    return createFromCodeBlob(await res.text());
  };

  // fetch 不能環境の最終フォールバック。
  const createFromInlineBlob = () => createFromCodeBlob(inlineAiWorkerSource());

  if (window.location.protocol === "file:") {
    try {
      return await createFromFetchedBlob();
    } catch (err) {
      console.warn("fetch(worker) に失敗、インラインWorkerへフォールバック:", err);
      try {
        return createFromInlineBlob();
      } catch (err2) {
        console.error(err2);
        return null;
      }
    }
  }

  try {
    return bindHandlers(new Worker(resolveAiWorkerUrl()));
  } catch (err) {
    console.warn("Worker(script URL) に失敗、Blobへフォールバック:", err);
    try {
      return await createFromFetchedBlob();
    } catch (err2) {
      console.warn("fetch(worker) も失敗、インラインWorkerへフォールバック:", err2);
      try {
        return createFromInlineBlob();
      } catch (err3) {
        console.error(err3);
        return null;
      }
    }
  }
}

function destroyAiWorker() {
  clearCpuMoveWatchdog();
  if (aiWorker) {
    aiWorker.onmessage = null;
    aiWorker.onerror = null;
    aiWorker.terminate();
    aiWorker = null;
  }
  if (aiWorkerObjectUrl) {
    URL.revokeObjectURL(aiWorkerObjectUrl);
    aiWorkerObjectUrl = null;
  }
}

function handleCpuWorkerFailed() {
  destroyAiWorker();
  cpuThinking = false;
  if (state.mode !== "cpu" || state.gameOver) {
    renderStatus();
    renderBoard();
    return;
  }
  const cpuNow = cpuPlayerFromState(state);
  if (state.current !== cpuNow) {
    renderStatus();
    renderBoard();
    return;
  }
  // 強い探索が使えない場合でも手番が止まらないよう貪欲手で継続。
  const pick = pickGreedyCpuMove();
  if (!pick || !applyCpuMoveNow(pick)) {
    fixTurnIfCurrentCannotMove();
    renderStatus();
    renderBoard();
    scheduleCpuIfNeeded();
  }
}

/**
 * @param {MessageEvent<{ session: number; move: [number, number] | null; error?: string }>} e
 */
/**
 * Worker からの手（配列 / 類配列）
 * @param {unknown} m
 * @returns {[number, number] | null}
 */
function coerceWorkerMove(m) {
  if (m == null) return null;
  let a;
  let b;
  if (Array.isArray(m) && m.length >= 2) {
    a = Number(m[0]);
    b = Number(m[1]);
  } else if (typeof m === "object" && typeof m.length === "number" && m.length >= 2) {
    a = Number(m[0]);
    b = Number(m[1]);
  } else {
    return null;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a | 0, b | 0];
}

function handleAiWorkerMessage(e) {
  clearCpuMoveWatchdog();
  const data = e.data;
  const sess = data != null && typeof data === "object" ? Number(data.session) : NaN;
  if (!data || typeof data !== "object" || !Number.isFinite(sess)) {
    cpuThinking = false;
    if (state.mode === "cpu" && !state.gameOver && state.current === cpuPlayerFromState(state)) {
      const pick = pickGreedyCpuMove();
      if (pick && applyCpuMoveNow(pick)) return;
    }
    renderStatus();
    renderBoard();
    return;
  }
  if (sess !== cpuSession) return;

  cpuThinking = false;

  if (state.gameOver || state.mode !== "cpu") {
    renderStatus();
    renderBoard();
    return;
  }

  const cpuNow = cpuPlayerFromState(state);
  if (state.current !== cpuNow) {
    renderStatus();
    renderBoard();
    return;
  }

  const err = data.error;
  // Worker からの手データを安全に正規化。
  const move = coerceWorkerMove(data.move);

  if (err || move == null) {
    const pick = pickGreedyCpuMove();
    if (pick && applyCpuMoveNow(pick)) return;
    fixTurnIfCurrentCannotMove();
    renderStatus();
    renderBoard();
    scheduleCpuIfNeeded();
    return;
  }

  const r = move[0];
  const c = move[1];
  const mover = state.current;
  if (mover !== cpuNow || getFlippableForMove(state.board, r, c, cpuNow).length === 0) {
    const pick = pickGreedyCpuMove();
    if (pick && applyCpuMoveNow(pick)) return;
    renderStatus();
    renderBoard();
    return;
  }

  const { flippedCount, toFlipCells } = applyMove(state.board, r, c, mover);
  for (const [fr, fc] of toFlipCells) {
    state.discFlips[fr][fc] += 1;
  }
  state.totalFlipsMade[mover] += flippedCount;
  state.movesPlayed += 1;
  afterHumanOrInternalMove();
}

/**
 * CPU 探索用にプレーンオブジェクトへ（Structured clone で Worker へ渡す）
 */
function buildAiSearchPayload() {
  // Structured clone できるプレーンデータだけを Worker に渡す。
  return {
    rule: state.rule,
    humanColor: state.humanColor,
    board: state.board.map((row) => [...row]),
    discFlips: state.discFlips.map((row) => [...row]),
    current: state.current,
    gameOver: state.gameOver,
    winner: state.winner,
    totalFlipsMade: {
      [BLACK]: state.totalFlipsMade[BLACK],
      [WHITE]: state.totalFlipsMade[WHITE],
    },
    mode: state.mode,
  };
}

function isHumanTurn() {
  if (state.mode === "pvp") return true;
  return state.current === state.humanColor;
}

/** @param {1|2} player */
function playerDisplayName(player) {
  let name = playerName(player);
  if (state.mode === "cpu") {
    name = player === state.humanColor ? `${name}（あなた）` : `${name}（CPU）`;
  }
  return name;
}

/** 残りライフを ♥/♡ で表示 */
function formatLifeHearts(remaining, max) {
  const n = Math.max(0, remaining);
  const cap = Math.max(0, max);
  return "♥".repeat(n) + "♡".repeat(Math.max(0, cap - n));
}

function renderLivesPanel() {
  if (!livesPanelEl) return;
  const livesActive = state.initialLives > 0;
  livesPanelEl.classList.toggle("is-hidden", !livesActive);
  if (!livesActive) {
    livesPanelEl.classList.remove("is-penalty");
    livesPanelEl.innerHTML = "";
    return;
  }
  livesPanelEl.classList.toggle("is-penalty", lastLifePenaltyPlayer != null && !state.gameOver);
  const lines = [BLACK, WHITE].map((player) => {
    const label = playerDisplayName(player);
    const hearts = formatLifeHearts(state.lives[player], state.initialLives);
    return `<div class="life-line"><span class="life-line-label">${label}</span><span class="life-hearts" aria-label="残りライフ ${state.lives[player]}">${hearts}</span></div>`;
  });
  const noteText =
    lastLifePenaltyPlayer != null && !state.gameOver
      ? `不正な手 — ${playerDisplayName(lastLifePenaltyPlayer)}がライフを1失いました`
      : "";
  const note = `<div class="life-penalty-note${noteText ? "" : " is-empty"}">${noteText || "\u00a0"}</div>`;
  livesPanelEl.innerHTML = lines.join("") + note;
}

function showSetup() {
  cpuThinking = false;
  screenSetup.classList.remove("is-hidden");
  screenGame.classList.add("is-hidden");
}

function showGame() {
  screenSetup.classList.add("is-hidden");
  screenGame.classList.remove("is-hidden");
}

function syncCpuOptionsVisibility() {
  if (modeSelect.value === "cpu") cpuOptionsField.classList.remove("is-hidden");
  else cpuOptionsField.classList.add("is-hidden");
}

function updateGameMeta() {
  const variants = [];
  if (state.grayDiscs) variants.push("灰色石");
  if (!state.showLegalHints) variants.push("ヒントなし");
  if (state.initialLives > 0) variants.push(`ライフ ${state.initialLives}`);
  const variantText = variants.length ? ` · ${variants.join(" · ")}` : "";

  if (state.mode === "pvp") {
    gameMetaEl.textContent = `対人 · ルール: ${ruleLabels[state.rule]}${variantText}`;
    return;
  }
  const side =
    state.humanColor === BLACK
      ? "あなた＝先手（黒）"
      : "あなた＝後攻（白）";
  gameMetaEl.textContent = `対CPU（${side}）· ルール: ${ruleLabels[state.rule]}${variantText}`;
}

function updateSideLabels() {
  if (state.mode === "cpu") {
    const hc = /** @type {1|2} */ (state.humanColor);
    blackLabelEl.textContent = hc === BLACK ? "黒（あなた）" : "黒（CPU）";
    whiteLabelEl.textContent = hc === WHITE ? "白（あなた）" : "白（CPU）";
  } else {
    blackLabelEl.textContent = "黒";
    whiteLabelEl.textContent = "白";
  }
}

function scoreFlippedSelfRule(player) {
  return scoreFlippedSelfFrom(state.board, state.discFlips, player);
}

function renderScores() {
  const bDisc = countDiscs(state.board, BLACK);
  const wDisc = countDiscs(state.board, WHITE);
  const sumFlipsB = scoreFlippedSelfRule(BLACK);
  const sumFlipsW = scoreFlippedSelfRule(WHITE);
  const fmB = state.totalFlipsMade[BLACK];
  const fmW = state.totalFlipsMade[WHITE];

  /** @param {1|2} player */
  const linesFor = (player) => {
    const disc = player === BLACK ? bDisc : wDisc;
    const sumFlips = player === BLACK ? sumFlipsB : sumFlipsW;
    const fm = player === BLACK ? fmB : fmW;
    if (state.rule === "normal") {
      return [
        { text: `盤上: ${disc} 枚`, primary: false },
        { text: `自色の返り回数: ${sumFlips}`, primary: false },
        { text: `ひっくり返した累計: ${fm} 枚`, primary: false },
      ];
    }
    if (state.rule === "flippedSelf") {
      return [
        { text: `盤上: ${disc} 枚`, primary: false },
        { text: `自色の返り回数: ${sumFlips}`, primary: true },
        { text: `ひっくり返した累計: ${fm} 枚`, primary: false },
      ];
    }
    return [
      { text: `盤上: ${disc} 枚`, primary: false },
      { text: `自色の返り回数: ${sumFlips}`, primary: false },
      { text: `ひっくり返した累計: ${fm} 枚`, primary: true },
    ];
  };

  // 勝利条件の指標のみ primary を付け、色/太字で強調する。
  const lineHtml = (items) =>
    items
      .map(
        (item) =>
          `<span class="${item.primary ? "score-line-primary" : ""}">${item.text}</span>`,
      )
      .join("<br>");
  blackScoresEl.innerHTML = lineHtml(linesFor(BLACK));
  whiteScoresEl.innerHTML = lineHtml(linesFor(WHITE));
}

function renderStatus() {
  ruleHintEl.textContent = ruleHints[state.rule];
  renderLivesPanel();
  if (state.gameOver) {
    if (state.winner === "draw") {
      statusEl.textContent = "引き分け";
    } else {
      const wn = state.winner;
      const name = playerDisplayName(wn);
      if (lastLifePenaltyPlayer === opposite(wn)) {
        statusEl.textContent = `${playerDisplayName(lastLifePenaltyPlayer)} — ライフがなくなりました。${name}の勝ち`;
      } else {
        statusEl.textContent = `${name}の勝ち`;
      }
    }
    renderScores();
    return;
  }
  if (cpuThinking && state.mode === "cpu") {
    const cpu = cpuPlayerFromState(state);
    statusEl.textContent = `${playerName(cpu)}（CPU）の番です — 思考中…`;
    renderScores();
    return;
  }
  let turn = playerDisplayName(state.current);
  if (lastLifePenaltyPlayer != null && lastLifePenaltyPlayer === state.current) {
    turn += " — もう一度着手してください";
  }
  statusEl.textContent = `${turn}の番です`;
  renderScores();
}

function renderBoard() {
  boardEl.innerHTML = "";
  const legal = new Set();
  const canClickHuman = !state.gameOver && !cpuThinking && isHumanTurn();
  const livesActive = state.initialLives > 0;

  if (canClickHuman) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (getFlippableForMove(state.board, r, c, state.current).length > 0) {
          legal.add(`${r},${c}`);
        }
      }
    }
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `マス ${r + 1},${c + 1}`);
      const v = state.board[r][c];
      if (v !== EMPTY) {
        const disc = document.createElement("span");
        const discTone =
          state.grayDiscs && !isOpeningGraceTurn()
            ? "gray"
            : v === BLACK
              ? "black"
              : "white";
        disc.className = `disc ${discTone}`;
        // 設定に応じて「その石の返り回数」数字を描画する。
        if (showDiscFlipCount) {
          const n = state.discFlips[r][c];
          const label = document.createElement("span");
          label.className = "disc-flip-count";
          label.textContent = String(n);
          label.title = "このマスの石がひっくり返った回数";
          disc.appendChild(label);
        }
        cell.appendChild(disc);
      }
      const key = `${r},${c}`;
      const isLegal = legal.has(key);
      if (canClickHuman) {
        if (livesActive) {
          // ライフ制: どのマスも選べる（不正ならライフ減少）。
          if (state.showLegalHints && isLegal) cell.classList.add("legal");
          cell.addEventListener("click", () => onCellClick(r, c));
        } else if (isLegal) {
          if (state.showLegalHints) cell.classList.add("legal");
          cell.addEventListener("click", () => onCellClick(r, c));
        } else {
          cell.disabled = true;
        }
      } else {
        cell.disabled = true;
      }
      boardEl.appendChild(cell);
    }
  }
}

function afterHumanOrInternalMove() {
  if (endGameIfNeeded()) {
    renderStatus();
    renderBoard();
    return;
  }
  advanceTurnAfterMove();
  renderStatus();
  renderBoard();
  scheduleCpuIfNeeded();
}

/** @param {1|2} player */
function applyLifePenalty(player) {
  state.lives[player] -= 1;
  lastLifePenaltyPlayer = player;
  if (state.lives[player] <= 0) {
    state.gameOver = true;
    state.winner = opposite(player);
    renderStatus();
    renderBoard();
    return;
  }
  renderStatus();
  renderBoard();
}

function onCellClick(r, c) {
  if (state.gameOver || cpuThinking) return;
  if (!isHumanTurn()) return;

  const mover = state.current;
  if (state.board[r][c] !== EMPTY) {
    if (state.initialLives > 0 && !isOpeningGraceTurn()) applyLifePenalty(mover);
    return;
  }
  const flips = getFlippableForMove(state.board, r, c, mover);
  if (flips.length === 0) {
    if (state.initialLives > 0 && !isOpeningGraceTurn()) applyLifePenalty(mover);
    return;
  }

  lastLifePenaltyPlayer = null;
  const { flippedCount, toFlipCells } = applyMove(state.board, r, c, mover);
  for (const [fr, fc] of toFlipCells) {
    state.discFlips[fr][fc] += 1;
  }
  state.totalFlipsMade[mover] += flippedCount;
  state.movesPlayed += 1;

  afterHumanOrInternalMove();
}

function scheduleCpuIfNeeded() {
  if (state.mode !== "cpu" || state.gameOver) return;
  const cpu = cpuPlayerFromState(state);
  if (state.current !== cpu) return;

  cpuThinking = true;
  renderStatus();
  renderBoard();

  const sid = cpuSession;
  clearCpuMoveWatchdog();

  // 直後の描画（考えています…）を確定させてから Worker を起動。
  queueMicrotask(() => {
    void (async () => {
      if (sid !== cpuSession) return;

      const w = await ensureAiWorkerAsync();
      if (sid !== cpuSession) return;
      if (!w) {
        handleCpuWorkerFailed();
        return;
      }

      try {
        w.postMessage({
          session: sid,
          state: buildAiSearchPayload(),
        });
      } catch (err) {
        console.error(err);
        handleCpuWorkerFailed();
        return;
      }

      // まれに Worker 応答が途切れた場合の保険。
      cpuMoveWatchdog = window.setTimeout(() => {
        cpuMoveWatchdog = null;
        if (sid !== cpuSession || !cpuThinking) return;
        console.warn("CPU search timeout; using fallback move.");
        destroyAiWorker();
        cpuThinking = false;
        if (state.mode !== "cpu" || state.gameOver) {
          renderStatus();
          renderBoard();
          return;
        }
        if (state.current !== cpuPlayerFromState(state)) {
          renderStatus();
          renderBoard();
          return;
        }
        const pick = pickGreedyCpuMove();
        if (pick && applyCpuMoveNow(pick)) return;
        fixTurnIfCurrentCannotMove();
        renderStatus();
        renderBoard();
        scheduleCpuIfNeeded();
      }, 120_000);
    })();
  });
}

function startGameFromSetup() {
  cpuSession += 1;
  destroyAiWorker();
  /** @type {Rule} */
  const rule = setupRuleSelect.value;
  /** @type {GameMode} */
  const mode = modeSelect.value;

  /** @type {1|2 | null} */
  let humanColor = null;
  if (mode === "cpu") {
    /** @type {CpuOrder} */
    const ord = cpuOrderSelect.value;
    if (ord === "first") humanColor = BLACK;
    else if (ord === "second") humanColor = WHITE;
    else humanColor = Math.random() < 0.5 ? BLACK : WHITE;
  }

  showDiscFlipCount = showFlipCountToggle ? Boolean(showFlipCountToggle.checked) : false;
  const grayDiscs = grayDiscsToggle ? Boolean(grayDiscsToggle.checked) : false;
  const showLegalHints = showLegalHintsToggle ? Boolean(showLegalHintsToggle.checked) : true;
  const initialLives = livesSelect ? Math.max(0, Number(livesSelect.value) || 0) : 0;
  lastLifePenaltyPlayer = null;
  // 対局設定を確定して新しいゲーム状態を作る。
  state = createState(rule, mode, humanColor, { grayDiscs, showLegalHints, initialLives });
  fixTurnIfCurrentCannotMove();
  cpuThinking = false;
  updateGameMeta();
  updateSideLabels();
  showGame();
  renderStatus();
  renderBoard();
  scheduleCpuIfNeeded();
}

function backToMenu() {
  cpuSession += 1;
  destroyAiWorker();
  lastLifePenaltyPlayer = null;
  showSetup();
}

modeSelect.addEventListener("change", syncCpuOptionsVisibility);
startGameBtn.addEventListener("click", startGameFromSetup);
toMenuBtn.addEventListener("click", backToMenu);
if (toggleScoresBtn) {
  toggleScoresBtn.addEventListener("click", () => {
    scoresCollapsed = !scoresCollapsed;
    syncScoresVisibility();
  });
}
if (showFlipCountToggle) {
  showFlipCountToggle.addEventListener("change", () => {
    showDiscFlipCount = Boolean(showFlipCountToggle.checked);
    renderBoard();
  });
}

syncCpuOptionsVisibility();
syncScoresVisibility();
showSetup();
