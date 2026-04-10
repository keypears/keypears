import { db } from "~/db";
import { posts } from "~/db/schema";
import { eq, desc, and, lt } from "drizzle-orm";
import { newId } from "./utils";

export async function insertPost(
  userId: string,
  senderAddress: string,
  content: string,
  difficulty: bigint,
) {
  const id = newId();
  await db.insert(posts).values({
    id,
    userId,
    senderAddress,
    content,
    difficulty,
  });
  return { id };
}

export async function getFeedPosts(limit = 20, beforeId?: string) {
  const conditions = beforeId ? lt(posts.id, beforeId) : undefined;

  return db
    .select({
      id: posts.id,
      senderAddress: posts.senderAddress,
      content: posts.content,
      difficulty: posts.difficulty,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(conditions)
    .orderBy(desc(posts.id))
    .limit(limit);
}

export async function getUserPosts(
  userId: string,
  limit = 20,
  beforeId?: string,
) {
  const conditions = beforeId
    ? and(eq(posts.userId, userId), lt(posts.id, beforeId))
    : eq(posts.userId, userId);

  return db
    .select({
      id: posts.id,
      senderAddress: posts.senderAddress,
      content: posts.content,
      difficulty: posts.difficulty,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(conditions)
    .orderBy(desc(posts.id))
    .limit(limit);
}
