import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  purchases,
  enrollments,
  courseRatings,
  courses,
  users,
} from "~/db/schema";

// ─── Analytics Service ───
// Encapsulates all database query logic for the instructor analytics dashboard.
// Single primary function behind a clean interface; all aggregation happens here.

export type AnalyticsPeriod = "7d" | "30d" | "12mo" | "all";

export type TimePeriod = AnalyticsPeriod;

export type CourseAnalytics = {
  courseId: number;
  title: string;
  listPrice: number;
  revenue: number;
  salesCount: number;
  enrollmentCount: number;
  avgRating: number | null;
  ratingCount: number;
};

export type InstructorAnalytics = {
  summary: {
    totalRevenue: number;
    totalEnrollments: number;
    avgRating: number | null;
    ratingCount: number;
  };
  timeSeries: Array<{ date: string; revenue: number }>;
  courses: CourseAnalytics[];
};

// ─── Helpers ───

function getPeriodStartIso(period: AnalyticsPeriod, now: Date): string | null {
  if (period === "all") return null;
  const d = new Date(now);
  if (period === "7d") d.setDate(d.getDate() - 7);
  else if (period === "30d") d.setDate(d.getDate() - 30);
  else if (period === "12mo") d.setMonth(d.getMonth() - 12);
  return d.toISOString();
}

function getStartDate(period: TimePeriod): string | null {
  return getPeriodStartIso(period, new Date());
}

function isMonthlyGranularity(period: AnalyticsPeriod): boolean {
  return period === "12mo" || period === "all";
}

