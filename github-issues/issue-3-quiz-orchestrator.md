## Problem

Quiz completion logic is scattered across three layers, with XP awarded in two places simultaneously:

1. **`quizScoringService.ts:265`** — calls `awardQuizXp(userId, quizId)` inside `computeResult()`
2. **`courses.$slug.lessons.$lessonId.tsx:432`** — calls `awardXp(currentUserId, 5, "quiz_pass", quizId)` in the route action

Both calls use the same deduplication key `("quiz_pass", quizId)` in `xpService.ts`, so only one succeeds — but the intent is ambiguous and the code silently hides a race condition. A future refactor that removes the dedup guard would double-award XP.

Additional inconsistencies downstream:

- Quiz passes do **not** record streak activity (lesson completions do, via `lessonCompletionService.ts:47`)
- Students must manually mark a lesson complete even after passing its quiz — no auto-completion path exists
- The route action owns quiz submission, scoring, XP, and would need to own streak/completion too — it's accumulating responsibilities

## Relevant files

| File | Lines | Responsibility |
|---|---|---|
| `app/routes/courses.$slug.lessons.$lessonId.tsx` | 408–436 | Quiz submit action, calls `computeResult()` + `awardXp()` |
| `app/services/quizScoringService.ts` | 166–281 | `computeResult()` — scores quiz, records attempt, calls `awardQuizXp()` |
| `app/services/gamificationService.ts` | 13–18 | `awardQuizXp()` wrapper |
| `app/services/xpService.ts` | 5–32 | `awardXp()` — deduplication lives here |
| `app/services/lessonCompletionService.ts` | 27–53 | `completeLessonForStudent()` — awards XP + streak, but not called from quiz path |

## Proposed solution

Extract a `QuizCompletionOrchestrator` service (`app/services/quizCompletionService.ts`) that owns the full post-submission pipeline:

```typescript
export function submitQuiz(
  userId: number,
  quizId: number,
  selectedAnswers: Record<number, number>,
  options?: { autoCompleteLessonOnPass?: boolean }
): QuizCompletionResult
```

The orchestrator would, in order:

1. Score the quiz via `getScore()` (pure, no side effects)
2. Record the attempt and answers in the DB
3. If passed: award XP (single call, single location)
4. If passed: record streak activity
5. If passed and `autoCompleteLessonOnPass`: call `completeLessonForStudent()` with `{ skipXp: true }` to avoid double-awarding

The route action becomes a thin adapter — parse form data, call `submitQuiz()`, redirect.

## Acceptance criteria

- [ ] `QuizCompletionOrchestrator` (`submitQuiz`) is the single call site for quiz XP and streak recording
- [ ] `computeResult()` no longer calls `awardQuizXp()` internally
- [ ] Route action no longer calls `awardXp()` directly for quiz pass
- [ ] Existing `quizXp.test.ts` tests pass against the new service
- [ ] Optional `autoCompleteLessonOnPass` flag works and does not double-award lesson XP
- [ ] Streak activity is recorded on quiz pass (currently missing)
