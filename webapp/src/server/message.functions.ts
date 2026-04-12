import { createServerFn } from "@tanstack/react-start";
import {
  getOrCreateChannel,
  getOrCreateChannelPair,
  insertMessage,
  getUserChannels,
  getChannelMessages,
  getChannelByCounterparty,
  getNewMessages,
  markChannelRead,
  getUnreadCount,
  getChannelUnreadCounts,
} from "./message.server";
import {
  getUserById,
  getUserByNameAndDomain,
  getActiveKey,
  isLocalDomain,
  getDomainByName,
  getDomainById,
  insertPowLog,
} from "./user.server";
import { verifyAndConsumePow } from "./pow.consume";
import { PowSolutionSchema } from "./schemas";
import { getSessionUserId } from "./session";
import { authMiddleware } from "./auth-middleware";
import { z } from "zod";
import { parseAddress, makeAddress } from "~/lib/config";
import {
  fetchRemotePublicKey,
  deliverRemoteMessage,
  fetchRemotePowChallenge,
} from "./federation.server";

export const getPublicKeyForAddress = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: address }) => {
    const parsed = parseAddress(address);
    if (!parsed) return null;

    const local = await isLocalDomain(parsed.domain);
    if (local) {
      const domain = await getDomainByName(parsed.domain);
      if (!domain) return null;
      const user = await getUserByNameAndDomain(parsed.name, domain.id);
      if (!user || !user.passwordHash) return null;
      const key = await getActiveKey(user.id);
      if (!key) return null;
      return { publicKey: key.publicKey };
    }
    // Remote user — proxy the request
    const publicKey = await fetchRemotePublicKey(address);
    return publicKey ? { publicKey } : null;
  });

const MAX_CIPHERTEXT_LENGTH = 50_000; // hex chars (~25KB plaintext)

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      recipientAddress: z.string(),
      encryptedContent: z
        .string()
        .max(MAX_CIPHERTEXT_LENGTH, "Message too large"),
      senderPubKey: z.string(),
      recipientPubKey: z.string(),
      pow: PowSolutionSchema,
    }),
  )
  .handler(async ({ data: input, context: { userId: senderId } }) => {
    const senderUser = await getUserById(senderId);
    if (!senderUser || !senderUser.passwordHash)
      throw new Error("Account not saved");
    if (!senderUser.name || !senderUser.domainId)
      throw new Error("Account not saved");

    const senderDomain = await getDomainById(senderUser.domainId);
    if (!senderDomain) throw new Error("Domain not found");
    const senderAddress = makeAddress(senderUser.name, senderDomain.domain);

    const parsed = parseAddress(input.recipientAddress);
    if (!parsed) throw new Error("Invalid recipient address");

    const local = await isLocalDomain(parsed.domain);

    if (local) {
      // --- Local delivery ---
      const recipientDomain = await getDomainByName(parsed.domain);
      if (!recipientDomain) throw new Error("Recipient domain not found");
      const recipientUser = await getUserByNameAndDomain(
        parsed.name,
        recipientDomain.id,
      );
      if (!recipientUser) throw new Error("Recipient not found");
      if (recipientUser.id === senderUser.id)
        throw new Error("Cannot message yourself");
      if (!recipientUser.passwordHash) throw new Error("Recipient not found");

      // Verify PoW locally (addresses bound in challenge signature)
      const powResult = await verifyAndConsumePow(
        input.pow.solvedHeader,
        input.pow.target,
        input.pow.expiresAt,
        input.pow.signature,
        input.pow.senderAddress,
        input.pow.recipientAddress,
      );
      if (!powResult.valid)
        throw new Error(`Invalid proof of work: ${powResult.message}`);

      const { senderChannelId, recipientChannelId } =
        await getOrCreateChannelPair(
          senderUser.id,
          recipientUser.id,
          senderAddress,
          input.recipientAddress,
        );

      await insertMessage(
        senderChannelId,
        senderAddress,
        input.encryptedContent,
        input.senderPubKey,
        input.recipientPubKey,
        true,
      );
      await insertMessage(
        recipientChannelId,
        senderAddress,
        input.encryptedContent,
        input.senderPubKey,
        input.recipientPubKey,
        false,
      );
    } else {
      // --- Remote delivery ---
      // PoW is verified by recipient's server in notifyMessage.
      const senderChannelId = await getOrCreateChannel(
        senderUser.id,
        input.recipientAddress,
      );
      await insertMessage(
        senderChannelId,
        senderAddress,
        input.encryptedContent,
        input.senderPubKey,
        input.recipientPubKey,
        true,
      );

      await deliverRemoteMessage(
        senderAddress,
        input.recipientAddress,
        input.encryptedContent,
        input.senderPubKey,
        input.recipientPubKey,
        input.pow,
      );
    }

    // Log PoW against the sender (they did the work)
    const { difficultyFromTarget } = await import("@keypears/pow5");
    const { FixedBuf } = await import("@webbuf/fixedbuf");
    const target = FixedBuf.fromHex(32, input.pow.target);
    const difficulty = difficultyFromTarget(target);
    await insertPowLog(senderId, "pow5-64b", difficulty);

    return { success: true };
  });

