import { eq, sql, inArray } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";

// ─── Rating Service ───
// Handles course star ratings (1-5). One rating per user per course.

export function getCourseAverageRating(courseId: number) {
  const result = db
    .select({
      average: sql<number>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  return {
    average: result?.average ?? null,
    count: result?.count ?? 0,
  };
}

export function getCourseAverageRatingsBatch(courseIds: number[]) {
  if (courseIds.length === 0) return new Map<number, { average: number; count: number }>();

  const results = db
    .select({
      courseId: courseRatings.courseId,
      average: sql<number>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();

  return new Map(results.map((r) => [r.courseId, { average: r.average, count: r.count }]));
}

export function getUserRatingForCourse(userId: number, courseId: number) {
  const result = db
    .select({ rating: courseRatings.rating })
    .from(courseRatings)
    .where(
      sql`${courseRatings.userId} = ${userId} AND ${courseRatings.courseId} = ${courseId}`
    )
    .get();

  return result?.rating ?? null;
}

export function upsertCourseRating(userId: number, courseId: number, rating: number) {
  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating })
    .onConflictDoUpdate({
      target: [courseRatings.userId, courseRatings.courseId],
      set: { rating },
    })
    .returning()
    .get();
}
