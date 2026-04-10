import { db } from "~/db";
import { posts } from "~/db/schema";
import { eq, desc, and, lt } from "drizzle-orm";
import { newId } from "./utils";
import { REGISTRATION_DIFFICULTY } from "./pow.server";

const BASE_POST_DIFFICULTY = REGISTRATION_DIFFICULTY; // 70M
const THROTTLE_WINDOW_SECONDS = 600; // 10 minutes
const THROTTLE_POST_COUNT = 10; // look at 10th most recent post

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

export async function getPostDifficulty(): Promise<bigint> {
  const [row] = await db
    .select({ createdAt: posts.createdAt })
    .from(posts)
    .orderBy(desc(posts.id))
    .limit(1)
    .offset(THROTTLE_POST_COUNT - 1);

  if (!row) return BASE_POST_DIFFICULTY;

  const elapsed = (Date.now() - row.createdAt.getTime()) / 1000;
  if (elapsed >= THROTTLE_WINDOW_SECONDS) return BASE_POST_DIFFICULTY;

  const exponent = Math.floor(
    (THROTTLE_WINDOW_SECONDS - elapsed) / 60,
  );
  return BASE_POST_DIFFICULTY * (1n << BigInt(exponent));
}
