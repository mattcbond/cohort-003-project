import { data } from "react-router";
import Ably from "ably";
import type { Route } from "./+types/api.ably-auth";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const user = getUserById(currentUserId);
  if (!user) {
    throw data("User not found", { status: 401 });
  }

  const client = new Ably.Rest(process.env.ABLY_API_KEY!);
  const tokenRequest = await client.auth.createTokenRequest({
    clientId: String(user.id),
  });

  return Response.json(tokenRequest);
}