function generateDailyBuckets(start: Date, end: Date): string[] {
  const buckets: string[] = [];
  const current = new Date(start);
  current.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setUTCHours(0, 0, 0, 0);
  while (current <= endDay) {
    buckets.push(current.toISOString().substring(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return buckets;
}

function generateMonthlyBuckets(start: Date, end: Date): string[] {
  const buckets: string[] = [];
  const current = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
  );
  const endMonth = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)
  );
  while (current <= endMonth) {
    buckets.push(current.toISOString().substring(0, 7));
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return buckets;
}

// ─── Main Function ───

export function getInstructorAnalytics(
  instructorId: number,
  period: AnalyticsPeriod,
  now: Date = new Date()
): InstructorAnalytics {
  const instructorCourses = db
    .select()
    .from(courses)
    .where(eq(courses.instructorId, instructorId))
    .all();

  if (instructorCourses.length === 0) {
    return {
      summary: {
        totalRevenue: 0,
        totalEnrollments: 0,
        avgRating: null,
        ratingCount: 0,
      },
      timeSeries: [],
      courses: [],
    };
  }

  const courseIds = instructorCourses.map((c) => c.id);
  const periodStart = getPeriodStartIso(period, now);

  // ─── Fetch raw rows ───

  const purchaseRows = db
    .select()
    .from(purchases)
    .where(
      periodStart
        ? and(
            inArray(purchases.courseId, courseIds),
            gte(purchases.createdAt, periodStart)
          )
        : inArray(purchases.courseId, courseIds)
    )
    .all();

  const enrollmentRows = db
    .select()
    .from(enrollments)
    .where(
      periodStart
        ? and(
            inArray(enrollments.courseId, courseIds),
            gte(enrollments.enrolledAt, periodStart)
          )
        : inArray(enrollments.courseId, courseIds)
    )
    .all();

  const ratingRows = db
    .select()
    .from(courseRatings)
    .where(
      periodStart
        ? and(
            inArray(courseRatings.courseId, courseIds),
            gte(courseRatings.createdAt, periodStart)
          )
        : inArray(courseRatings.courseId, courseIds)
    )
    .all();

  // ─── Summary ───

  const totalRevenue = purchaseRows.reduce((sum, p) => sum + p.pricePaid, 0);
  const totalEnrollments = enrollmentRows.length;
  const ratingCount = ratingRows.length;
  const avgRating =
    ratingCount > 0
      ? ratingRows.reduce((sum, r) => sum + r.rating, 0) / ratingCount
      : null;

  // ─── Per-course breakdown ───

  const courseBreakdown: CourseAnalytics[] = instructorCourses.map((course) => {
    const cp = purchaseRows.filter((p) => p.courseId === course.id);
    const ce = enrollmentRows.filter((e) => e.courseId === course.id);
    const cr = ratingRows.filter((r) => r.courseId === course.id);
    const crCount = cr.length;

    return {
      courseId: course.id,
      title: course.title,
      listPrice: course.price,
      revenue: cp.reduce((sum, p) => sum + p.pricePaid, 0),
      salesCount: cp.length,
      enrollmentCount: ce.length,
      avgRating:
        crCount > 0 ? cr.reduce((sum, r) => sum + r.rating, 0) / crCount : null,
      ratingCount: crCount,
    };
  });

  // ─── Time series ───

  const monthly = isMonthlyGranularity(period);

  // For "all" period, anchor the start to the earliest purchase
  if (period === "all" && purchaseRows.length === 0) {
    return {
      summary: { totalRevenue: 0, totalEnrollments, avgRating, ratingCount },
      timeSeries: [],
      courses: courseBreakdown,
    };
  }

  let seriesStart: Date;
  if (period === "all") {
    const earliest = purchaseRows.reduce(
      (min, p) => (p.createdAt < min ? p.createdAt : min),
      purchaseRows[0].createdAt
    );
    seriesStart = new Date(earliest);
  } else {
    seriesStart = new Date(periodStart!);
  }

  // Group revenue by date bucket
  const revenueByBucket = new Map<string, number>();
  for (const p of purchaseRows) {
    const key = monthly
      ? p.createdAt.substring(0, 7)
      : p.createdAt.substring(0, 10);
    revenueByBucket.set(key, (revenueByBucket.get(key) ?? 0) + p.pricePaid);
  }

  // Generate all buckets and zero-fill
  const allBuckets = monthly
    ? generateMonthlyBuckets(seriesStart, now)
    : generateDailyBuckets(seriesStart, now);

  const timeSeries = allBuckets.map((date) => ({
    date,
    revenue: revenueByBucket.get(date) ?? 0,
  }));

  return {
    summary: { totalRevenue, totalEnrollments, avgRating, ratingCount },
    timeSeries,
    courses: courseBreakdown,
  };
}

// ─── Admin (Platform-Wide) Analytics ───

export interface AdminAnalyticsSummary {
  totalRevenue: number;
  totalEnrollments: number;
  topEarningCourse: { title: string; revenue: number } | null;
}

export function getAdminAnalyticsSummary(opts: {
  period: TimePeriod;
}): AdminAnalyticsSummary {
  const { period } = opts;
  const startDate = getStartDate(period);

  // Total revenue
  const revenueResult = db
    .select({ total: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)` })
    .from(purchases)
    .where(startDate ? sql`${purchases.createdAt} >= ${startDate}` : sql`1=1`)
    .get();

  // Total enrollments
  const enrollmentResult = db
    .select({ count: sql<number>`count(*)` })
    .from(enrollments)
    .where(
      startDate ? sql`${enrollments.enrolledAt} >= ${startDate}` : sql`1=1`
    )
    .get();

  // Top earning course
  const topCourseResult = db
    .select({
      title: courses.title,
      revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(startDate ? sql`${purchases.createdAt} >= ${startDate}` : sql`1=1`)
    .groupBy(courses.id)
    .orderBy(sql`sum(${purchases.pricePaid}) DESC`)
    .limit(1)
    .get();

  return {
    totalRevenue: revenueResult?.total ?? 0,
    totalEnrollments: enrollmentResult?.count ?? 0,
    topEarningCourse: topCourseResult
      ? { title: topCourseResult.title, revenue: topCourseResult.revenue }
      : null,
  };
}

export function getAdminAnalyticsTimeSeries(opts: {
  period: TimePeriod;
  now?: Date;
}): Array<{ date: string; revenue: number }> {
  const { period, now = new Date() } = opts;
  const periodStart = getPeriodStartIso(period, now);
  const monthly = isMonthlyGranularity(period);

  const purchaseRows = db
    .select({ pricePaid: purchases.pricePaid, createdAt: purchases.createdAt })
    .from(purchases)
    .where(periodStart ? gte(purchases.createdAt, periodStart) : undefined)
    .all();

  if (period === "all" && purchaseRows.length === 0) {
    return [];
  }

  let seriesStart: Date;
  if (period === "all") {
    const earliest = purchaseRows.reduce(
      (min, p) => (p.createdAt < min ? p.createdAt : min),
      purchaseRows[0].createdAt
    );
    seriesStart = new Date(earliest);
  } else {
    seriesStart = new Date(periodStart!);
  }

  const revenueByBucket = new Map<string, number>();
  for (const p of purchaseRows) {
    const key = monthly
      ? p.createdAt.substring(0, 7)
      : p.createdAt.substring(0, 10);
    revenueByBucket.set(key, (revenueByBucket.get(key) ?? 0) + p.pricePaid);
  }

  const allBuckets = monthly
    ? generateMonthlyBuckets(seriesStart, now)
    : generateDailyBuckets(seriesStart, now);

  return allBuckets.map((date) => ({
    date,
    revenue: revenueByBucket.get(date) ?? 0,
  }));
}
