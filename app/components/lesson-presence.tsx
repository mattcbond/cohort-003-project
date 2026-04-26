"use client";

import * as Ably from "ably";
import {
  AblyProvider,
  ChannelProvider,
  usePresence,
  usePresenceListener,
} from "ably/react";
import { useMemo } from "react";

interface CurrentUser {
  id: number;
  name: string;
}

interface PresenceMember {
  clientId: string;
  data: { name: string };
}

function formatPresenceText(members: PresenceMember[]): string {
  const MAX_NAMED = 2;
  const named = members.slice(0, MAX_NAMED).map((m) => m.data.name);
  const remaining = members.length - named.length;

  if (remaining === 0) {
    const verb = named.length === 1 ? "is" : "are";
    return named.join(" and ") + ` ${verb} here`;
  }

  const verb = remaining === 1 ? "is" : "are";
  const plural = remaining === 1 ? "other" : "others";
  return named.join(", ") + ` and ${remaining} ${plural} ${verb} here`;
}

function PresencePill({ members }: { members: PresenceMember[] }) {
  const text = formatPresenceText(members);
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
      {text}
    </div>
  );
}

function PresenceInner({
  lessonId,
  currentUser,
}: {
  lessonId: string;
  currentUser: CurrentUser;
}) {
  const channelName = `lesson:${lessonId}`;

  usePresence<{ name: string }>(channelName, { name: currentUser.name });

  const { presenceData } = usePresenceListener<{ name: string }>(channelName);

  const others = presenceData.filter(
    (member) => member.clientId !== String(currentUser.id)
  );

  if (others.length === 0) return null;

  return <PresencePill members={others} />;
}

export function LessonPresence({
  lessonId,
  currentUser,
}: {
  lessonId: string;
  currentUser: CurrentUser;
}) {
  const client = useMemo(
    () =>
      new Ably.Realtime({
        authUrl: "/api/ably-auth",
        clientId: String(currentUser.id),
        transportParams: { remainPresentFor: "5000" },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser.id]
  );

  return (
    <AblyProvider client={client}>
      <ChannelProvider channelName={`lesson:${lessonId}`}>
        <PresenceInner lessonId={lessonId} currentUser={currentUser} />
      </ChannelProvider>
    </AblyProvider>
  );
}
