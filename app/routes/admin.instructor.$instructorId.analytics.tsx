import { data } from "react-router";
import type { Route } from "./+types/admin.instructor.$instructorId.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { UserRole } from "~/db/schema";
import { getInstructorAnalytics } from "~/services/analyticsService";
import type { AnalyticsPeriod } from "~/services/analyticsService";
import { AnalyticsDashboard } from "~/components/analytics-dashboard";
import { isRouteErrorResponse, Link } from "react-router";
import { AlertTriangle } from "lucide-react";
import { Button } from "~/components/ui/button";

const VALID_PERIODS = new Set<AnalyticsPeriod>(["7d", "30d", "12mo", "all"]);

function parsePeriod(raw: string | null): AnalyticsPeriod {
  if (raw && VALID_PERIODS.has(raw as AnalyticsPeriod)) {
    return raw as AnalyticsPeriod;
  }
  return "30d";
}

export function meta({ data: loaderData }: Route.MetaArgs) {
  const name = loaderData?.instructorName ?? "Instructor";
  return [
    { title: `${name} Analytics — Cadence` },
    { name: "description", content: `Revenue and performance analytics for ${name}` },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Sign in to view analytics.", { status: 401 });
  }

  const currentUser = getUserById(currentUserId);

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only admins can access this page.", { status: 403 });
  }

  const instructorId = Number(params.instructorId);
  if (!Number.isInteger(instructorId)) {
    throw data("Invalid instructor ID.", { status: 404 });
  }

  const instructor = getUserById(instructorId);

  if (!instructor || instructor.role !== UserRole.Instructor) {
    throw data("Instructor not found.", { status: 404 });
  }

  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get("period"));
  const analytics = getInstructorAnalytics(instructorId, period);

  return { analytics, period, instructorName: instructor.name };
}

export default function AdminInstructorAnalytics({ loaderData }: Route.ComponentProps) {
  const { analytics, period, instructorName } = loaderData;
  return (
    <div>
      <div className="mx-auto max-w-7xl px-6 pt-6 lg:px-8">
        <p className="text-sm text-muted-foreground">
          Viewing analytics for <span className="font-medium text-foreground">{instructorName}</span>
        </p>
      </div>
      <AnalyticsDashboard data={analytics} period={period} />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message = typeof error.data === "string" ? error.data : "Please sign in.";
    } else if (error.status === 403) {
      title = "Access denied";
      message = typeof error.data === "string" ? error.data : "Only admins can access this page.";
    } else if (error.status === 404) {
      title = "Not found";
      message = typeof error.data === "string" ? error.data : "Instructor not found.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/admin/users">
            <Button>Back to Users</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
