import { data } from "react-router";
import type { Route } from "./+types/instructor.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { UserRole } from "~/db/schema";
import { getInstructorAnalytics } from "~/services/analyticsService";
import type { AnalyticsPeriod } from "~/services/analyticsService";
import { AnalyticsDashboard } from "~/components/analytics-dashboard";

const VALID_PERIODS = new Set<AnalyticsPeriod>(["7d", "30d", "12mo", "all"]);

function parsePeriod(raw: string | null): AnalyticsPeriod {
  if (raw && VALID_PERIODS.has(raw as AnalyticsPeriod)) {
    return raw as AnalyticsPeriod;
  }
  return "30d";
}

export function meta() {
  return [
    { title: "Analytics — Cadence" },
    { name: "description", content: "Your course revenue and performance analytics" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Sign in to view your analytics.", { status: 401 });
  }

  const user = getUserById(currentUserId);

  if (!user || user.role !== UserRole.Instructor) {
    throw data("Only instructors can access this page.", { status: 403 });
  }

  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get("period"));
  const analytics = getInstructorAnalytics(currentUserId, period);

  return { analytics, period };
}

export default function InstructorAnalytics({ loaderData }: Route.ComponentProps) {
  const { analytics, period } = loaderData;
  return <AnalyticsDashboard data={analytics} period={period} />;
}
