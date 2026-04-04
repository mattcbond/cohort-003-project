import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowUpDown, ArrowUp, ArrowDown, BarChart2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { formatPrice } from "~/lib/utils";
import type { AnalyticsPeriod, InstructorAnalytics, CourseAnalytics } from "~/services/analyticsService";

// ─── Period Selector ───

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "12mo", label: "12 months" },
  { value: "all", label: "All time" },
];

// ─── Table Sorting ───

type SortKey = keyof Pick<
  CourseAnalytics,
  "title" | "listPrice" | "revenue" | "salesCount" | "enrollmentCount" | "avgRating"
>;

type SortDir = "asc" | "desc";

function sortCourses(
  courses: CourseAnalytics[],
  key: SortKey,
  dir: SortDir
): CourseAnalytics[] {
  return [...courses].sort((a, b) => {
    const av = a[key] ?? -1;
    const bv = b[key] ?? -1;
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

// ─── Chart Helpers ───

function formatChartDate(date: string): string {
  // Monthly bucket: "2024-03" → "Mar 24"
  if (date.length === 7) {
    const [year, month] = date.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  // Daily bucket: "2024-03-15" → "Mar 15"
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatChartRevenue(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

// ─── Sub-components ───

function SummaryCards({
  summary,
}: {
  summary: InstructorAnalytics["summary"];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatPrice(summary.totalRevenue)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Enrollments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary.totalEnrollments}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Average Rating
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {summary.avgRating !== null
              ? `${summary.avgRating.toFixed(1)} / 5`
              : "—"}
          </div>
          {summary.ratingCount > 0 && (
            <div className="text-xs text-muted-foreground">
              from {summary.ratingCount} rating
              {summary.ratingCount !== 1 ? "s" : ""}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RevenueChart({
  timeSeries,
}: {
  timeSeries: InstructorAnalytics["timeSeries"];
}) {
  if (timeSeries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revenue Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No revenue data for this period.
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = timeSeries.map((point) => ({
    date: formatChartDate(point.date),
    revenue: point.revenue,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={formatChartRevenue}
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
                width={60}
              />
              <Tooltip
                formatter={(value) => [formatPrice(Number(value)), "Revenue"]}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                strokeWidth={2}
                dot={false}
                className="stroke-primary"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function CourseTable({ courses }: { courses: CourseAnalytics[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = sortCourses(courses, sortKey, sortDir);

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <ArrowUpDown className="ml-1 size-3 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 size-3" />
      : <ArrowDown className="ml-1 size-3" />;
  }

  function Th({
    col,
    children,
    className,
  }: {
    col: SortKey;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <th
        className={`cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground ${className ?? ""}`}
        onClick={() => handleSort(col)}
      >
        <span className="inline-flex items-center">
          {children}
          <SortIcon col={col} />
        </span>
      </th>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-Course Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <Th col="title">Course</Th>
                <Th col="listPrice" className="text-right">List Price</Th>
                <Th col="revenue" className="text-right">Revenue</Th>
                <Th col="salesCount" className="text-right">Sales</Th>
                <Th col="enrollmentCount" className="text-right">Enrollments</Th>
                <Th col="avgRating" className="text-right">Avg Rating</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((course) => (
                <tr key={course.courseId} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{course.title}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {formatPrice(course.listPrice)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatPrice(course.revenue)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {course.salesCount}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {course.enrollmentCount}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {course.avgRating !== null
                      ? `${course.avgRating.toFixed(1)} (${course.ratingCount})`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───

interface AnalyticsDashboardProps {
  data: InstructorAnalytics;
  period: AnalyticsPeriod;
  instructorName?: string;
}

export function AnalyticsDashboard({
  data,
  period,
  instructorName,
}: AnalyticsDashboardProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isEmpty = data.courses.length === 0;

  function handlePeriodChange(newPeriod: AnalyticsPeriod) {
    const params = new URLSearchParams(searchParams);
    params.set("period", newPeriod);
    navigate(`?${params.toString()}`, { replace: true });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">
          {instructorName ? `${instructorName}'s Analytics` : "Analytics"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Revenue and performance data for your courses.
        </p>
      </div>

      {/* Period selector */}
      <div className="inline-flex rounded-lg border bg-muted p-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => handlePeriodChange(p.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              period === p.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <BarChart2 className="mb-4 size-12 text-muted-foreground/40" />
          <h2 className="text-lg font-medium">No data yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            No revenue data yet. Publish a course to start tracking analytics.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <SummaryCards summary={data.summary} />
          <RevenueChart timeSeries={data.timeSeries} />
          <CourseTable courses={data.courses} />
        </div>
      )}
    </div>
  );
}
