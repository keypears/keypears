import { os } from "@orpc/server";
import { z } from "zod";
import { db } from "~/db";
import { pendingDeliveries } from "~/db/schema";
import { eq } from "drizzle-orm";
import { blake3Hash } from "@webbuf/blake3";
import { WebBuf } from "@webbuf/webbuf";
import { getActiveKey, getUserByName } from "./user.server";
import { parseLocalAddress, getDomain, getApiUrl, parseAddress } from "~/lib/config";
import {
  getOrCreateChannel,
  insertMessage,
} from "./message.server";
import { createPowChallenge, LOGIN_DIFFICULTY } from "./pow.server";
import { verifyAndConsumePow } from "./pow.consume";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { resolveApiUrl } from "./federation.server";

function hashToken(token: string): string {
  return blake3Hash(WebBuf.fromUtf8(token)).buf.toHex();
}

// --- oRPC Router ---

const serverInfo = os.handler(async () => {
  return {
    domain: getDomain(),
    apiUrl: getApiUrl(),
  };
});

const getPublicKey = os
  .input(z.object({ address: z.string() }))
  .handler(async ({ input }) => {
    const name = parseLocalAddress(input.address);
    if (name == null) return { publicKey: null };
    const user = await getUserByName(name);
    if (!user || !user.passwordHash) return { publicKey: null };
    const key = await getActiveKey(user.id);
    if (!key) return { publicKey: null };
    return { publicKey: key.publicKey };
  });

const getPowChallengeEndpoint = os.handler(async () => {
  return createPowChallenge(LOGIN_DIFFICULTY);
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
      const recipientName = parseLocalAddress(input.recipientAddress);
      if (recipientName == null)
        throw new Error("Recipient not found on this server");
      const recipientUser = await getUserByName(recipientName);
      if (!recipientUser || !recipientUser.passwordHash)
        throw new Error("Recipient not found");

      // Always verify PoW — difficulty is set by getPowChallenge
      const powResult = await verifyAndConsumePow(
        input.pow.solvedHeader,
        input.pow.target,
        input.pow.expiresAt,
        input.pow.signature,
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
      // Verify the message matches the notification
      if (messageData.senderAddress !== input.senderAddress)
        throw new Error("Sender address mismatch");
      if (messageData.recipientAddress !== input.recipientAddress)
        throw new Error("Recipient address mismatch");

      // Store in recipient's channel
      const channelId = await getOrCreateChannel(
        recipientUser.id,
        messageData.senderAddress,
      );

      await insertMessage(
        channelId,
        messageData.senderAddress,
        messageData.encryptedContent,
        messageData.senderPubKey,
        messageData.recipientPubKey,
        false,
      );

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

    const [delivery] = await db
      .select()
      .from(pendingDeliveries)
      .where(eq(pendingDeliveries.tokenHash, hash))
      .limit(1);

    if (!delivery) throw new Error("Message not found or already pulled");

    // Delete after pulling (one-time use)
    await db
      .delete(pendingDeliveries)
      .where(eq(pendingDeliveries.id, delivery.id));

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
