/** CPU 探索専用（メインスレッドをブロックしない） */
"use strict";

const BLACK = 1;
const WHITE = 2;
const EMPTY = 0;

const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

const POS_WEIGHT = [
  [100, -28, 12,  6,  6, 12, -28, 100],
  [-28, -48, -4, -3, -3, -4, -48, -28],
  [ 12,  -4,  6,  0,  0,  6,  -4,  12],
  [  6,  -3,  0,  2,  2,  0,  -3,   6],
  [  6,  -3,  0,  2,  2,  0,  -3,   6],
  [ 12,  -4,  6,  0,  0,  6,  -4,  12],
  [-28, -48, -4, -3, -3, -4, -48, -28],
  [100, -28, 12,  6,  6, 12, -28, 100],
];

const CORNER_X = [
  [0, 0, 1, 1],
  [0, 7, 1, 6],
  [7, 0, 6, 1],
  [7, 7, 6, 6],
];

const CORNERS = [[0, 0], [0, 7], [7, 0], [7, 7]];

const MATE_SCORE = 1_000_000;
const TT_MAX = 550_000;

function opposite(p) {
  return p === BLACK ? WHITE : BLACK;
}

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

function getFlippableForMove(board, r, c, player) {
  if (board[r][c] !== EMPTY) return [];
  const all = [];
  for (let i = 0; i < DIRS.length; i++) {
    const dr = DIRS[i][0];
    const dc = DIRS[i][1];
    all.push(...collectFlipLine(board, r, c, player, dr, dc));
  }
  return all;
}

function hasLegalMove(board, player) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (getFlippableForMove(board, r, c, player).length > 0) return true;
    }
  }
  return false;
}

function listLegalMoves(board, player) {
  const out = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (getFlippableForMove(board, r, c, player).length > 0) out.push([r, c]);
    }
  }
  return out;
}

function countDiscs(board, player) {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === player) n++;
    }
  }
  return n;
}

function countEmpty(board) {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === EMPTY) n++;
    }
  }
  return n;
}

function frontierCount(board, player) {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] !== player) continue;
      for (let i = 0; i < DIRS.length; i++) {
        const nr = r + DIRS[i][0];
        const nc = c + DIRS[i][1];
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === EMPTY) {
          n++;
          break;
        }
      }
    }
  }
  return n;
}

function xSquarePenalty(board, r, c) {
  let p = 0;
  for (let i = 0; i < CORNER_X.length; i++) {
    const cr = CORNER_X[i][0];
    const cc = CORNER_X[i][1];
    const xr = CORNER_X[i][2];
    const xc = CORNER_X[i][3];
    if (r === xr && c === xc && board[cr][cc] === EMPTY) p += 1;
  }
  return p;
}

function dedupeCells(cells) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < cells.length; i++) {
    const fr = cells[i][0];
    const fc = cells[i][1];
    const k = fr + "," + fc;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([fr, fc]);
  }
  return out;
}

function applyMove(board, r, c, player) {
  const toFlip = dedupeCells(getFlippableForMove(board, r, c, player));
  board[r][c] = player;
  for (let i = 0; i < toFlip.length; i++) {
    board[toFlip[i][0]][toFlip[i][1]] = player;
  }
  return { flippedCount: toFlip.length, toFlipCells: toFlip };
}

function scoreFlippedSelfFrom(board, discFlips, player) {
  let sum = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === player) sum += discFlips[r][c];
    }
  }
  return sum;
}

function resolveWinnerOf(s) {
  const rule = s.rule;
  const board = s.board;
  const totalFlipsMade = s.totalFlipsMade;
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

function cpuPlayerFromState(s) {
  return opposite(s.humanColor);
}

function cornerScore(board, player) {
  let n = 0;
  for (let i = 0; i < CORNERS.length; i++) {
    const r = CORNERS[i][0];
    const c = CORNERS[i][1];
    if (board[r][c] === player) n++;
  }
  return n;
}

function positionalScoreDiff(board, cpu) {
  const hum = opposite(cpu);
  let v = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell === cpu) v += POS_WEIGHT[r][c];
      else if (cell === hum) v -= POS_WEIGHT[r][c];
    }
  }
  return v;
}

