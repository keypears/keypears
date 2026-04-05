import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import {
  getOrCreateChannel,
  getOrCreateChannelPair,
  channelExists,
  insertMessage,
  getUserChannels,
  getChannelMessages,
  getChannelByCounterparty,
  getNewMessages,
  markChannelRead,
  getUnreadCount,
  getChannelUnreadCounts,
} from "./message.server";
import { getUserById, getUserByName, getActiveKey } from "./user.server";
import { verifyAndConsumePow } from "./pow.consume";
import { PowSolutionSchema } from "./schemas";
import { z } from "zod";
import { parseLocalAddress, parseAddress, makeAddress, getDomain } from "~/lib/config";
import { fetchRemotePublicKey, deliverRemoteMessage } from "./federation.server";

const COOKIE_NAME = "user_id";

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
      pow: PowSolutionSchema.optional(),
    }),
  )
  .handler(async ({ data: input }) => {
    const senderId = getCookie(COOKIE_NAME);
    if (!senderId) throw new Error("Not logged in");
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

      const alreadyExists = await channelExists(senderUser.id, input.recipientAddress);
      if (!alreadyExists) {
        if (!input.pow)
          throw new Error("Proof of work required for new channel");
        const powResult = await verifyAndConsumePow(
          input.pow.solvedHeader,
          input.pow.target,
          input.pow.expiresAt,
          input.pow.signature,
        );
        if (!powResult.valid)
          throw new Error(`Invalid proof of work: ${powResult.message}`);
      }

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
      // PoW is enforced by the recipient's server in notifyMessage,
      // not here. The sender's server just delivers.
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

      // Deliver to remote server via pull model
      await deliverRemoteMessage(
        senderAddress,
        input.recipientAddress,
        input.encryptedContent,
        input.senderPubKey,
        input.recipientPubKey,
      );
    }

    return { success: true };
  });

export const getMyChannels = createServerFn({ method: "GET" }).handler(
  async () => {
    const id = getCookie(COOKIE_NAME);
    if (!id) return [];
    const userId = id;
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
  const id = getCookie(COOKIE_NAME);
  if (!id) throw new Error("Not logged in");
  const channel = await getChannelByCounterparty(id, counterpartyAddress);
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
    const id = getCookie(COOKIE_NAME);
    if (!id) return 0;
    return getUnreadCount(id);
  },
);

export const getMyActiveEncryptedKey = createServerFn({
  method: "GET",
}).handler(async () => {
  const id = getCookie(COOKIE_NAME);
  if (!id) throw new Error("Not logged in");
  const key = await getActiveKey(id);
  if (!key) throw new Error("No key found");
  return {
    publicKey: key.publicKey,
    encryptedPrivateKey: key.encryptedPrivateKey,
  };
});
