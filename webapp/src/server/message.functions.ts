import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import {
  getOrCreateChannelPair,
  channelExists,
  insertMessage,
  getUserChannels,
  getChannelMessages,
  getChannelById,
  getNewMessages,
  markChannelRead,
  getUnreadCount,
  getChannelUnreadCounts,
} from "./message.server";
import { getUserById, getActiveKey } from "./user.server";
import { verifyPowSolution } from "./pow.server";
import { PowSolutionSchema } from "./schemas";
import { z } from "zod";

const COOKIE_NAME = "user_id";

function parseAddress(address: string): number | null {
  const match = address.match(/^(\d+)@keypears\.com$/);
  return match ? Number(match[1]) : null;
}

export const getPublicKeyForAddress = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: address }) => {
    const id = parseAddress(address);
    if (id == null) return null;
    const user = await getUserById(id);
    if (!user || !user.passwordHash) return null;
    const key = await getActiveKey(id);
    if (!key) return null;
    return { publicKey: key.publicKey };
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
    const senderUser = await getUserById(Number(senderId));
    if (!senderUser || !senderUser.passwordHash)
      throw new Error("Account not saved");

    const recipientId = parseAddress(input.recipientAddress);
    if (recipientId == null) throw new Error("Invalid recipient address");
    if (recipientId === senderUser.id)
      throw new Error("Cannot message yourself");
    const recipientUser = await getUserById(recipientId);
    if (!recipientUser || !recipientUser.passwordHash)
      throw new Error("Recipient not found");

    // Check if channel exists — if not, require PoW
    const alreadyExists = await channelExists(senderUser.id, recipientId);
    if (!alreadyExists) {
      if (!input.pow) throw new Error("Proof of work required for new channel");
      const powResult = verifyPowSolution(
        input.pow.solvedHeader,
        input.pow.target,
        input.pow.expiresAt,
        input.pow.signature,
      );
      if (!powResult.valid)
        throw new Error(`Invalid proof of work: ${powResult.message}`);
    }

    const senderAddress = `${senderUser.id}@keypears.com`;

    // Create channels for both sides and insert message into both
    const { senderChannelId, recipientChannelId } =
      await getOrCreateChannelPair(senderUser.id, recipientId);

    // Sender's copy is read, recipient's is unread
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

    return { success: true };
  });

export const getMyChannels = createServerFn({ method: "GET" }).handler(
  async () => {
    const id = getCookie(COOKIE_NAME);
    if (!id) return [];
    const userId = Number(id);
    const [channelList, unreadCounts] = await Promise.all([
      getUserChannels(userId),
      getChannelUnreadCounts(userId),
    ]);

    const unreadMap = new Map(unreadCounts.map((u) => [u.channelId, u.cnt]));

    return channelList.map((ch) => ({
      id: ch.id,
      counterpartyAddress: `${ch.counterpartyId}@keypears.com`,
      updatedAt: ch.updatedAt,
      unreadCount: unreadMap.get(ch.id) ?? 0,
    }));
  },
);

export const getMessagesForChannel = createServerFn({ method: "GET" })
  .inputValidator(z.number())
  .handler(async ({ data: channelId }) => {
    const id = getCookie(COOKIE_NAME);
    if (!id) throw new Error("Not logged in");

    const channel = await getChannelById(channelId);
    if (!channel || channel.ownerId !== Number(id))
      throw new Error("Channel not found");

    return getChannelMessages(channelId);
  });

export const pollNewMessages = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      channelId: z.number(),
      afterId: z.number(),
    }),
  )
  .handler(async ({ data }) => {
    const id = getCookie(COOKIE_NAME);
    if (!id) throw new Error("Not logged in");

    const channel = await getChannelById(data.channelId);
    if (!channel || channel.ownerId !== Number(id))
      throw new Error("Channel not found");

    return getNewMessages(data.channelId, data.afterId);
  });

export const markChannelAsRead = createServerFn({ method: "POST" })
  .inputValidator(z.number())
  .handler(async ({ data: channelId }) => {
    const id = getCookie(COOKIE_NAME);
    if (!id) throw new Error("Not logged in");

    const channel = await getChannelById(channelId);
    if (!channel || channel.ownerId !== Number(id))
      throw new Error("Channel not found");

    await markChannelRead(channelId);
    return { success: true };
  });

export const getMyUnreadCount = createServerFn({ method: "GET" }).handler(
  async () => {
    const id = getCookie(COOKIE_NAME);
    if (!id) return 0;
    return getUnreadCount(Number(id));
  },
);

export const getMyActiveEncryptedKey = createServerFn({
  method: "GET",
}).handler(async () => {
  const id = getCookie(COOKIE_NAME);
  if (!id) throw new Error("Not logged in");
  const key = await getActiveKey(Number(id));
  if (!key) throw new Error("No key found");
  return {
    publicKey: key.publicKey,
    encryptedPrivateKey: key.encryptedPrivateKey,
  };
});
