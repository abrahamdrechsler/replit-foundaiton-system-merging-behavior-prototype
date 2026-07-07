// Basic geometric types
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Room representation
export interface Room {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

// Drawing state types
export type DrawState = "idle" | "drawing" | "moving";
