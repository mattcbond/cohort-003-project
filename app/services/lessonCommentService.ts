import { eq, asc, isNull, and } from "drizzle-orm";
import { db } from "~/db";
import { lessonComments, users, lessons, modules } from "~/db/schema";

// ─── Lesson Comment Service ───
// Handles student comments on lessons, with instructor moderation (hide/delete).

export function getLessonComments(lessonId: number) {
  return db
    .select({
      id: lessonComments.id,
      content: lessonComments.content,
      isHidden: lessonComments.isHidden,
      createdAt: lessonComments.createdAt,
      userId: lessonComments.userId,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(and(eq(lessonComments.lessonId, lessonId), isNull(lessonComments.deletedAt)))
    .orderBy(asc(lessonComments.createdAt))
    .all();
}

export function getAllLessonCommentsForCourse(courseId: number) {
  return db
    .select({
      id: lessonComments.id,
      content: lessonComments.content,
      isHidden: lessonComments.isHidden,
      createdAt: lessonComments.createdAt,
      lessonId: lessonComments.lessonId,
      lessonTitle: lessons.title,
      userId: lessonComments.userId,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .innerJoin(lessons, eq(lessonComments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(and(eq(modules.courseId, courseId), isNull(lessonComments.deletedAt)))
    .orderBy(asc(lessonComments.createdAt))
    .all();
}

export function getCommentById(commentId: number) {
  return db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .get();
}

export function createComment(lessonId: number, userId: number, content: string) {
  return db
    .insert(lessonComments)
    .values({ lessonId, userId, content })
    .returning()
    .get();
}

export function deleteComment(commentId: number) {
  return db
    .update(lessonComments)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(lessonComments.id, commentId))
    .run();
}

export function setCommentHidden(commentId: number, isHidden: boolean) {
  return db
    .update(lessonComments)
    .set({ isHidden })
    .where(eq(lessonComments.id, commentId))
    .run();
}
