import { os } from "@orpc/server";
import { z } from "zod";
import { db } from "~/db";
import { pendingDeliveries } from "~/db/schema";
import { eq, lt } from "drizzle-orm";
import { getActiveKey, getUserByNameAndDomain, getDomainByName, getUserPowSettings } from "./user.server";
import { getDomain, parseAddress } from "~/lib/config";
import { hashToken } from "./utils";
import {
  getOrCreateChannel,
  insertMessage,
} from "./message.server";
import { createPowChallenge, MESSAGE_DIFFICULTY, CHANNEL_DIFFICULTY } from "./pow.server";
import { channelExists, messageExists } from "./message.server";
import { verifyAndConsumePow } from "./pow.consume";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { resolveApiUrl } from "./federation.server";

// --- oRPC Router ---

const serverInfo = os.handler(async () => {
  return {
    domain: getDomain(),
  };
});

const getPublicKey = os
  .input(z.object({ address: z.string() }))
  .handler(async ({ input }) => {
    const parsed = parseAddress(input.address);
    if (!parsed) return { publicKey: null };
    const domain = await getDomainByName(parsed.domain);
    if (!domain) return { publicKey: null };
    const user = await getUserByNameAndDomain(parsed.name, domain.id);
    if (!user || !user.passwordHash) return { publicKey: null };
    const key = await getActiveKey(user.id);
    if (!key) return { publicKey: null };
    return { publicKey: key.publicKey };
  });

const getPowChallengeEndpoint = os
  .input(
    z.object({
      senderAddress: z.string(),
      recipientAddress: z.string(),
      senderPubKey: z.string(),
      signature: z.string(),
      timestamp: z.number(),
    }),
  )
  .handler(async ({ input }) => {
    // Verify timestamp is recent (5 minutes)
    if (Math.abs(Date.now() - input.timestamp) > 5 * 60 * 1000) {
      throw new Error("Request expired");
    }

    // Look up sender's public key from their domain via federation
    const senderParsed = parseAddress(input.senderAddress);
    if (!senderParsed) throw new Error("Invalid sender address");
    const senderApiUrl = await resolveApiUrl(senderParsed.domain);
    const link = new RPCLink({ url: senderApiUrl });
    const remoteClient: {
      getPublicKey: (input: { address: string }) => Promise<{
        publicKey: string | null;
      }>;
    } = createORPCClient(link);
    const senderKeyResult = await remoteClient.getPublicKey({
      address: input.senderAddress,
    });
    if (!senderKeyResult.publicKey) throw new Error("Sender not found");

    // Verify the provided public key matches the federation lookup
    if (senderKeyResult.publicKey !== input.senderPubKey) {
      throw new Error("Public key mismatch");
    }

    // Verify the signature
    const { verify } = await import("@webbuf/secp256k1");
    const { blake3Hash } = await import("@webbuf/blake3");
    const { WebBuf } = await import("@webbuf/webbuf");
    const { FixedBuf } = await import("@webbuf/fixedbuf");

    const digest = blake3Hash(
      WebBuf.fromUtf8(
        `${input.senderAddress}:${input.recipientAddress}:${input.timestamp}`,
      ),
    );
    const sig = FixedBuf.fromHex(64, input.signature);
    const pubKey = FixedBuf.fromHex(33, input.senderPubKey);

    if (!verify(sig, digest, pubKey)) {
      throw new Error("Invalid signature");
    }

    // Look up recipient and their PoW settings
    const recipientParsed = parseAddress(input.recipientAddress);
    if (!recipientParsed) throw new Error("Invalid recipient address");
    const recipientDomain = await getDomainByName(recipientParsed.domain);
    if (!recipientDomain) throw new Error("Not found");
    const recipientUser = await getUserByNameAndDomain(
      recipientParsed.name,
      recipientDomain.id,
    );
    if (!recipientUser) throw new Error("Not found");

    const settings = await getUserPowSettings(recipientUser.id);

    // Check if channel exists → message difficulty, otherwise channel difficulty
    const hasChannel = await channelExists(
      recipientUser.id,
      input.senderAddress,
    );

    let difficulty: bigint;
    if (hasChannel) {
      difficulty = settings?.messageDifficulty ?? MESSAGE_DIFFICULTY;
    } else {
      difficulty = settings?.channelDifficulty ?? CHANNEL_DIFFICULTY;
    }

    return createPowChallenge(
      difficulty,
      input.senderAddress,
      input.recipientAddress,
    );
  });

