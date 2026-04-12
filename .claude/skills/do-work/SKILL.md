---
name: do-work
description: "Execute a unit of work end-to-end: plan, implement, validate with typecheck and tests, then commit. Use when user wants to do work, build a feature, fix a bug, or implement a phase from a plan."
---

# Do Work

Execute a complete unit of work: plan it, build it, validate it, commit it.

## Workflow

### 1. Understand the task

Read any referenced plan or PRD. Explore the codebase to understand the relevant files, patterns, and conventions. If the task is ambiguous, ask the user to clarify scope before proceeding.

### 2. Plan the implementation (optional)

If the task has not already been planned, create a plan for it.

### 3. Implement

**For backend code**: use red/green/refactor, one test at a time in a tracer-bullet style.

**CRITICAL - What "Tracer Bullet Style" Means:**

A tracer bullet is a VERTICAL SLICE through all layers, not a horizontal one.

❌ **WRONG (Horizontal - Layer by Layer):**
1. Write all database queries
2. Write all service methods
3. Write all route handlers
4. Write all tests

✅ **CORRECT (Vertical - Tracer Bullets):**
1. ONE feature end-to-end: DB query + service method + route + test
2. Next feature end-to-end: DB query + service method + route + test
3. Next feature end-to-end: DB query + service method + route + test

**The Red-Green-Refactor Loop (Per Tracer Bullet):**

For each vertical slice:

1. **Write ONE failing test** for the smallest vertical slice
   - Example: "getUnreadNotifications returns notifications for the current user"
   - Must touch: database → service → response
   
2. **Run the test** — confirm it fails (RED ❌)

3. **Write minimum code** to make it pass (GREEN ✅)
   - Implement ONLY: the DB query + service method needed for THIS test
   - Do NOT implement other features yet
   
4. **Run the test again** — confirm it passes

5. **Refactor if needed** (while keeping tests green)

6. **Move to next vertical slice**
   - Example: "markNotificationAsRead updates the read status"
   - Repeat steps 1-5

**DO NOT:**
- ❌ Write all tests upfront
- ❌ Build the entire service before testing
- ❌ Skip running tests between slices
- ❌ Code horizontally (all DB, then all services, then all routes)

**For frontend code**: implement directly without TDD.

### 4. Validate

Run the feedback loops and fix any issues. Repeat until both pass cleanly.

```
pnpm run typecheck
pnpm run test
```

### 5. Commit

Once typecheck and tests pass, commit the work.