export const getMyChannels = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await getSessionUserId();
    if (!userId) return [];
    const [channelList, unreadCounts] = await Promise.all([
      getUserChannels(userId),
      getChannelUnreadCounts(userId),
    ]);

    const unreadMap = new Map(unreadCounts.map((u) => [u.channelId, u.cnt]));

    return channelList.map((ch) => ({
      id: ch.id,
      counterpartyAddress: ch.counterpartyAddress,
      updatedAt: ch.updatedAt,
      unreadCount: unreadMap.get(ch.id) ?? 0,
    }));
  },
);

async function resolveChannel(userId: string, counterpartyAddress: string) {
  const channel = await getChannelByCounterparty(userId, counterpartyAddress);
  if (!channel) throw new Error("Channel not found");
  return channel;
}

export const getMessagesForChannel = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: counterpartyAddress, context: { userId } }) => {
    const channel = await resolveChannel(userId, counterpartyAddress);
    return getChannelMessages(channel.id, userId);
  });

export const getOlderMessages = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      counterpartyAddress: z.string(),
      beforeId: z.string(),
    }),
  )
  .handler(async ({ data, context: { userId } }) => {
    const channel = await resolveChannel(userId, data.counterpartyAddress);
    return getChannelMessages(channel.id, userId, undefined, data.beforeId);
  });

export const pollNewMessages = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      counterpartyAddress: z.string(),
      afterId: z.string(),
    }),
  )
  .handler(async ({ data, context: { userId } }) => {
    const channel = await resolveChannel(userId, data.counterpartyAddress);
    return getNewMessages(channel.id, userId, data.afterId);
  });

export const markChannelAsRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: counterpartyAddress, context: { userId } }) => {
    const channel = await resolveChannel(userId, counterpartyAddress);
    await markChannelRead(channel.id);
    return { success: true };
  });

export const getMyUnreadCount = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await getSessionUserId();
    if (!userId) return 0;
    return getUnreadCount(userId);
  },
);

export const getMyActiveEncryptedKey = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .handler(async ({ context: { userId } }) => {
    const key = await getActiveKey(userId);
    if (!key) throw new Error("No key found");
    return {
      publicKey: key.publicKey,
      encryptedPrivateKey: key.encryptedPrivateKey,
    };
  });

export const getRemotePowChallenge = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      recipientAddress: z.string(),
      senderAddress: z.string(),
      senderPubKey: z.string(),
      signature: z.string(),
      timestamp: z.number(),
    }),
  )
  .handler(async ({ data: input }) => {
    return fetchRemotePowChallenge(input);
  });
