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
} from "./message.server";
import { getUserById, getActiveKey } from "./user.server";
import { verifyPowSolution } from "./pow.server";

const COOKIE_NAME = "user_id";

function parseAddress(address: string): number | null {
  const match = address.match(/^(\d+)@keypears\.com$/);
  return match ? Number(match[1]) : null;
}

export const getPublicKeyForAddress = createServerFn({ method: "GET" })
  .inputValidator((address: string) => address)
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
    (data: {
      recipientAddress: string;
      encryptedContent: string;
      senderPubKey: string;
      recipientPubKey: string;
      pow?: {
        solvedHeader: string;
        target: string;
        expiresAt: number;
        signature: string;
      };
    }) => data,
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

    await insertMessage(
      senderChannelId,
      senderAddress,
      input.encryptedContent,
      input.senderPubKey,
      input.recipientPubKey,
    );
    await insertMessage(
      recipientChannelId,
      senderAddress,
      input.encryptedContent,
      input.senderPubKey,
      input.recipientPubKey,
    );

    return { success: true };
  });

export const getMyChannels = createServerFn({ method: "GET" }).handler(
  async () => {
    const id = getCookie(COOKIE_NAME);
    if (!id) return [];
    const channelList = await getUserChannels(Number(id));

    // Resolve counterparty addresses
    const results = await Promise.all(
      channelList.map(async (ch) => ({
        id: ch.id,
        counterpartyAddress: `${ch.counterpartyId}@keypears.com`,
        updatedAt: ch.updatedAt,
      })),
    );
    return results;
  },
);

export const getMessagesForChannel = createServerFn({ method: "GET" })
  .inputValidator((channelId: number) => channelId)
  .handler(async ({ data: channelId }) => {
    const id = getCookie(COOKIE_NAME);
    if (!id) throw new Error("Not logged in");

    // Verify channel belongs to user
    const channel = await getChannelById(channelId);
    if (!channel || channel.ownerId !== Number(id))
      throw new Error("Channel not found");

    return getChannelMessages(channelId);
  });

export const pollNewMessages = createServerFn({ method: "GET" })
  .inputValidator((data: { channelId: number; afterId: number }) => data)
  .handler(async ({ data }) => {
    const id = getCookie(COOKIE_NAME);
    if (!id) throw new Error("Not logged in");

    const channel = await getChannelById(data.channelId);
    if (!channel || channel.ownerId !== Number(id))
      throw new Error("Channel not found");

    return getNewMessages(data.channelId, data.afterId);
  });

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
