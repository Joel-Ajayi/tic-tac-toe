export type Player = "X" | "O";

export interface Move {
  id: number; // 1-based move id for display
  player: Player; // 'X' or 'O'
  a: number; // first square index (0..8)
  b: number; // second square index (0..8), a !== b
  resolved?: number; // if collapsed, which index (0..8) became the final square
}
