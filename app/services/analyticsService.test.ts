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

import { getInstructorAnalytics, getAdminAnalyticsSummary, getAdminAnalyticsTimeSeries } from "./analyticsService";

// Fixed "now" used across all tests for deterministic period calculations.
// now = 2026-04-15T12:00:00.000Z
// 7d start  = 2026-04-08T12:00:00.000Z
// 30d start = 2026-03-16T12:00:00.000Z
// 12mo start= 2025-04-15T12:00:00.000Z
const NOW = new Date("2026-04-15T12:00:00.000Z");

describe("analyticsService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  // ─── Edge Cases ───

  describe("instructor with no courses", () => {
    it("returns zero summary, empty time series, empty courses", () => {
      // Use the instructor from base data but don't create any courses for them
      // (base.course belongs to base.instructor, but we'll use a fresh instructor)
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Empty Instructor",
          email: "empty@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const result = getInstructorAnalytics(otherInstructor.id, "30d", NOW);

      expect(result.summary.totalRevenue).toBe(0);
      expect(result.summary.totalEnrollments).toBe(0);
      expect(result.summary.avgRating).toBeNull();
      expect(result.summary.ratingCount).toBe(0);
      expect(result.timeSeries).toHaveLength(0);
      expect(result.courses).toHaveLength(0);
    });
  });

  // ─── Summary Totals ───

  describe("summary totals", () => {
    it("sums revenue from multiple purchases across courses", () => {
      const course2 = testDb
        .insert(schema.courses)
        .values({
          title: "Course Two",
          slug: "course-two",
          description: "Second course",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
          price: 9900,
        })
        .returning()
        .get();

      testDb
        .insert(schema.purchases)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 4999,
            country: "US",
            createdAt: "2026-04-01T00:00:00.000Z",
          },
          {
            userId: base.user.id,
            courseId: course2.id,
            pricePaid: 9900,
            country: "US",
            createdAt: "2026-04-02T00:00:00.000Z",
          },
        ])
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "30d", NOW);

      expect(result.summary.totalRevenue).toBe(14899);
    });

    it("counts enrollments from multiple courses", () => {
      const user2 = testDb
        .insert(schema.users)
        .values({
          name: "User Two",
          email: "user2@example.com",
          role: schema.UserRole.Student,
        })
        .returning()
        .get();

      testDb
        .insert(schema.enrollments)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            enrolledAt: "2026-04-01T00:00:00.000Z",
          },
          {
            userId: user2.id,
            courseId: base.course.id,
            enrolledAt: "2026-04-02T00:00:00.000Z",
          },
        ])
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "30d", NOW);

      expect(result.summary.totalEnrollments).toBe(2);
    });

    it("averages ratings across all courses", () => {
      testDb
        .insert(schema.courseRatings)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            rating: 4,
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
          },
          {
            userId: base.instructor.id,
            courseId: base.course.id,
            rating: 2,
            createdAt: "2026-04-02T00:00:00.000Z",
            updatedAt: "2026-04-02T00:00:00.000Z",
          },
        ])
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "30d", NOW);

      expect(result.summary.avgRating).toBe(3);
      expect(result.summary.ratingCount).toBe(2);
    });

    it("returns null avgRating when there are no ratings", () => {
      const result = getInstructorAnalytics(base.instructor.id, "30d", NOW);
      expect(result.summary.avgRating).toBeNull();
      expect(result.summary.ratingCount).toBe(0);
    });
  });

  // ─── Period Filtering ───

  describe("period filtering", () => {
    it("excludes purchases outside the 30d window", () => {
      testDb
        .insert(schema.purchases)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 4999,
            country: "US",
            createdAt: "2026-04-01T00:00:00.000Z", // in period
          },
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 9999,
            country: "US",
            createdAt: "2026-03-01T00:00:00.000Z", // out of period (before 30d start)
          },
        ])
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "30d", NOW);

      expect(result.summary.totalRevenue).toBe(4999);
    });

    it("excludes purchases outside the 7d window", () => {
      testDb
        .insert(schema.purchases)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 1000,
            country: "US",
            createdAt: "2026-04-10T00:00:00.000Z", // in 7d period
          },
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 9999,
            country: "US",
            createdAt: "2026-04-01T00:00:00.000Z", // out of 7d period
          },
        ])
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "7d", NOW);

      expect(result.summary.totalRevenue).toBe(1000);
    });

    it("includes all purchases for all-time period", () => {
      testDb
        .insert(schema.purchases)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 4999,
            country: "US",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 9999,
            country: "US",
            createdAt: "2026-04-01T00:00:00.000Z",
          },
        ])
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "all", NOW);

      expect(result.summary.totalRevenue).toBe(14998);
    });

    it("excludes enrollments outside the period", () => {
      testDb
        .insert(schema.enrollments)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            enrolledAt: "2026-04-01T00:00:00.000Z", // in 30d
          },
          {
            userId: base.instructor.id,
            courseId: base.course.id,
            enrolledAt: "2026-01-01T00:00:00.000Z", // out of 30d
          },
        ])
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "30d", NOW);

      expect(result.summary.totalEnrollments).toBe(1);
    });

    it("excludes ratings outside the period", () => {
      testDb
        .insert(schema.courseRatings)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            rating: 5,
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
          },
          {
            userId: base.instructor.id,
            courseId: base.course.id,
            rating: 1,
            createdAt: "2026-01-01T00:00:00.000Z", // out of 30d
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ])
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "30d", NOW);

      expect(result.summary.avgRating).toBe(5);
      expect(result.summary.ratingCount).toBe(1);
    });
  });

  // ─── Instructor Isolation ───

  describe("instructor isolation", () => {
    it("only returns data for the specified instructor's courses", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course",
          description: "Not yours",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      // Purchase for other instructor's course
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: otherCourse.id,
          pricePaid: 9999,
          country: "US",
          createdAt: "2026-04-01T00:00:00.000Z",
        })
        .run();

      // Purchase for our instructor's course
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 4999,
          country: "US",
          createdAt: "2026-04-01T00:00:00.000Z",
        })
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "all", NOW);

      expect(result.summary.totalRevenue).toBe(4999);
      expect(result.courses).toHaveLength(1);
      expect(result.courses[0].courseId).toBe(base.course.id);
    });
  });

  // ─── Per-Course Breakdown ───

  describe("per-course breakdown", () => {
    it("correctly attributes revenue, sales, enrollments, and ratings to each course", () => {
      const course2 = testDb
        .insert(schema.courses)
        .values({
          title: "Course Two",
          slug: "course-two",
          description: "Second",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
          price: 9900,
        })
        .returning()
        .get();

      const user2 = testDb
        .insert(schema.users)
        .values({
          name: "User Two",
          email: "u2@example.com",
          role: schema.UserRole.Student,
        })
        .returning()
        .get();

      testDb
        .insert(schema.purchases)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 4999,
            country: "US",
            createdAt: "2026-04-01T00:00:00.000Z",
          },
          {
            userId: user2.id,
            courseId: base.course.id,
            pricePaid: 4999,
            country: "US",
            createdAt: "2026-04-02T00:00:00.000Z",
          },
          {
            userId: base.user.id,
            courseId: course2.id,
            pricePaid: 9900,
            country: "US",
            createdAt: "2026-04-03T00:00:00.000Z",
          },
        ])
        .run();

      testDb
        .insert(schema.enrollments)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            enrolledAt: "2026-04-01T00:00:00.000Z",
          },
          {
            userId: base.user.id,
            courseId: course2.id,
            enrolledAt: "2026-04-03T00:00:00.000Z",
          },
        ])
        .run();

      testDb
        .insert(schema.courseRatings)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          rating: 5,
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        })
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "all", NOW);

      const c1 = result.courses.find((c) => c.courseId === base.course.id)!;
      const c2 = result.courses.find((c) => c.courseId === course2.id)!;

      expect(c1.revenue).toBe(9998);
      expect(c1.salesCount).toBe(2);
      expect(c1.enrollmentCount).toBe(1);
      expect(c1.avgRating).toBe(5);
      expect(c1.ratingCount).toBe(1);

      expect(c2.revenue).toBe(9900);
      expect(c2.salesCount).toBe(1);
      expect(c2.enrollmentCount).toBe(1);
      expect(c2.avgRating).toBeNull();
      expect(c2.ratingCount).toBe(0);
    });

    it("includes list price from the course", () => {
      testDb
        .update(schema.courses)
        .set({ price: 4999 })
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "all", NOW);

      expect(result.courses[0].listPrice).toBe(4999);
    });
  });

  // ─── Time Series ───

  describe("time series granularity", () => {
    it("uses daily buckets for 7d period", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 1000,
          country: "US",
          createdAt: "2026-04-10T00:00:00.000Z",
        })
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "7d", NOW);

      // 7d from 2026-04-08 to 2026-04-15 = 8 days
      expect(result.timeSeries.length).toBeGreaterThanOrEqual(7);
      expect(result.timeSeries[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("uses daily buckets for 30d period", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 1000,
          country: "US",
          createdAt: "2026-04-01T00:00:00.000Z",
        })
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "30d", NOW);

      expect(result.timeSeries.length).toBeGreaterThanOrEqual(30);
      expect(result.timeSeries[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("uses monthly buckets for 12mo period", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 1000,
          country: "US",
          createdAt: "2026-01-15T00:00:00.000Z",
        })
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "12mo", NOW);

      expect(result.timeSeries.length).toBeGreaterThanOrEqual(12);
      expect(result.timeSeries[0].date).toMatch(/^\d{4}-\d{2}$/);
    });

    it("uses monthly buckets for all-time period", () => {
      testDb
        .insert(schema.purchases)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 1000,
            country: "US",
            createdAt: "2025-01-01T00:00:00.000Z",
          },
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 2000,
            country: "US",
            createdAt: "2026-04-01T00:00:00.000Z",
          },
        ])
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "all", NOW);

      expect(result.timeSeries[0].date).toMatch(/^\d{4}-\d{2}$/);
      // Should have months from 2025-01 to 2026-04 = 16 months
      expect(result.timeSeries.length).toBe(16);
    });
  });

  describe("time series zero-fill", () => {
    it("fills missing days with zero revenue", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 5000,
          country: "US",
          createdAt: "2026-04-10T00:00:00.000Z",
        })
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "7d", NOW);

      // April 10 should have revenue, all others should be 0
      const apr10 = result.timeSeries.find((p) => p.date === "2026-04-10");
      const apr09 = result.timeSeries.find((p) => p.date === "2026-04-09");

      expect(apr10?.revenue).toBe(5000);
      expect(apr09?.revenue).toBe(0);
    });

    it("fills missing months with zero revenue", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 5000,
          country: "US",
          createdAt: "2026-04-01T00:00:00.000Z",
        })
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "12mo", NOW);

      const apr2026 = result.timeSeries.find((p) => p.date === "2026-04");
      const jan2026 = result.timeSeries.find((p) => p.date === "2026-01");

      expect(apr2026?.revenue).toBe(5000);
      expect(jan2026?.revenue).toBe(0);
    });

    it("returns empty time series for all-time period with no purchases", () => {
      const result = getInstructorAnalytics(base.instructor.id, "all", NOW);
      expect(result.timeSeries).toHaveLength(0);
    });

    it("aggregates multiple purchases on the same day", () => {
      testDb
        .insert(schema.purchases)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 1000,
            country: "US",
            createdAt: "2026-04-10T08:00:00.000Z",
          },
          {
            userId: base.instructor.id,
            courseId: base.course.id,
            pricePaid: 2000,
            country: "US",
            createdAt: "2026-04-10T20:00:00.000Z",
          },
        ])
        .run();

      const result = getInstructorAnalytics(base.instructor.id, "7d", NOW);

      const apr10 = result.timeSeries.find((p) => p.date === "2026-04-10");
      expect(apr10?.revenue).toBe(3000);
    });
  });

  // ─── Admin Analytics Summary ───

  describe("getAdminAnalyticsSummary", () => {
    it("returns zeros and null top course when no data exists", () => {
      const result = getAdminAnalyticsSummary({ period: "all" });

      expect(result.totalRevenue).toBe(0);
      expect(result.totalEnrollments).toBe(0);
      expect(result.topEarningCourse).toBeNull();
    });

    it("returns total revenue across all instructors", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course",
          description: "Another course",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
          price: 2999,
        })
        .returning()
        .get();

      testDb
        .insert(schema.purchases)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 4999,
            country: "US",
          },
          {
            userId: base.user.id,
            courseId: otherCourse.id,
            pricePaid: 2999,
            country: "US",
          },
        ])
        .run();

      const result = getAdminAnalyticsSummary({ period: "all" });

      expect(result.totalRevenue).toBe(7998);
    });

    it("returns total enrollments across all courses", () => {
      testDb
        .insert(schema.enrollments)
        .values([
          { userId: base.user.id, courseId: base.course.id },
          { userId: base.instructor.id, courseId: base.course.id },
        ])
        .run();

      const result = getAdminAnalyticsSummary({ period: "all" });

      expect(result.totalEnrollments).toBe(2);
    });

    it("returns the top earning course", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Expensive Course",
          slug: "expensive-course",
          description: "Pricey",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
          price: 9999,
        })
        .returning()
        .get();

      testDb
        .insert(schema.purchases)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 4999,
            country: "US",
          },
          {
            userId: base.user.id,
            courseId: otherCourse.id,
            pricePaid: 9999,
            country: "US",
          },
        ])
        .run();

      const result = getAdminAnalyticsSummary({ period: "all" });

      expect(result.topEarningCourse).toEqual({
        title: "Expensive Course",
        revenue: 9999,
      });
    });

    it("filters by time period", () => {
      const now = new Date();
      const threeDaysAgo = new Date(now);
      threeDaysAgo.setDate(now.getDate() - 3);
      const tenDaysAgo = new Date(now);
      tenDaysAgo.setDate(now.getDate() - 10);

      testDb
        .insert(schema.purchases)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 4999,
            country: "US",
            createdAt: threeDaysAgo.toISOString(),
          },
          {
            userId: base.instructor.id,
            courseId: base.course.id,
            pricePaid: 2500,
            country: "US",
            createdAt: tenDaysAgo.toISOString(),
          },
        ])
        .run();

      const result = getAdminAnalyticsSummary({ period: "7d" });

      expect(result.totalRevenue).toBe(4999);
    });

    it("returns null top course when no purchases in period", () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 4999,
          country: "US",
          createdAt: twoYearsAgo.toISOString(),
        })
        .run();

      const result = getAdminAnalyticsSummary({ period: "7d" });

      expect(result.topEarningCourse).toBeNull();
    });
  });

  // ─── Admin Analytics Time Series ───

  describe("getAdminAnalyticsTimeSeries", () => {
    it("returns empty array for all-time period with no purchases", () => {
      const result = getAdminAnalyticsTimeSeries({ period: "all", now: NOW });
      expect(result).toHaveLength(0);
    });

    it("uses daily buckets for 7d period", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 1000,
          country: "US",
          createdAt: "2026-04-10T00:00:00.000Z",
        })
        .run();

      const result = getAdminAnalyticsTimeSeries({ period: "7d", now: NOW });

      expect(result.length).toBeGreaterThanOrEqual(7);
      expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("uses monthly buckets for 12mo period", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 1000,
          country: "US",
          createdAt: "2026-01-15T00:00:00.000Z",
        })
        .run();

      const result = getAdminAnalyticsTimeSeries({ period: "12mo", now: NOW });

      expect(result.length).toBeGreaterThanOrEqual(12);
      expect(result[0].date).toMatch(/^\d{4}-\d{2}$/);
    });

    it("aggregates revenue across all instructors", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other2@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course-ts",
          description: "Another course",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
          price: 2999,
        })
        .returning()
        .get();

      testDb
        .insert(schema.purchases)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 4999,
            country: "US",
            createdAt: "2026-04-10T00:00:00.000Z",
          },
          {
            userId: base.user.id,
            courseId: otherCourse.id,
            pricePaid: 2999,
            country: "US",
            createdAt: "2026-04-10T12:00:00.000Z",
          },
        ])
        .run();

      const result = getAdminAnalyticsTimeSeries({ period: "7d", now: NOW });

      const apr10 = result.find((p) => p.date === "2026-04-10");
      expect(apr10?.revenue).toBe(7998);
    });

    it("zero-fills days with no revenue", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 5000,
          country: "US",
          createdAt: "2026-04-10T00:00:00.000Z",
        })
        .run();

      const result = getAdminAnalyticsTimeSeries({ period: "7d", now: NOW });

      const apr09 = result.find((p) => p.date === "2026-04-09");
      expect(apr09?.revenue).toBe(0);
    });

    it("uses monthly buckets for all-time period with purchases", () => {
      testDb
        .insert(schema.purchases)
        .values([
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 1000,
            country: "US",
            createdAt: "2025-01-01T00:00:00.000Z",
          },
          {
            userId: base.user.id,
            courseId: base.course.id,
            pricePaid: 2000,
            country: "US",
            createdAt: "2026-04-01T00:00:00.000Z",
          },
        ])
        .run();

      const result = getAdminAnalyticsTimeSeries({ period: "all", now: NOW });

      expect(result[0].date).toMatch(/^\d{4}-\d{2}$/);
      // 2025-01 to 2026-04 = 16 months
      expect(result.length).toBe(16);
    });
  });
});
