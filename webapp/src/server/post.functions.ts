import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSessionUserId } from "./session";
import {
  getUserById,
  getDomainById,
  insertPowLog,
} from "./user.server";
import { verifyAndConsumePow } from "./pow.consume";
import { PowSolutionSchema } from "./schemas";
import { insertPost, getFeedPosts, getUserPosts, getPostDifficulty } from "./post.server";
import { createPowChallenge } from "./pow.server";
import { getUserByNameAndDomain, getDomainByName } from "./user.server";
import { makeAddress, parseAddress } from "~/lib/config";

export const getPostPowChallenge = createServerFn({ method: "GET" }).handler(
  async () => {
    const difficulty = await getPostDifficulty();
    return createPowChallenge(difficulty);
  },
);

export const createPost = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      content: z.string().min(1, "Post cannot be empty").max(240, "Post too long"),
      pow: PowSolutionSchema,
    }),
  )
  .handler(async ({ data: input }) => {
    const userId = await requireSessionUserId();
    const user = await getUserById(userId);
    if (!user?.name || !user.domainId) throw new Error("Account not saved");
    const domain = await getDomainById(user.domainId);
    if (!domain) throw new Error("Domain not found");
    const senderAddress = makeAddress(user.name, domain.domain);

    // Verify PoW
    const powResult = await verifyAndConsumePow(
      input.pow.solvedHeader,
      input.pow.target,
      input.pow.expiresAt,
      input.pow.signature,
    );
    if (!powResult.valid)
      throw new Error(`Invalid proof of work: ${powResult.message}`);

    // Extract difficulty from target
    const { difficultyFromTarget } = await import("@keypears/pow5");
    const { FixedBuf } = await import("@webbuf/fixedbuf");
    const target = FixedBuf.fromHex(32, input.pow.target);
    const difficulty = difficultyFromTarget(target);

    await insertPost(userId, senderAddress, input.content, difficulty);
    await insertPowLog(userId, "pow5-64b", difficulty);

    return { success: true };
  });

export const getFeed = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({ beforeId: z.string().optional() }),
  )
  .handler(async ({ data: input }) => {
    const rows = await getFeedPosts(20, input.beforeId);
    return rows.map((r) => ({
      id: r.id,
      senderAddress: r.senderAddress,
      content: r.content,
      difficulty: r.difficulty.toString(),
      createdAt: r.createdAt,
    }));
  });

export const getUserPostsByAddress = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      address: z.string(),
      beforeId: z.string().optional(),
    }),
  )
  .handler(async ({ data: input }) => {
    const parsed = parseAddress(input.address);
    if (!parsed) return [];
    const domain = await getDomainByName(parsed.domain);
    if (!domain) return [];
    const user = await getUserByNameAndDomain(parsed.name, domain.id);
    if (!user) return [];
    const rows = await getUserPosts(user.id, 20, input.beforeId);
    return rows.map((r) => ({
      id: r.id,
      senderAddress: r.senderAddress,
      content: r.content,
      difficulty: r.difficulty.toString(),
      createdAt: r.createdAt,
    }));
  });
