# Live Presence Indicator — Research & Implementation Plan

**Date**: 2026-04-26  
**Status**: Research complete, ready to implement

---

## Problem Statement

Students viewing a lesson should be able to see who else is currently on the same lesson page. The goal is a social signal that makes the platform feel alive — something like:

> "Matt, Sarah, and 2 others are here"

This is strictly a live indicator. No history, no scroll tracking, no cursor sharing. Only authenticated users count.

---

## Constraints

| Constraint | Decision |
|---|---|
| Real-time capability | True real-time (WebSocket-based) |
| UI display | "Matt, Sarah, and 2 others are here" |
| Cursor/scroll tracking | Not needed |
| Service preference | Third-party preferred over self-hosting |
| Data persistence | Ephemeral — no storage needed |
| Unauthenticated users | Do not count towards presence |
| Expected concurrency | ~20 users per lesson |

---

## Options Evaluated

### Pusher — Presence Channels
- Native presence concept with `presence-` prefixed channels
- Requires a server-side `/pusher/auth` endpoint (mandatory, not optional)
- Free sandbox: 200 concurrent connections, 200K messages/day
- TypeScript types built in since v5.1.0
- Well-established, battle-tested pattern
- **Verdict**: Viable but auth endpoint adds boilerplate; free tier limits are tight for growth

### Ably — Spaces / Presence
- Dual offering: lower-level Presence API + higher-level Spaces SDK
- Official React hooks: `usePresence` (join) + `usePresenceListener` (observe others)
- Free tier: **200 concurrent connections, 6M messages/month** — comfortably covers use case
- Auth: set `clientId` on the client; use token auth in production (server issues short-lived tokens)
- No hard member-per-room limits at scale; 200 default, up to 20,000
- Full TypeScript support throughout
- **Verdict**: Best fit. Generous free tier, React-native hooks, simpler auth than Pusher**

### Liveblocks — Presence / Room API
- Purpose-built for React presence with `useMyPresence()` and `useOthers()` hooks
- Best developer experience of all options
- **Hard blocker**: Free tier caps at 5 concurrent connections per room. 20-user requirement cannot be met without a paid plan (~$100+/month)
- **Verdict**: Eliminated by free tier constraint

### PartyKit
- No native presence — you implement it yourself using Durable Objects + WebSocket messaging
- Maximum flexibility; runs on Cloudflare's infrastructure
- Unclear free tier limits (depends on Cloudflare Workers/Durable Objects pricing)
- Requires writing custom presence tracking logic
- **Verdict**: Too much custom code for a feature this well-solved by existing services

---

## Recommended Approach: Ably

### Why Ably wins

1. **Free tier covers the use case**: 200 concurrent connections and 6M messages/month easily handles ~20 users per lesson without hitting limits during development or initial launch.
2. **Native React presence hooks**: `usePresence` and `usePresenceListener` are first-class, typed, and designed for exactly this pattern.
3. **Simplest auth path**: In development, set `clientId` directly. In production, add one server endpoint that issues a short-lived token — less boilerplate than Pusher's mandatory auth endpoint.
4. **Ephemeral by design**: Presence state lives only in Ably's infrastructure. When a user's tab closes or they navigate away, Ably removes them from presence automatically. No database writes needed.

---

## Implementation Plan

### 1. Channel structure

One Ably channel per lesson, using the Presence feature:

```
presence:lesson-{lessonId}
```

### 2. Authentication flow

Authenticated users only. The flow:

1. User is already logged in (session exists in the app).
2. On lesson page mount, the client requests an Ably token from a new server route.
3. The server route reads the current session, then calls Ably's REST API to issue a token stamped with the user's `id` and `name`.
4. The client uses that token to connect — Ably ties the connection to the user's identity.

New server route needed: `POST /api/ably-token`  
Returns: `{ token: string }`

### 3. React integration (lesson page)

```tsx
// Pseudo-code — illustrates the pattern
const { presenceData } = usePresenceListener(`presence:lesson-${lessonId}`)

// presenceData is an array of { clientId, data: { name: string } }
// Filter out the current user, build the display string
```

### 4. Display string logic

| Members present (excluding self) | Display |
|---|---|
| 0 | Hidden (or "You're the only one here") |
| 1 | "Sarah is here" |
| 2 | "Matt and Sarah are here" |
| 3 | "Matt, Sarah, and John are here" |
| 4+ | "Matt, Sarah, and 3 others are here" — first 2 names + overflow count |

### 5. Presence lifecycle

Ably handles all of this automatically:
- **Join**: on component mount, call `usePresence` to enter the channel
- **Leave**: when the component unmounts (navigation, tab close), Ably removes the member
- **Grace period**: not needed — Ably's heartbeat handles stale connections transparently

No database writes. No cleanup jobs. No cron tasks.

---

## Files to create / modify

| File | Change |
|---|---|
| `app/routes/api.ably-token.ts` | New: server action that issues an Ably token for the authenticated user |
| `app/hooks/usePresence.ts` | New: thin wrapper around Ably's React hooks for lesson presence |
| `app/components/LessonPresence.tsx` | New: UI component rendering the "X and Y are here" string |
| `app/routes/lessons.$lessonId.tsx` | Modify: mount `<LessonPresence>` in the lesson layout |
| `.env` | Add: `ABLY_API_KEY` |

---

## Open Questions Before Build

1. **Placement in lesson UI**: Where exactly does the indicator appear? (Header, sidebar, below lesson title?)
2. **Empty state**: Should it be hidden when the student is alone, or show "You're the first here"?
3. **Name source**: Should it use the user's full name, first name only, or display name? (First name is friendlier.)
4. **Ably account**: Do you have an Ably account, or does one need to be created?

---

## References

- [Ably Presence docs](https://ably.com/docs/presence-occupancy/presence)
- [Ably React hooks guide](https://ably.com/docs/getting-started/react)
- [Ably Spaces SDK](https://ably.com/docs/spaces)
- [Ably free tier limits](https://ably.com/docs/platform/pricing/free)
