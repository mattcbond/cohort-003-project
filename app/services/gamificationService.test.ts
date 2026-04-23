import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import { awardLessonXp, awardQuizXp, recordStreakActivity, getGamificationStats } from "./gamificationService";

describe("gamificationService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("awardLessonXp", () => {
    it("inserts a 10 XP row for a lesson completion", () => {
      awardLessonXp(base.user.id, 42);

      const events = testDb.select().from(schema.xpEvents).all();
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe(base.user.id);
      expect(events[0].amount).toBe(10);
      expect(events[0].sourceType).toBe("lesson");
      expect(events[0].sourceId).toBe(42);
    });

    it("is idempotent — awarding XP twice for the same lesson inserts only one row", () => {
      awardLessonXp(base.user.id, 42);
      awardLessonXp(base.user.id, 42);

      const events = testDb.select().from(schema.xpEvents).all();
      expect(events).toHaveLength(1);
    });

    it("awards XP separately for different lessons", () => {
      awardLessonXp(base.user.id, 1);
      awardLessonXp(base.user.id, 2);

      const events = testDb.select().from(schema.xpEvents).all();
      expect(events).toHaveLength(2);
    });
  });

  describe("recordStreakActivity", () => {
    it("inserts a streak activity row for the given UTC date", () => {
      recordStreakActivity(base.user.id, "2026-04-23");

      const rows = testDb.select().from(schema.streakActivities).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(base.user.id);
      expect(rows[0].utcDate).toBe("2026-04-23");
    });

    it("is idempotent — recording the same day twice inserts only one row", () => {
      recordStreakActivity(base.user.id, "2026-04-23");
      recordStreakActivity(base.user.id, "2026-04-23");

      const rows = testDb.select().from(schema.streakActivities).all();
      expect(rows).toHaveLength(1);
    });

    it("records different days as separate rows", () => {
      recordStreakActivity(base.user.id, "2026-04-22");
      recordStreakActivity(base.user.id, "2026-04-23");

      const rows = testDb.select().from(schema.streakActivities).all();
      expect(rows).toHaveLength(2);
    });

    it("defaults to today's UTC date when no date is provided", () => {
      const todayUtc = new Date().toISOString().slice(0, 10);
      recordStreakActivity(base.user.id);

      const rows = testDb.select().from(schema.streakActivities).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].utcDate).toBe(todayUtc);
    });
  });

  describe("awardQuizXp", () => {
    it("inserts a 5 XP row for a first-pass quiz completion", () => {
      awardQuizXp(base.user.id, 99);

      const events = testDb.select().from(schema.xpEvents).all();
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe(base.user.id);
      expect(events[0].amount).toBe(5);
      expect(events[0].sourceType).toBe("quiz");
      expect(events[0].sourceId).toBe(99);
    });

    it("is idempotent — awarding quiz XP twice inserts only one row", () => {
      awardQuizXp(base.user.id, 99);
      awardQuizXp(base.user.id, 99);

      const events = testDb.select().from(schema.xpEvents).all();
      expect(events).toHaveLength(1);
    });

    it("awards XP separately for different quizzes", () => {
      awardQuizXp(base.user.id, 1);
      awardQuizXp(base.user.id, 2);

      const events = testDb.select().from(schema.xpEvents).all();
      expect(events).toHaveLength(2);
    });

    it("does not interfere with lesson XP events", () => {
      awardLessonXp(base.user.id, 10);
      awardQuizXp(base.user.id, 10);

      const events = testDb.select().from(schema.xpEvents).all();
      expect(events).toHaveLength(2);
      expect(events.find((e) => e.sourceType === "lesson")).toBeDefined();
      expect(events.find((e) => e.sourceType === "quiz")).toBeDefined();
    });
  });

  describe("getGamificationStats", () => {
    it("returns zero values for a user with no activity", () => {
      const stats = getGamificationStats(base.user.id);
      expect(stats.totalXp).toBe(0);
      expect(stats.level).toBe(1);
      expect(stats.currentLevelXp).toBe(0);
      expect(stats.nextLevelXp).toBe(80);
      expect(stats.currentStreak).toBe(0);
      expect(stats.longestStreak).toBe(0);
    });

    it("sums XP from all events", () => {
      awardLessonXp(base.user.id, 1);
      awardLessonXp(base.user.id, 2);
      awardQuizXp(base.user.id, 10);

      const stats = getGamificationStats(base.user.id);
      expect(stats.totalXp).toBe(25); // 10 + 10 + 5
    });

    it("derives level from total XP using computeLevel", () => {
      // Award 80 XP to reach level 2
      for (let i = 1; i <= 8; i++) {
        awardLessonXp(base.user.id, i); // 8 × 10 = 80 XP
      }

      const stats = getGamificationStats(base.user.id);
      expect(stats.totalXp).toBe(80);
      expect(stats.level).toBe(2);
      expect(stats.currentLevelXp).toBe(0);
    });

    it("counts current streak from today's activity", () => {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      recordStreakActivity(base.user.id, yesterday);
      recordStreakActivity(base.user.id, today);

      const stats = getGamificationStats(base.user.id);
      expect(stats.currentStreak).toBe(2);
    });

    it("counts streak from yesterday if no activity today", () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

      recordStreakActivity(base.user.id, twoDaysAgo);
      recordStreakActivity(base.user.id, yesterday);

      const stats = getGamificationStats(base.user.id);
      expect(stats.currentStreak).toBe(2);
    });

    it("returns streak 0 when last activity was 2+ days ago", () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

      recordStreakActivity(base.user.id, twoDaysAgo);

      const stats = getGamificationStats(base.user.id);
      expect(stats.currentStreak).toBe(0);
    });

    it("tracks longest streak across multiple runs", () => {
      // Run 1: 3 consecutive days (well in the past)
      recordStreakActivity(base.user.id, "2026-01-01");
      recordStreakActivity(base.user.id, "2026-01-02");
      recordStreakActivity(base.user.id, "2026-01-03");
      // Gap
      // Run 2: 2 consecutive days
      recordStreakActivity(base.user.id, "2026-01-10");
      recordStreakActivity(base.user.id, "2026-01-11");

      const stats = getGamificationStats(base.user.id);
      expect(stats.longestStreak).toBe(3);
    });
  });
});
