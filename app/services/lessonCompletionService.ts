import { markLessonComplete, isLessonCompleted } from "./progressService";
import { awardXp } from "./xpService";
import { recordStreakActivity } from "./streakService";
import { getLessonById, getLessonsByModule } from "./lessonService";
import { getModuleById } from "./moduleService";

const LESSON_COMPLETION_XP = 10;

export interface ModuleCompletionSummary {
  moduleId: number;
  moduleTitle: string;
  totalXp: number;
}

export interface LessonCompletionResult {
  success: boolean;
  xpAwarded: number;
  moduleCompletion: ModuleCompletionSummary | null;
}

export interface LessonCompletionOptions {
  skipXp?: boolean;
  skipStreak?: boolean;
  idempotent?: boolean;
}

export function completeLessonForStudent(
  userId: number,
  lessonId: number,
  options: LessonCompletionOptions = {}
): LessonCompletionResult {
  if (isLessonCompleted(userId, lessonId)) {
    if (options.idempotent) {
      return { success: true, xpAwarded: 0, moduleCompletion: null };
    }
  }

  markLessonComplete(userId, lessonId);

  let xpAwarded = 0;
  if (!options.skipXp) {
    const event = awardXp(userId, LESSON_COMPLETION_XP, "lesson_complete", lessonId);
    if (event) xpAwarded = LESSON_COMPLETION_XP;
  }

  if (!options.skipStreak) {
    recordStreakActivity(userId);
  }

  const moduleCompletion = resolveModuleCompletion(userId, lessonId);

  return { success: true, xpAwarded, moduleCompletion };
}

function resolveModuleCompletion(
  userId: number,
  lessonId: number
): ModuleCompletionSummary | null {
  const lesson = getLessonById(lessonId);
  if (!lesson) return null;

  const moduleLessons = getLessonsByModule(lesson.moduleId);
  const allComplete = moduleLessons.every(
    (l) => l.id === lessonId || isLessonCompleted(userId, l.id)
  );
  if (!allComplete) return null;

  const moduleRecord = getModuleById(lesson.moduleId);
  return {
    moduleId: lesson.moduleId,
    moduleTitle: moduleRecord?.title ?? "Module",
    totalXp: moduleLessons.length * LESSON_COMPLETION_XP,
  };
}
