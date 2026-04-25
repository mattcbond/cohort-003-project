import { eq, sum } from "drizzle-orm";
import { db } from "~/db";
import { xpEvents, streakActivities } from "~/db/schema";
import { computeLevel } from "~/lib/leveling";

export function awardLessonXp(userId: number, lessonId: number) {
  db.insert(xpEvents)
    .values({ userId, amount: 10, sourceType: "lesson_complete", sourceId: lessonId })
    .onConflictDoNothing()
    .run();
}

export function awardQuizXp(userId: number, quizId: number) {
  db.insert(xpEvents)
    .values({ userId, amount: 5, sourceType: "quiz_pass", sourceId: quizId })
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

export function getGamificationStats(userId: number) {
  const xpResult = db
    .select({ total: sum(xpEvents.amount) })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId))
    .get();

  const totalXp = Number(xpResult?.total ?? 0);
  const { level, currentLevelXp, nextLevelXp } = computeLevel(totalXp);

  const dates = db
    .select({ utcDate: streakActivities.utcDate })
    .from(streakActivities)
    .where(eq(streakActivities.userId, userId))
    .all()
    .map((r) => r.utcDate)
    .sort();

  const { currentStreak, longestStreak } = computeStreaks(dates);

  return { totalXp, level, currentLevelXp, nextLevelXp, currentStreak, longestStreak };
}

function computeStreaks(sortedDates: string[]): { currentStreak: number; longestStreak: number } {
  if (sortedDates.length === 0) return { currentStreak: 0, longestStreak: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const lastActivity = sortedDates[sortedDates.length - 1];

  // Streak is alive only if last activity was today or yesterday
  let currentStreak = 0;
  if (lastActivity === today || lastActivity === yesterday) {
    // Walk backwards from lastActivity counting consecutive days
    let streak = 1;
    for (let i = sortedDates.length - 2; i >= 0; i--) {
      const expected = subtractDays(sortedDates[i + 1], 1);
      if (sortedDates[i] === expected) {
        streak++;
      } else {
        break;
      }
    }
    currentStreak = streak;
  }

  // Longest streak: scan all dates for longest consecutive run
  let longestStreak = 1;
  let runLength = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    if (sortedDates[i] === addDays(sortedDates[i - 1], 1)) {
      runLength++;
      if (runLength > longestStreak) longestStreak = runLength;
    } else {
      runLength = 1;
    }
  }

  return { currentStreak, longestStreak };
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