const notifyMessage = os
  .input(
    z.object({
      senderAddress: z.string(),
      recipientAddress: z.string(),
      pullToken: z.string(),
      pow: z.object({
        solvedHeader: z.string(),
        target: z.string(),
        expiresAt: z.number(),
        signature: z.string(),
      }),
    }),
  )
  .handler(async ({ input }) => {
    try {
      // Verify recipient is local
      const recipientParsed = parseAddress(input.recipientAddress);
      if (!recipientParsed) throw new Error("Not found");
      const recipientDomain = await getDomainByName(recipientParsed.domain);
      if (!recipientDomain) throw new Error("Not found");
      const recipientUser = await getUserByNameAndDomain(
        recipientParsed.name,
        recipientDomain.id,
      );
      if (!recipientUser || !recipientUser.passwordHash)
        throw new Error("Not found");

      // Always verify PoW — difficulty is set by getPowChallenge
      const powResult = await verifyAndConsumePow(
        input.pow.solvedHeader,
        input.pow.target,
        input.pow.expiresAt,
        input.pow.signature,
        input.senderAddress,
        input.recipientAddress,
      );
      if (!powResult.valid)
        throw new Error(`Invalid proof of work: ${powResult.message}`);

      // Resolve the sender's API URL from their domain (verified via TLS)
      const senderParsed = parseAddress(input.senderAddress);
      if (!senderParsed) throw new Error("Invalid sender address");
      const senderApiUrl = await resolveApiUrl(senderParsed.domain);

      // Pull the message from the sender's server via oRPC
      const link = new RPCLink({ url: senderApiUrl });
      const remoteClient: {
        pullMessage: (input: { token: string }) => Promise<{
          senderAddress: string;
          recipientAddress: string;
          encryptedContent: string;
          senderPubKey: string;
          recipientPubKey: string;
        }>;
      } = createORPCClient(link);
      const messageData = await remoteClient.pullMessage({
        token: input.pullToken,
      });
      // Verify message size
      if (messageData.encryptedContent.length > 50_000) {
        throw new Error("Message too large");
      }
      // Verify the message matches the notification
      if (messageData.senderAddress !== input.senderAddress)
        throw new Error("Sender address mismatch");
      if (messageData.recipientAddress !== input.recipientAddress)
        throw new Error("Recipient address mismatch");

      // Store in recipient's channel (idempotent: skip if duplicate)
      const channelId = await getOrCreateChannel(
        recipientUser.id,
        messageData.senderAddress,
      );

      const duplicate = await messageExists(
        channelId,
        messageData.senderPubKey,
        messageData.recipientPubKey,
        messageData.encryptedContent,
      );

      if (!duplicate) {
        await insertMessage(
          channelId,
          messageData.senderAddress,
          messageData.encryptedContent,
          messageData.senderPubKey,
          messageData.recipientPubKey,
          false,
        );
      }

      return { success: true };
    } catch (err) {
      console.error("notifyMessage handler failed:", err);
      throw err;
    }
  });

const pullMessage = os
  .input(z.object({ token: z.string() }))
  .handler(async ({ input }) => {
    const hash = hashToken(input.token);

    // Idempotent pull: return the delivery without deleting it.
    // Expired deliveries are cleaned up lazily below.
    const [delivery] = await db
      .select()
      .from(pendingDeliveries)
      .where(eq(pendingDeliveries.tokenHash, hash))
      .limit(1);

    if (!delivery) throw new Error("Not found");

    // Lazy cleanup: delete expired pending deliveries
    await db
      .delete(pendingDeliveries)
      .where(lt(pendingDeliveries.expiresAt, new Date()));

    return {
      senderAddress: delivery.senderAddress,
      recipientAddress: delivery.recipientAddress,
      encryptedContent: delivery.encryptedContent,
      senderPubKey: delivery.senderPubKey,
      recipientPubKey: delivery.recipientPubKey,
    };
  });

export const apiRouter = {
  serverInfo,
  getPublicKey,
  getPowChallenge: getPowChallengeEndpoint,
  notifyMessage,
  pullMessage,
};
