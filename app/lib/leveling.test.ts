import { describe, it, expect } from "vitest";
import { xpForLevel, computeLevel } from "./leveling";

describe("xpForLevel", () => {
  it("level 1 requires 80 XP (1→2)", () => {
    expect(xpForLevel(1)).toBe(80);
  });

  it("level 2 requires ~197 XP (2→3)", () => {
    expect(xpForLevel(2)).toBe(197);
  });

  it("level 3 requires correct XP (3→4)", () => {
    // round(80 * 3^1.3)
    expect(xpForLevel(3)).toBe(Math.round(80 * Math.pow(3, 1.3)));
  });

  it("is monotonically increasing", () => {
    for (let n = 1; n < 20; n++) {
      expect(xpForLevel(n + 1)).toBeGreaterThan(xpForLevel(n));
    }
  });
});

describe("computeLevel", () => {
  it("returns level 1 with 0 XP", () => {
    const result = computeLevel(0);
    expect(result.level).toBe(1);
    expect(result.currentLevelXp).toBe(0);
    expect(result.nextLevelXp).toBe(80);
  });

  it("returns level 1 just before threshold", () => {
    const result = computeLevel(79);
    expect(result.level).toBe(1);
    expect(result.currentLevelXp).toBe(79);
    expect(result.nextLevelXp).toBe(80);
  });

  it("reaches level 2 at exactly 80 XP", () => {
    const result = computeLevel(80);
    expect(result.level).toBe(2);
    expect(result.currentLevelXp).toBe(0);
    expect(result.nextLevelXp).toBe(xpForLevel(2));
  });

  it("returns correct progress mid-level 2", () => {
    const result = computeLevel(130);
    expect(result.level).toBe(2);
    expect(result.currentLevelXp).toBe(50); // 130 - 80
    expect(result.nextLevelXp).toBe(xpForLevel(2));
  });

  it("reaches level 3 at 80 + 197 = 277 XP", () => {
    const totalToLevel3 = xpForLevel(1) + xpForLevel(2);
    const result = computeLevel(totalToLevel3);
    expect(result.level).toBe(3);
    expect(result.currentLevelXp).toBe(0);
    expect(result.nextLevelXp).toBe(xpForLevel(3));
  });

  it("currentLevelXp + xpSpentOnPriorLevels reconstructs totalXp", () => {
    const testValues = [0, 50, 80, 150, 277, 500, 1000, 5000];

    for (const totalXp of testValues) {
      const { level, currentLevelXp } = computeLevel(totalXp);

      // Sum XP spent on all prior levels
      let xpSpent = 0;
      for (let lvl = 1; lvl < level; lvl++) {
        xpSpent += xpForLevel(lvl);
      }

      expect(xpSpent + currentLevelXp).toBe(totalXp);
    }
  });

  it("level increases as XP crosses each threshold", () => {
    // XP to reach each level is the cumulative sum of xpForLevel(1..n-1)
    const thresholds = [1, 2, 3, 4, 5].map((targetLevel) => {
      let total = 0;
      for (let lvl = 1; lvl < targetLevel; lvl++) {
        total += xpForLevel(lvl);
      }
      return total;
    });

    for (let i = 1; i < thresholds.length; i++) {
      const lowerLevel = computeLevel(thresholds[i] - 1).level;
      const higherLevel = computeLevel(thresholds[i]).level;
      expect(higherLevel).toBeGreaterThan(lowerLevel);
    }
  });
});
