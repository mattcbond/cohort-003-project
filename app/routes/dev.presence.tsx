import { data } from "react-router";
import type { Route } from "./+types/dev.presence";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { LessonPresence } from "~/components/lesson-presence";

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("You must be logged in to view this page", { status: 401 });
  }

  const user = getUserById(currentUserId);
  if (!user) {
    throw data("User not found", { status: 401 });
  }

  return {
    currentUser: { id: user.id, name: user.name },
  };
}

export default function DevPresencePage({ loaderData }: Route.ComponentProps) {
  const { currentUser } = loaderData;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-6 rounded-lg border border-dashed border-yellow-400 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300">
        <strong>Dev prototype</strong> — This route is for testing the live
        presence indicator only. Remove before shipping.
      </div>

      <h1 className="mb-1 text-2xl font-bold">Live Presence Prototype</h1>
      <p className="mb-8 text-muted-foreground">
        Logged in as{" "}
        <strong className="text-foreground">{currentUser.name}</strong>. Open
        this page in a second browser tab (switch to a different user with DevUI
        first) to see presence update in real time.
      </p>

      {/* The actual presence indicator */}
      <div className="mb-8 rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Presence indicator
        </h2>
        <LessonPresence lessonId="dev-test" currentUser={currentUser} />
        <p className="mt-3 text-xs text-muted-foreground">
          (Nothing shown when you&apos;re the only viewer — by design)
        </p>
      </div>

      {/* How to test */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          How to test
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Add your real <code className="text-foreground">ABLY_API_KEY</code>{" "}
            to <code className="text-foreground">.env</code> and restart the
            dev server.
          </li>
          <li>
            Open a second browser tab at{" "}
            <code className="text-foreground">/dev/presence</code>.
          </li>
          <li>
            In the second tab, use the <strong>DevUI</strong> (bottom-right) to
            switch to a different user.
          </li>
          <li>
            Go back to this tab — you should see the other user&apos;s name
            appear.
          </li>
          <li>
            Close the second tab — the name should disappear within ~5 seconds.
          </li>
        </ol>
      </div>
    </div>
  );
}
