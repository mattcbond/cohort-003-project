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

import { completeLessonForStudent } from "./lessonCompletionService";
import { isLessonCompleted } from "./progressService";
import { getTotalXp } from "./xpService";
import { getStreakData } from "./streakService";

function seedLesson(moduleId: number, position = 1) {
  return testDb
    .insert(schema.lessons)
    .values({ moduleId, title: `Lesson ${position}`, position })
    .returning()
    .get();
}

function seedModule(courseId: number, title = "Module 1", position = 1) {
  return testDb
    .insert(schema.modules)
    .values({ courseId, title, position })
    .returning()
    .get();
}

describe("completeLessonForStudent", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  it("marks the lesson complete, awards 10 XP, and records a streak", () => {
    const mod = seedModule(base.course.id);
    const lesson = seedLesson(mod.id);

    completeLessonForStudent(base.user.id, lesson.id);

    expect(isLessonCompleted(base.user.id, lesson.id)).toBe(true);
    expect(getTotalXp(base.user.id)).toBe(10);
    expect(getStreakData(base.user.id).currentStreak).toBe(1);
  });

  it("idempotent: re-completing returns early with 0 XP and no duplicate event", () => {
    const mod = seedModule(base.course.id);
    const lesson = seedLesson(mod.id);

    completeLessonForStudent(base.user.id, lesson.id);
    const result = completeLessonForStudent(base.user.id, lesson.id, { idempotent: true });

    expect(result.xpAwarded).toBe(0);
    expect(getTotalXp(base.user.id)).toBe(10); // still only 10, not 20
  });

  it("skipXp: marks complete and records streak but awards no XP", () => {
    const mod = seedModule(base.course.id);
    const lesson = seedLesson(mod.id);

    completeLessonForStudent(base.user.id, lesson.id, { skipXp: true });

    expect(isLessonCompleted(base.user.id, lesson.id)).toBe(true);
    expect(getTotalXp(base.user.id)).toBe(0);
    expect(getStreakData(base.user.id).currentStreak).toBe(1);
  });

  it("skipStreak: marks complete and awards XP but does not record streak", () => {
    const mod = seedModule(base.course.id);
    const lesson = seedLesson(mod.id);

    completeLessonForStudent(base.user.id, lesson.id, { skipStreak: true });

    expect(isLessonCompleted(base.user.id, lesson.id)).toBe(true);
    expect(getTotalXp(base.user.id)).toBe(10);
    expect(getStreakData(base.user.id).currentStreak).toBe(0);
  });

  it("populates moduleCompletion when the last lesson in a module is completed", () => {
    const mod = seedModule(base.course.id, "Intro Module");
    const l1 = seedLesson(mod.id, 1);
    const l2 = seedLesson(mod.id, 2);
    const l3 = seedLesson(mod.id, 3);

    completeLessonForStudent(base.user.id, l1.id);
    completeLessonForStudent(base.user.id, l2.id);
    const result = completeLessonForStudent(base.user.id, l3.id);

    expect(result.moduleCompletion).not.toBeNull();
    expect(result.moduleCompletion!.moduleTitle).toBe("Intro Module");
    expect(result.moduleCompletion!.totalXp).toBe(30); // 3 lessons × 10
    expect(result.moduleCompletion!.moduleId).toBe(mod.id);
  });

  it("returns null moduleCompletion when not all lessons in the module are done", () => {
    const mod = seedModule(base.course.id);
    const l1 = seedLesson(mod.id, 1);
    seedLesson(mod.id, 2); // l2 intentionally left incomplete

    const result = completeLessonForStudent(base.user.id, l1.id);

    expect(result.moduleCompletion).toBeNull();
  });
});
