# Plan: Instructor Revenue Analytics Dashboard

> Source PRD: `prd/instructor-analytics-dashboard.md`

---

## Phase 1 — Analytics Service

Build the core data layer. Everything else depends on this.

- Install `recharts` as a project dependency
- Create `app/services/analyticsService.ts` with a single primary function (e.g. `getInstructorAnalytics(instructorId, period)`) that returns:
  - Summary totals: total revenue (cents), total enrollments, average rating, rating count
  - Revenue time series: array of `{ date: string, revenue: number }` data points — daily buckets for `7d`/`30d`, monthly buckets for `12mo`/`all`
  - Per-course breakdown: array of `{ courseId, title, listPrice, revenue, salesCount, enrollmentCount, avgRating, ratingCount }`
- Support the four periods: `7d`, `30d`, `12mo`, `all`
- Zero-fill gaps in the time series so the line chart has no holes
- Data sources: `purchases.pricePaid` for revenue, `enrollments.enrolledAt` for enrollments, `courseRatings` for ratings — all scoped to instructor's own courses
- Write `app/services/analyticsService.test.ts` covering:
  - Correct revenue/enrollment/rating totals for each period
  - Daily vs monthly bucketing
  - Per-course attribution
  - Period boundary inclusion/exclusion
  - Instructor isolation (only own courses)
  - Edge cases: no courses, no purchases, no ratings, zero-revenue periods

---

## Phase 2 — Shared Dashboard Component

Build the presentational layer used by both routes.

- Create `app/components/analytics-dashboard.tsx` (receives all data as props, owns no data fetching)
- Period selector: tabs for `7d / 30d / 12mo / All` that update the `?period=` search param via navigation (not client state)
- Three summary cards: Total Revenue, Total Enrollments, Average Rating
- Revenue line chart using `recharts` `<LineChart>` — respects daily/monthly granularity from the service data
- Per-course table:
  - Columns: Course, List Price, Revenue, Sales, Enrollments, Avg Rating
  - Clickable column headers toggle ascending/descending sort (client-side)
  - Default sort: Revenue descending
- Empty state: friendly message when there are no courses or no data for the period
- Format revenue in dollars using the existing `formatPrice()` utility

---

## Phase 3 — Instructor Route

Wire up the instructor-facing page.

- Add route file `app/routes/instructor.analytics.tsx`
- Register it in `app/routes.ts` under the app layout
- Loader:
  - Auth check: must be logged in and have role `instructor`, else 403
  - Read `?period=` search param, default to `30d`
  - Call `getInstructorAnalytics(currentUser.id, period)`
  - Return data + current period to the component
- Component: renders `<AnalyticsDashboard>` with the loader data
- Add "Analytics" link to the instructor section of the sidebar

---

## Phase 4 — Admin Route & Admin Users Page Link

Give admins access to any instructor's dashboard.

- Add route file `app/routes/admin.instructor.$instructorId.analytics.tsx`
- Register it in `app/routes.ts` under the app layout
- Loader:
  - Auth check: must be logged in and have role `admin`, else 403
  - Read `instructorId` from URL params; 404 if user not found or not an instructor
  - Read `?period=` search param, default to `30d`
  - Call `getInstructorAnalytics(instructorId, period)`
  - Return data + current period to the component
- Component: renders the same `<AnalyticsDashboard>` (optionally with an instructor name heading)
- Modify `app/routes/admin.users.tsx`: add a "View Analytics" link next to each user whose role is `instructor`, pointing to `/admin/instructor/:id/analytics`
