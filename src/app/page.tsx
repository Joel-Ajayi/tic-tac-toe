"use client";

import React, { useMemo, useState } from "react";

/**
 * Gravity Tic‑Tac‑Toe — Next.js (App Router) single‑file page
 * -----------------------------------------------------------
 *
 * What is "Gravity Tic‑Tac‑Toe"?
 * - It's normal Tic‑Tac‑Toe except pieces **fall** to the lowest empty
 *   cell in a column (like Connect‑Four). You click a **column**, not a cell.
 * - First to get CONNECT in a row (default 3) wins.
 *
 * Features in this file:
 * - Click a column to drop X or O with gravity
 * - Config presets: 3×3 connect‑3 (classic gravity tic‑tac‑toe) or 7×6 connect‑4
 * - Win/draw detection + highlight winning cells
 * - Move history with Undo
 * - Clean Tailwind UI (works without Tailwind too)
 *
 * How to use:
 *   1) Create a Next.js app (App Router):
 *      npx create-next-app@latest gravity-ttt --ts
 *      cd gravity-ttt
 *   2) Replace app/page.tsx with this file.
 *   3) npm run dev
 */

// ---------------- Types ----------------

type Player = "X" | "O";

type Cell = "" | Player; // empty or player

interface Settings {
  cols: number; // width
  rows: number; // height
  connect: number; // in-a-row needed to win
}

interface MoveRecord {
  col: number;
  row: number;
  player: Player;
}

// ---------------- Helpers ----------------

function makeBoard(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(""));
}

function cloneBoard(b: Cell[][]): Cell[][] {
  return b.map((row) => row.slice());
}

// Try to drop a piece into a column; returns the row index used, or -1 if column full
function dropInColumn(board: Cell[][], col: number, player: Player): number {
  for (let r = board.length - 1; r >= 0; r--) {
    if (!board[r][col]) {
      board[r][col] = player;
      return r;
    }
  }
  return -1; // full
}

// Compute winner and winning cells
function computeWinner(
  board: Cell[][],
  connect: number
): { winner: Player | null; line: [number, number][] } {
  const rows = board.length;
  const cols = board[0].length;
  const dirs: [number, number][] = [
    [0, 1], // → right
    [1, 0], // ↓ down
    [1, 1], // ↘ diag
    [1, -1], // ↙ diag
  ];

  const inBounds = (r: number, c: number) =>
    r >= 0 && r < rows && c >= 0 && c < cols;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const start = board[r][c];
      if (!start) continue;
      for (const [dr, dc] of dirs) {
        const line: [number, number][] = [[r, c]];
        for (let k = 1; k < connect; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (!inBounds(rr, cc) || board[rr][cc] !== start) {
            break;
          }
          line.push([rr, cc]);
        }
        if (line.length === connect) {
          return { winner: start as Player, line };
        }
      }
    }
  }

  return { winner: null, line: [] };
}

function isBoardFull(board: Cell[][]): boolean {
  return board[0].every((v) => !!v);
}

// ---------------- Main Component ----------------

