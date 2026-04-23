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

import { awardLessonXp, awardQuizXp, recordStreakActivity } from "./gamificationService";

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
});
