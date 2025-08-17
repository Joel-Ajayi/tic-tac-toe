"use client";

import Image from "next/image";

import { Move, Player } from "../types";
import { useMemo, useState } from "react";

// Winning triplets on a 3x3 board
const WIN_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // cols
  [0, 4, 8],
  [2, 4, 6], // diagonals
];

// Utility to show subscript numbers for move ids (optional nicety)
const toSubscript = (n: number) =>
  String(n).replace(/[0-9]/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[parseInt(d, 10)]);

// ------------------------------ Main Component ------------------------------

export default function QuantumTicTacToePage() {
  // classical[i] = '' | 'X' | 'O' (finalized marks only)
  const [classical, setClassical] = useState<(Player | "")[]>(
    Array(9).fill("")
  );
  // all moves (unresolved + resolved)
  const [moves, setMoves] = useState<Move[]>([]);
  // current player
  const [turn, setTurn] = useState<Player>("X");
  // UI selection for placing a quantum move (choose two squares)
  const [selection, setSelection] = useState<number[]>([]);
  // Pending collapse state when a loop is closed
  const [pendingCollapse, setPendingCollapse] = useState<{
    cycleMoveIds: number[]; // move ids (edges) in the entangled cycle component
    closerMoveId: number; // the newly added move that closed the loop
    choiceSquares: [number, number]; // the two options for the closer's move
    chooser: Player; // who chooses (opponent of closer)
  } | null>(null);

  // Winner detection (on classical board only)
  const winner: Player | "Draw" | null = useMemo(() => {
    for (const [a, b, c] of WIN_LINES) {
      const v = classical[a];
      if (v && v === classical[b] && v === classical[c]) return v as Player;
    }
    if (classical.every((v) => v)) return "Draw";
    return null;
  }, [classical]);

  // Derived: unresolved moves only (no resolved square yet)
  const unresolvedMoves = useMemo(
    () => moves.filter((m) => m.resolved === undefined),
    [moves]
  );

  // For rendering ghost marks per cell: list of (player, id) for unresolved moves that touch the cell
  const ghostsByCell = useMemo(() => {
    const ghosts: { player: Player; id: number }[][] = Array.from(
      { length: 9 },
      () => []
    );
    for (const m of unresolvedMoves) {
      ghosts[m.a].push({ player: m.player, id: m.id });
      ghosts[m.b].push({ player: m.player, id: m.id });
    }
    return ghosts;
  }, [unresolvedMoves]);

  // Helper: can a cell be used for a quantum move? (must not be classical)
  const isPlayableCell = (idx: number) => classical[idx] === "";

  // Handle click on a cell to build a two-cell selection
  const onCellClick = (idx: number) => {
    if (winner || pendingCollapse) return; // lock UI during collapse
    if (!isPlayableCell(idx)) return; // cannot select classical squares

    setSelection((prev) => {
      if (prev.includes(idx)) {
        // unselect if clicked again
        return prev.filter((v) => v !== idx);
      }
      if (prev.length === 2) return prev; // already have two
      return [...prev, idx];
    });
  };

  // Commit a quantum move with current selection
  const placeQuantum = () => {
    if (winner || pendingCollapse) return;
    if (selection.length !== 2) return;
    const [a, b] = selection;
    if (a === b) return;

    // Build the new move
    const newMove: Move = { id: moves.length + 1, player: turn, a, b };

    // Determine if this new edge closes a cycle in the unresolved graph
    const { cycleMoveIds } = detectCycleAfterAddingEdge(
      unresolvedMoves,
      newMove
    );

    // Update moves state (add unresolved move)
    const nextMoves = [...moves, newMove];
    setMoves(nextMoves);

    if (cycleMoveIds.length > 0) {
      // Loop closed → set pending collapse, opponent chooses surviving square for the closer's move
      const opponent: Player = turn === "X" ? "O" : "X";
      setPendingCollapse({
        cycleMoveIds,
        closerMoveId: newMove.id,
        choiceSquares: [a, b],
        chooser: opponent,
      });
    } else {
      // No collapse → just switch turn
      setTurn(turn === "X" ? "O" : "X");
    }

    // Clear selection
    setSelection([]);
  };

  // Handle the opponent's choice for the closer move's surviving square, then propagate collapse
  const resolveCollapse = (chosenSquare: number) => {
    if (!pendingCollapse) return;

    // Start with current moves/classical (use local copies to mutate then push to state)
    const nextMoves = [...moves];
    const nextClassical = [...classical] as (Player | "")[];

    // Collapse propagation queue: tuples of (moveId, chosenSquare)
    const queue: Array<{ moveId: number; chosen: number }> = [
      { moveId: pendingCollapse.closerMoveId, chosen: chosenSquare },
    ];

    // Helper to fetch move by id (1-based)
    const getMove = (id: number) => nextMoves[id - 1];

    // Propagate until fixed point
    while (queue.length) {
      const { moveId, chosen } = queue.shift()!;
      const m = getMove(moveId);
      if (!m || m.resolved !== undefined) continue;

      // Set resolution for this move
      m.resolved = chosen;
      nextClassical[chosen] = m.player;

      // Any OTHER unresolved move that included the chosen cell must resolve to its other cell
      for (const other of nextMoves) {
        if (!other || other.resolved !== undefined) continue;
        if (other.id === m.id) continue;
        if (other.a === chosen || other.b === chosen) {
          const forced = other.a === chosen ? other.b : other.a;
          // If forced cell is already classical with someone else, this move will be impossible —
          // but on a valid entangled cycle, forced cell should be free. Still, we guard:
          if (!nextClassical[forced]) {
            queue.push({ moveId: other.id, chosen: forced });
          }
        }
      }
    }

    // Clean up: remove any unresolved move that now touches a classical cell (it should've been resolved)
    for (const m of nextMoves) {
      if (
        m.resolved === undefined &&
        (nextClassical[m.a] || nextClassical[m.b])
      ) {
        // If one endpoint is classical, force resolve to the other endpoint if possible
        const forced = nextClassical[m.a] ? m.b : m.a;
        if (!nextClassical[forced]) {
          m.resolved = forced;
          nextClassical[forced] = m.player;
        }
      }
    }

    setMoves(nextMoves);
    setClassical(nextClassical);
    setPendingCollapse(null);

    // After collapse, check winner and switch turn if no winner
    const w = computeWinner(nextClassical);
    if (!w) setTurn(turn === "X" ? "O" : "X");
  };

  // Reset the game
  const reset = () => {
    setClassical(Array(9).fill(""));
    setMoves([]);
    setTurn("X");
    setSelection([]);
    setPendingCollapse(null);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-start gap-8 p-6 bg-gradient-to-br from-blue-50 via-white to-emerald-50 font-sans">
      <h1 className="text-3xl md:text-4xl font-extrabold text-blue-700 drop-shadow mb-2">
        Quantum Tic‑Tac‑Toe
      </h1>
      <p className="text-base text-gray-700 max-w-xl text-center mb-2">
        Each turn, place your mark in <b className="text-blue-700">two</b> empty
        squares — these are ghost moves (
        <span className="text-blue-600 font-bold">X₁</span>,{" "}
        <span className="text-emerald-600 font-bold">O₂</span>…). If your move
        closes a <b className="text-emerald-700">loop</b>, a{" "}
        <b className="text-blue-700">collapse</b> happens: the opponent chooses
        which square survives for your move, then the rest auto‑resolve. First
        to get three <b className="text-blue-700">classical</b> marks in a row
        wins.
      </p>

      {/* Status Bar */}
      <div className="flex items-center gap-4">
        {!winner && !pendingCollapse && (
          <div className="px-4 py-2 rounded-full bg-blue-100 text-blue-800 font-semibold shadow">
            <span className="font-bold">Turn:</span> {turn}
          </div>
        )}
        {winner && (
          <div className="px-4 py-2 rounded-full bg-emerald-200 text-emerald-900 font-bold shadow">
            {winner === "Draw" ? "Draw!" : `Winner: ${winner}`}
          </div>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-blue-200 text-gray-700 font-semibold shadow transition"
        >
          Reset
        </button>
      </div>

      {/* Board */}
      <div className="grid grid-cols-3 gap-3 bg-white rounded-2xl p-4 shadow-lg border border-blue-100">
        {Array.from({ length: 9 }, (_, i) => (
          <Cell
            key={i}
            idx={i}
            classical={classical[i]}
            ghosts={ghostsByCell[i]}
            selected={selection.includes(i)}
            disabled={!!winner || !!pendingCollapse}
            onClick={() => onCellClick(i)}
          />
        ))}
      </div>

      {/* Controls for placing a quantum move */}
      <div className="flex items-center gap-4 mt-2">
        <div className="text-base text-gray-700">
          Selected:{" "}
          <span className="font-bold text-blue-700">
            {selection.map((i) => i + 1).join(", ") || "—"}
          </span>
        </div>
        <button
          onClick={placeQuantum}
          disabled={selection.length !== 2 || !!winner || !!pendingCollapse}
          className={`px-5 py-2 rounded-lg font-bold shadow transition ${
            selection.length === 2 && !winner && !pendingCollapse
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-200 text-gray-400"
          }`}
        >
          Place Quantum Move
        </button>
      </div>

      {/* Collapse choice modal */}
      {pendingCollapse && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-blue-200">
            <h2 className="text-xl font-bold mb-2 text-blue-700">
              Collapse triggered!
            </h2>
            <p className="text-base mb-4 text-gray-700">
              Loop closed by <b>move #{pendingCollapse.closerMoveId}</b> (
              <span
                className={turn === "X" ? "text-blue-700" : "text-emerald-700"}
              >
                {turn}
              </span>
              ). According to our fairness rule, the <b>opponent</b> (
              <span
                className={
                  pendingCollapse.chooser === "X"
                    ? "text-blue-700"
                    : "text-emerald-700"
                }
              >
                {pendingCollapse.chooser}
              </span>
              ) chooses which square survives for that move.
            </p>
            <div className="flex gap-4">
              {pendingCollapse.choiceSquares.map((sq) => (
                <button
                  key={sq}
                  onClick={() => resolveCollapse(sq)}
                  className="flex-1 border-2 border-blue-300 rounded-xl p-4 hover:bg-blue-50 font-bold text-lg transition"
                >
                  Place move #{pendingCollapse.closerMoveId} at
                  <div className="text-3xl font-extrabold mt-2 text-blue-700">
                    {cellLabel(sq)}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              After this choice, the rest of the entangled moves auto‑resolve by
              propagation.
            </p>
          </div>
        </div>
      )}

      {/* Move log */}
      <div className="w-full max-w-xl mt-6">
        <h3 className="font-bold mb-2 text-blue-700">Moves</h3>
        <ol className="text-base list-decimal list-inside space-y-1">
          {moves.map((m) => (
            <li key={m.id}>
              <span
                className={
                  m.player === "X"
                    ? "text-blue-700 font-bold"
                    : "text-emerald-700 font-bold"
                }
              >
                {m.player}
                {m.id}
              </span>
              : {cellLabel(m.a)} & {cellLabel(m.b)}{" "}
              {m.resolved !== undefined && (
                <span className="text-gray-600">
                  → final at{" "}
                  <span className="font-bold text-blue-700">
                    {cellLabel(m.resolved)}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ------------------------------ UI Pieces ------------------------------

function Cell({
  idx,
  classical,
  ghosts,
  selected,
  disabled,
  onClick,
}: {
  idx: number;
  classical: Player | "";
  ghosts: { player: Player; id: number }[];
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || !!classical}
      className={`w-24 h-24 md:w-28 md:h-28 rounded-2xl border-2 flex flex-col items-center justify-center relative transition-all duration-150
        ${
          classical
            ? "bg-gradient-to-br from-blue-100 to-emerald-100 shadow-lg border-blue-400"
            : selected
            ? "bg-blue-50 border-blue-400"
            : "bg-gray-50 border-gray-300"
        }
        ${
          disabled
            ? "opacity-60 cursor-not-allowed"
            : "hover:bg-blue-100 hover:border-blue-400 cursor-pointer"
        }
      `}
    >
      {/* Classical mark (big) */}
      {classical ? (
        <span
          className={`text-5xl font-extrabold drop-shadow ${
            classical === "X" ? "text-blue-700" : "text-emerald-700"
          }`}
        >
          {classical}
        </span>
      ) : (
        // Ghost marks (tiny badges)
        <div className="flex flex-wrap gap-1 px-1 justify-center">
          {ghosts.map((g) => (
            <span
              key={`${g.player}${g.id}`}
              className={`text-xs px-2 py-0.5 rounded-full border-2 font-bold shadow
                ${
                  g.player === "X"
                    ? "border-blue-600 text-blue-700 bg-blue-50"
                    : "border-emerald-600 text-emerald-700 bg-emerald-50"
                }
              `}
              title={`Ghost ${g.player}${g.id}`}
            >
              {g.player}
              {toSubscript(g.id)}
            </span>
          ))}
        </div>
      )}
      {/* Cell label bottom-right */}
      <span className="absolute bottom-1 right-2 text-[11px] text-gray-400 font-mono">
        {cellLabel(idx)}
      </span>
    </button>
  );
}

// Human-readable cell labels (1..9)
function cellLabel(i: number) {
  return `${i + 1}`; // simple 1-based numbering for clarity
}

// ------------------------------ Game Logic Helpers ------------------------------

function computeWinner(classical: (Player | "")[]): Player | "Draw" | null {
  for (const [a, b, c] of WIN_LINES) {
    const v = classical[a];
    if (v && v === classical[b] && v === classical[c]) return v as Player;
  }
  if (classical.every((v) => v)) return "Draw";
  return null;
}

/**
 * Detect if adding newMove (edge a-b) to the graph of unresolved moves closes a cycle.
 * Returns the move ids in the cycle component (including the new move) or [] if none.
 *
 * We model a small undirected graph with nodes 0..8 and edges for each unresolved move.
 * A cycle exists if there is already a path between a and b before adding the new edge.
 */
function detectCycleAfterAddingEdge(
  unresolved: Move[],
  newMove: Move
): { cycleMoveIds: number[] } {
  const { a, b } = newMove;

  // Build adjacency: node -> list of neighbor nodes
  const adj: number[][] = Array.from({ length: 9 }, () => []);
  // Edge map to recover which move creates which edge (unordered key "min-max")
  const edgeToMoveId = new Map<string, number>();

  for (const m of unresolved) {
    adj[m.a].push(m.b);
    adj[m.b].push(m.a);
    edgeToMoveId.set(edgeKey(m.a, m.b), m.id);
  }

  // Find path from a to b in the existing graph (without the new edge)
  const path = bfsPath(a, b, adj);
  if (!path) return { cycleMoveIds: [] };

  // Convert node path to edge list, map to move ids, and include the new edge at the end
  const moveIds: number[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const k = edgeKey(path[i], path[i + 1]);
    const mid = edgeToMoveId.get(k);
    if (mid) moveIds.push(mid);
  }
  moveIds.push(newMove.id);

  return { cycleMoveIds: moveIds };
}

function edgeKey(u: number, v: number) {
  return u < v ? `${u}-${v}` : `${v}-${u}`;
}

function bfsPath(
  start: number,
  goal: number,
  adj: number[][]
): number[] | null {
  const q: number[] = [start];
  const prev = new Map<number, number | null>();
  prev.set(start, null);

  while (q.length) {
    const u = q.shift()!;
    if (u === goal) break;
    for (const v of adj[u]) {
      if (!prev.has(v)) {
        prev.set(v, u);
        q.push(v);
      }
    }
  }

  if (!prev.has(goal)) return null;

  // Reconstruct path
  const path: number[] = [];
  for (let at: number | null = goal; at !== null; at = prev.get(at) ?? null) {
    path.push(at);
  }
  path.reverse();
  return path;
}