function staticEval(s) {
  const cpu = cpuPlayerFromState(s);
  const human = s.humanColor;
  if (s.gameOver) {
    if (s.winner === "draw") return 0;
    return s.winner === cpu ? MATE_SCORE : -MATE_SCORE;
  }

  const mobCpu = listLegalMoves(s.board, cpu).length;
  const mobHum = listLegalMoves(s.board, human).length;
  const empty = countEmpty(s.board);

  if (s.rule === "normal") {
    let v = positionalScoreDiff(s.board, cpu);
    const mobW = empty > 34 ? 12 : empty > 24 ? 8 : empty > 14 ? 4 : 2;
    v += (mobCpu - mobHum) * mobW;
    const discDiff = countDiscs(s.board, cpu) - countDiscs(s.board, human);
    if (empty > 30) v -= discDiff * 4;
    else if (empty > 18) v += discDiff * 1;
    else v += discDiff * 5;
    v += (cornerScore(s.board, cpu) - cornerScore(s.board, human)) * 32;
    const fW = empty > 22 ? 5 : 2;
    v -= (frontierCount(s.board, cpu) - frontierCount(s.board, human)) * fW;
    return v;
  }
  if (s.rule === "flippedSelf") {
    const a = scoreFlippedSelfFrom(s.board, s.discFlips, cpu);
    const b = scoreFlippedSelfFrom(s.board, s.discFlips, human);
    return (a - b) * 16 + (mobCpu - mobHum) * 6 + (cornerScore(s.board, cpu) - cornerScore(s.board, human)) * 10;
  }
  const f = s.totalFlipsMade[cpu] - s.totalFlipsMade[human];
  return f * 16 + (mobCpu - mobHum) * 5 + (cornerScore(s.board, cpu) - cornerScore(s.board, human)) * 8;
}

function ttKey(s) {
  let k = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) k += s.board[r][c];
  }
  k += "|" + s.current + "|" + s.rule + "|" + s.totalFlipsMade[BLACK] + "," + s.totalFlipsMade[WHITE];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) k += "," + s.discFlips[r][c];
  }
  return k;
}

function cloneStateForSearch(s) {
  const board = [];
  const discFlips = [];
  for (let r = 0; r < 8; r++) {
    board.push(s.board[r].slice());
    discFlips.push(s.discFlips[r].slice());
  }
  const tf = s.totalFlipsMade;
  return {
    rule: s.rule,
    mode: s.mode,
    humanColor: s.humanColor,
    board,
    discFlips,
    current: s.current,
    gameOver: s.gameOver,
    winner: s.winner,
    totalFlipsMade: {
      [BLACK]: tf[BLACK] != null ? tf[BLACK] : tf[1],
      [WHITE]: tf[WHITE] != null ? tf[WHITE] : tf[2],
    },
  };
}

function advanceTurnSearch(s) {
  const p = s.current;
  const q = opposite(p);
  if (hasLegalMove(s.board, q)) {
    s.current = q;
  } else if (hasLegalMove(s.board, p)) {
    s.current = p;
  } else {
    s.gameOver = true;
    s.winner = resolveWinnerOf(s);
    return;
  }
  fixTurnSearchOnly(s);
}

function fixTurnSearchOnly(s) {
  let guard = 0;
  while (!s.gameOver && !hasLegalMove(s.board, s.current)) {
    s.current = opposite(s.current);
    if (!hasLegalMove(s.board, s.current)) {
      s.gameOver = true;
      s.winner = resolveWinnerOf(s);
      return;
    }
    if (++guard > 8) break;
  }
}

function applyFullMove(s, r, c) {
  const mover = s.current;
  const applied = applyMove(s.board, r, c, mover);
  const toFlipCells = applied.toFlipCells;
  for (let i = 0; i < toFlipCells.length; i++) {
    const fr = toFlipCells[i][0];
    const fc = toFlipCells[i][1];
    s.discFlips[fr][fc] += 1;
  }
  s.totalFlipsMade[mover] += applied.flippedCount;
  let full = true;
  for (let r0 = 0; r0 < 8; r0++) {
    for (let c0 = 0; c0 < 8; c0++) {
      if (s.board[r0][c0] === EMPTY) {
        full = false;
        break;
      }
    }
    if (!full) break;
  }
  const blackCan = hasLegalMove(s.board, BLACK);
  const whiteCan = hasLegalMove(s.board, WHITE);
  if (full || (!blackCan && !whiteCan)) {
    s.gameOver = true;
    s.winner = resolveWinnerOf(s);
    return;
  }
  advanceTurnSearch(s);
}

function moveSortKey(s, rc) {
  const r = rc[0];
  const c = rc[1];
  const p = s.current;
  const flips = dedupeCells(getFlippableForMove(s.board, r, c, p)).length;
  let k = flips * 14;
  for (let i = 0; i < CORNERS.length; i++) {
    const cr = CORNERS[i][0];
    const cc = CORNERS[i][1];
    if (r === cr && c === cc) k += 220;
  }
  if (s.rule === "normal") {
    k += POS_WEIGHT[r][c] * 0.15;
    k -= xSquarePenalty(s.board, r, c) * 18;
  }
  return k;
}

