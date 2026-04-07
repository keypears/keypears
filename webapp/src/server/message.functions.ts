import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
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
import { getUserById, getUserByName, getActiveKey, resolveSession } from "./user.server";
import { verifyAndConsumePow } from "./pow.consume";
import { PowSolutionSchema } from "./schemas";
import { z } from "zod";
import { parseLocalAddress, parseAddress, makeAddress, getDomain } from "~/lib/config";
import { fetchRemotePublicKey, deliverRemoteMessage, fetchRemotePowChallenge } from "./federation.server";

const COOKIE_NAME = "session";

async function getSessionUserId(): Promise<string | null> {
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;
  return resolveSession(token);
}

async function requireSessionUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not logged in");
  return userId;
}

export const getPublicKeyForAddress = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: address }) => {
    const name = parseLocalAddress(address);
    if (name != null) {
      // Local user
      const user = await getUserByName(name);
      if (!user || !user.passwordHash) return null;
      const key = await getActiveKey(user.id);
      if (!key) return null;
      return { publicKey: key.publicKey };
    }
    // Remote user — proxy the request
    const publicKey = await fetchRemotePublicKey(address);
    return publicKey ? { publicKey } : null;
  });

export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      recipientAddress: z.string(),
      encryptedContent: z.string(),
      senderPubKey: z.string(),
      recipientPubKey: z.string(),
      pow: PowSolutionSchema,
    }),
  )
  .handler(async ({ data: input }) => {
    const senderId = await requireSessionUserId();
    const senderUser = await getUserById(senderId);
    if (!senderUser || !senderUser.passwordHash)
      throw new Error("Account not saved");

    if (!senderUser.name) throw new Error("Account not saved");
    const senderAddress = makeAddress(senderUser.name);
    const parsed = parseAddress(input.recipientAddress);
    if (!parsed) throw new Error("Invalid recipient address");

    const isLocal = parsed.domain === getDomain();

    if (isLocal) {
      // --- Local delivery ---
      const recipientUser = await getUserByName(parsed.name);
      if (!recipientUser) throw new Error("Recipient not found");
      if (recipientUser.id === senderUser.id)
        throw new Error("Cannot message yourself");
      if (!recipientUser || !recipientUser.passwordHash)
        throw new Error("Recipient not found");

      // Verify PoW locally
      const powResult = await verifyAndConsumePow(
        input.pow.solvedHeader,
        input.pow.target,
        input.pow.expiresAt,
        input.pow.signature,
      );
      if (!powResult.valid)
        throw new Error(`Invalid proof of work: ${powResult.message}`);

      const { senderChannelId, recipientChannelId } =
        await getOrCreateChannelPair(senderUser.id, recipientUser.id, senderAddress, input.recipientAddress);

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

async function resolveChannel(counterpartyAddress: string) {
  const userId = await requireSessionUserId();
  const channel = await getChannelByCounterparty(userId, counterpartyAddress);
  if (!channel) throw new Error("Channel not found");
  return channel;
}

export const getMessagesForChannel = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: counterpartyAddress }) => {
    const channel = await resolveChannel(counterpartyAddress);
    return getChannelMessages(channel.id);
  });

export const getOlderMessages = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      counterpartyAddress: z.string(),
      beforeId: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const channel = await resolveChannel(data.counterpartyAddress);
    return getChannelMessages(channel.id, undefined, data.beforeId);
  });

export const pollNewMessages = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      counterpartyAddress: z.string(),
      afterId: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const channel = await resolveChannel(data.counterpartyAddress);
    return getNewMessages(channel.id, data.afterId);
  });

export const markChannelAsRead = createServerFn({ method: "POST" })
  .inputValidator(z.string())
  .handler(async ({ data: counterpartyAddress }) => {
    const channel = await resolveChannel(counterpartyAddress);
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
}).handler(async () => {
  const userId = await requireSessionUserId();
  const key = await getActiveKey(userId);
  if (!key) throw new Error("No key found");
  return {
    publicKey: key.publicKey,
    encryptedPrivateKey: key.encryptedPrivateKey,
  };
});

export const getRemotePowChallenge = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: recipientAddress }) => {
    return fetchRemotePowChallenge(recipientAddress);
  });
