import type { Spark } from "../engine/types";

// The one place that says what each spark looks like. Change colours and
// shapes here; src/game/dominoDrawing.ts draws whatever this table names.
export type SparkShape = "circle" | "wave" | "triangle" | "diamond" | "ring" | "blot";

export const SPARK_STYLE: Record<Spark, { color: number; shape: SparkShape }> = {
  Ember: { color: 0xff6a13, shape: "circle" },
  Tide: { color: 0x2f80ed, shape: "wave" },
  Gale: { color: 0x4cc46a, shape: "triangle" },
  Storm: { color: 0xf2c200, shape: "diamond" },
  Void: { color: 0x7b3fc4, shape: "ring" },
  Rot: { color: 0x8a6d3b, shape: "blot" },
};

export const SPARK_ORDER: Spark[] = ["Ember", "Tide", "Gale", "Storm", "Void", "Rot"];