function orderMoves(s, moves, principal) {
  const out = moves.slice();
  out.sort(function (A, B) {
    if (principal) {
      if (A[0] === principal[0] && A[1] === principal[1]) return -1;
      if (B[0] === principal[0] && B[1] === principal[1]) return 1;
    }
    return moveSortKey(s, B) - moveSortKey(s, A);
  });
  return out;
}

function getMaxSearchDepth(empty) {
  if (empty >= 52) return 9;
  if (empty >= 46) return 10;
  if (empty >= 40) return 11;
  if (empty >= 32) return 12;
  if (empty >= 24) return 13;
  if (empty >= 16) return 14;
  if (empty >= 10) return 15;
  if (empty >= 6) return 16;
  return 20;
}

const ttMap = new Map();

function negamax(s, depth, alpha, beta) {
  if (s.gameOver) return staticEval(s);
  if (depth === 0) return staticEval(s);

  const key = ttKey(s);
  const te = ttMap.get(key);
  if (te && te.d >= depth) return te.v;

  const moves = listLegalMoves(s.board, s.current);
  if (moves.length === 0) {
    const next = cloneStateForSearch(s);
    fixTurnSearchOnly(next);
    if (next.gameOver) return staticEval(next);
    const v = -negamax(next, depth - 1, -beta, -alpha);
    if (ttMap.size < TT_MAX) ttMap.set(key, { d: depth, v: v });
    return v;
  }

  const ordered = orderMoves(s, moves, null);
  let best = -Infinity;
  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i][0];
    const c = ordered[i][1];
    const next = cloneStateForSearch(s);
    applyFullMove(next, r, c);
    const val = -negamax(next, depth - 1, -beta, -alpha);
    if (val > best) best = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }

  if (ttMap.size < TT_MAX) ttMap.set(key, { d: depth, v: best });
  return best;
}

function searchAtDepth(s, depth, principal) {
  const moves = listLegalMoves(s.board, s.current);
  if (moves.length === 0) return { move: null, score: -Infinity };
  const ordered = orderMoves(s, moves, principal);
  let bestScore = -Infinity;
  const bestMoves = [];
  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i][0];
    const c = ordered[i][1];
    const next = cloneStateForSearch(s);
    applyFullMove(next, r, c);
    const sc = -negamax(next, depth - 1, -Infinity, Infinity);
    if (sc > bestScore + 1e-7) {
      bestScore = sc;
      bestMoves.length = 0;
      bestMoves.push([r, c]);
    } else if (Math.abs(sc - bestScore) <= 1e-7) {
      bestMoves.push([r, c]);
    }
  }
  const pick = bestMoves[Math.floor(Math.random() * bestMoves.length)];
  return { move: pick, score: bestScore };
}

function chooseCpuMove(rawState) {
  ttMap.clear();
  const s = rawState;
  const moves = listLegalMoves(s.board, s.current);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  const empty = countEmpty(s.board);
  const maxD = getMaxSearchDepth(empty);
  let principal = null;
  let bestMove = moves[0];

  for (let d = 1; d <= maxD; d++) {
    const result = searchAtDepth(s, d, principal);
    const move = result.move;
    const score = result.score;
    if (move) {
      bestMove = move;
      principal = move;
    }
    if (!Number.isFinite(score)) break;
  }
  return bestMove;
}

function normalizeSearchState(st) {
  if (!st || typeof st !== "object") return st;
  const cur = Number(st.current);
  if (cur === BLACK || cur === WHITE) st.current = cur;
  const hc = Number(st.humanColor);
  if (hc === BLACK || hc === WHITE) st.humanColor = hc;
  if (st.totalFlipsMade && typeof st.totalFlipsMade === "object") {
    const tf = st.totalFlipsMade;
    const b = tf[BLACK] != null ? tf[BLACK] : tf[1];
    const w = tf[WHITE] != null ? tf[WHITE] : tf[2];
    st.totalFlipsMade = {
      1: Math.max(0, Math.floor(Number(b) || 0)),
      2: Math.max(0, Math.floor(Number(w) || 0)),
    };
  }
  return st;
}

self.onmessage = function (e) {
  const session = Number(e.data.session);
  const st = normalizeSearchState(e.data.state);
  if (!Number.isFinite(session)) {
    self.postMessage({ session: NaN, move: null, error: "session" });
    return;
  }
  try {
    const move = chooseCpuMove(st);
    self.postMessage({ session: session, move: move });
  } catch (err) {
    self.postMessage({ session: session, move: null, error: String(err && err.message ? err.message : err) });
  }
};