export default function GravityTicTacToePage() {
  // Two presets: tiny TTT (3x3 connect‑3) and classic Connect‑Four style (7x6 connect‑4)
  const PRESETS: Record<string, Settings> = {
    "3x3 connect‑3": { cols: 3, rows: 3, connect: 3 },
    "7x6 connect‑4": { cols: 7, rows: 6, connect: 4 },
  };

  const [settingsKey, setSettingsKey] =
    useState<keyof typeof PRESETS>("3x3 connect‑3");
  const [settings, setSettings] = useState<Settings>(PRESETS[settingsKey]);

  const [board, setBoard] = useState<Cell[][]>(
    makeBoard(settings.rows, settings.cols)
  );
  const [turn, setTurn] = useState<Player>("X");
  const [history, setHistory] = useState<MoveRecord[]>([]);

  const { winner, line } = useMemo(
    () => computeWinner(board, settings.connect),
    [board, settings.connect]
  );
  const draw = useMemo(() => !winner && isBoardFull(board), [winner, board]);

  // When preset changes, reset the board
  const applyPreset = (key: keyof typeof PRESETS) => {
    const s = PRESETS[key];
    setSettingsKey(key);
    setSettings(s);
    setBoard(makeBoard(s.rows, s.cols));
    setTurn("X");
    setHistory([]);
  };

  const reset = () => applyPreset(settingsKey);

  const onColumnClick = (col: number) => {
    if (winner || draw) return;
    const b = cloneBoard(board);
    const placedRow = dropInColumn(b, col, turn);
    if (placedRow === -1) return; // column full, ignore

    setBoard(b);
    setHistory([...history, { col, row: placedRow, player: turn }]);
    setTurn(turn === "X" ? "O" : "X");
  };

  const undo = () => {
    if (!history.length || winner) return;
    const last = history[history.length - 1];
    const b = cloneBoard(board);
    b[last.row][last.col] = "";
    setBoard(b);
    setHistory(history.slice(0, -1));
    setTurn(last.player); // give turn back
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center gap-6 p-6"
      style={{
        background: "linear-gradient(135deg, #e0e7ff 0%, #f0fdfa 100%)",
      }}
    >
      <div className="w-full max-w-2xl rounded-3xl shadow-2xl bg-white/90 p-8 flex flex-col items-center gap-6 border border-slate-200">
        <h1 className="text-3xl md:text-4xl font-extrabold text-blue-700 drop-shadow mb-2">
          Gravity Tic‑Tac‑Toe
        </h1>
        <p className="text-base text-gray-700 text-center max-w-xl mb-2">
          Click a <b className="text-blue-600">column</b> to drop your piece.
          Pieces fall to the{" "}
          <b className="text-emerald-600">lowest empty cell</b>. First to get{" "}
          <b className="text-yellow-600">{settings.connect} in a row</b> wins.
        </p>

        {/* Preset selector */}
        <div className="flex flex-wrap items-center gap-3 mb-2">
          {Object.keys(PRESETS).map((k) => (
            <button
              key={k}
              onClick={() => applyPreset(k as keyof typeof PRESETS)}
              className={`px-4 py-2 rounded-full font-semibold shadow transition-all duration-150 border-2 ${
                settingsKey === k
                  ? "bg-gradient-to-r from-blue-500 to-emerald-400 text-white border-blue-600 scale-105"
                  : "bg-white hover:bg-blue-50 text-blue-700 border-blue-200"
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Status & actions */}
        <div className="flex items-center gap-4 mb-2">
          {!winner && !draw && (
            <div className="px-4 py-2 rounded-full bg-blue-50 text-blue-700 font-semibold shadow">
              <span className="font-bold">Turn:</span> {turn}
            </div>
          )}
          {winner && (
            <div className="px-4 py-2 rounded-full bg-gradient-to-r from-yellow-300 to-yellow-500 text-yellow-900 font-bold shadow">
              Winner: {winner}
            </div>
          )}
          {draw && !winner && (
            <div className="px-4 py-2 rounded-full bg-gradient-to-r from-gray-200 to-gray-400 text-gray-700 font-bold shadow">
              Draw
            </div>
          )}
          <button
            onClick={undo}
            className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-blue-200 text-blue-700 font-semibold shadow transition-all duration-150"
          >
            Undo
          </button>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-emerald-200 text-emerald-700 font-semibold shadow transition-all duration-150"
          >
            Reset
          </button>
        </div>

        {/* Board */}
        <div
          className="rounded-2xl p-4 bg-gradient-to-br from-blue-100 via-white to-emerald-100 shadow-xl border border-slate-200"
          style={{ width: `min(90vw, ${settings.cols * 84}px)` }}
        >
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${settings.cols}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: settings.cols }, (_, c) => (
              <Column
                key={c}
                colIndex={c}
                rows={settings.rows}
                board={board}
                winningLine={line}
                onClick={() => onColumnClick(c)}
              />
            ))}
          </div>
        </div>

        {/* Move list */}
        <div className="w-full max-w-xl mt-4">
          <h3 className="font-bold mb-2 text-blue-700 text-lg">Moves</h3>
          <ol className="text-base list-decimal list-inside space-y-1 bg-slate-50 rounded-xl p-4 border border-slate-200 shadow">
            {history.map((m, i) => (
              <li key={i} className="text-gray-700">
                <span
                  className={`font-bold ${
                    m.player === "X" ? "text-blue-700" : "text-emerald-700"
                  }`}
                >
                  {m.player}
                </span>{" "}
                → column{" "}
                <span className="font-mono text-blue-600">{m.col + 1}</span>{" "}
                (row{" "}
                <span className="font-mono text-emerald-600">
                  {settings.rows - m.row}
                </span>
                )
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// ---------------- UI Pieces ----------------

function Column({
  colIndex,
  rows,
  board,
  winningLine,
  onClick,
}: {
  colIndex: number;
  rows: number;
  board: Cell[][];
  winningLine: [number, number][];
  onClick: () => void;
}) {
  // Determine which rows in this column are part of a winning line
  const winCells = new Set(winningLine.map(([r, c]) => `${r},${c}`));

  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-3 group focus:outline-none"
      title={`Drop in column ${colIndex + 1}`}
      style={{ minWidth: 0 }}
    >
      {Array.from({ length: rows }, (_, rr) => {
        const r = rr; // top to bottom render
        const val = board[r][colIndex];
        const isWin = winCells.has(`${r},${colIndex}`);
        return (
          <div
            key={r}
            className={`h-20 w-20 rounded-full flex items-center justify-center border-4 shadow-lg transition-all duration-150 cursor-pointer
              ${
                val
                  ? val === "X"
                    ? "bg-gradient-to-br from-blue-200 via-white to-blue-400 border-blue-500 text-blue-700 font-extrabold"
                    : "bg-gradient-to-br from-emerald-200 via-white to-emerald-400 border-emerald-500 text-emerald-700 font-extrabold"
                  : "bg-white border-slate-300 text-slate-400"
              }
              ${
                isWin
                  ? "ring-8 ring-yellow-400 scale-110 z-10"
                  : "group-hover:scale-105 group-active:scale-95"
              }
              `}
            style={{
              boxShadow: isWin
                ? "0 0 0 6px #fde047, 0 2px 8px rgba(0,0,0,0.08)"
                : "0 2px 8px rgba(0,0,0,0.08)",
            }}
          >
            <span className="text-4xl select-none drop-shadow">
              {val || ""}
            </span>
          </div>
        );
      })}
    </button>
  );
}
