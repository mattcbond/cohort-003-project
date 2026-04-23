import { db } from "~/db";
import { xpEvents, streakActivities } from "~/db/schema";

export function awardLessonXp(userId: number, lessonId: number) {
  db.insert(xpEvents)
    .values({ userId, amount: 10, sourceType: "lesson", sourceId: lessonId })
    .onConflictDoNothing()
    .run();
}

export function awardQuizXp(userId: number, quizId: number) {
  db.insert(xpEvents)
    .values({ userId, amount: 5, sourceType: "quiz", sourceId: quizId })
    .onConflictDoNothing()
    .run();
}

export function recordStreakActivity(userId: number, utcDate?: string) {
  const date = utcDate ?? new Date().toISOString().slice(0, 10);
  db.insert(streakActivities)
    .values({ userId, utcDate: date })
    .onConflictDoNothing()
    .run();
}
