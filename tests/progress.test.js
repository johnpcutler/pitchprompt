import { describe, expect, it } from "vitest";
import { computeProgress } from "../src/domain/progress.js";

describe("computeProgress", () => {
  it("computes totals, filled count, and percent", () => {
    const slotOrder = ["A", "B", "C"];
    const answers = { A: "one", B: " ", C: "three" };
    const result = computeProgress(slotOrder, answers);
    expect(result).toEqual({ total: 3, filled: 2, percent: 67 });
  });

  it("handles empty slot order", () => {
    expect(computeProgress([], {})).toEqual({ total: 0, filled: 0, percent: 0 });
  });
});
