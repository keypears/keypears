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
import { WebBuf } from "@webbuf/webbuf";
import { parseAddress, makeAddress } from "~/lib/config";
import { verifyMessageSignature } from "~/lib/message";
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
      return {
        ed25519PublicKey: key.ed25519PublicKey.toHex(),
        x25519PublicKey: key.x25519PublicKey.toHex(),
        signingPublicKey: key.signingPublicKey.toHex(),
        encapPublicKey: key.encapPublicKey.toHex(),
      };
    }
    // Remote user — proxy the request (already returns hex from oRPC)
    const remoteKeys = await fetchRemotePublicKey(address);
    return remoteKeys;
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
      senderEncryptedContent: z
        .string()
        .max(MAX_CIPHERTEXT_LENGTH, "Message too large"),
      senderEd25519PubKey: z.string(),
      senderX25519PubKey: z.string(),
      senderPubKey: z.string(),
      recipientX25519PubKey: z.string(),
      recipientPubKey: z.string(),
      senderSignature: z.string(),
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

    // Validate senderPubKey matches the authenticated user's active signing key
    const senderActiveKey = await getActiveKey(senderId);
    if (!senderActiveKey) throw new Error("No active key");
    if (input.senderPubKey !== senderActiveKey.signingPublicKey.toHex()) {
      throw new Error("senderPubKey does not match your active signing key");
    }
    // Validate senderEd25519PubKey matches the authenticated user's active ed25519 key
    if (input.senderEd25519PubKey !== senderActiveKey.ed25519PublicKey.toHex()) {
      throw new Error("senderEd25519PubKey does not match your active ed25519 key");
    }

    // Convert hex inputs to WebBuf for DB and crypto operations
    const encryptedContentBuf = WebBuf.fromHex(input.encryptedContent);
    const senderEncryptedContentBuf = WebBuf.fromHex(
      input.senderEncryptedContent,
    );
    const senderEd25519PubKeyBuf = WebBuf.fromHex(input.senderEd25519PubKey);
    const senderX25519PubKeyBuf = WebBuf.fromHex(input.senderX25519PubKey);
    const senderPubKeyBuf = WebBuf.fromHex(input.senderPubKey);
    const recipientX25519PubKeyBuf = WebBuf.fromHex(input.recipientX25519PubKey);
    const recipientPubKeyBuf = WebBuf.fromHex(input.recipientPubKey);
    const senderSignatureBuf = WebBuf.fromHex(input.senderSignature);

    // Validate PoW binding: sender/recipient in PoW must match actual addresses
    if (input.pow.senderAddress !== senderAddress) {
      throw new Error("PoW senderAddress does not match session");
    }
    if (input.pow.recipientAddress !== input.recipientAddress) {
      throw new Error("PoW recipientAddress does not match recipient");
    }

    // Verify sender signature before storing
    const sigValid = verifyMessageSignature(
      senderAddress,
      input.recipientAddress,
      senderEd25519PubKeyBuf,
      senderPubKeyBuf,
      senderX25519PubKeyBuf,
      recipientX25519PubKeyBuf,
      recipientPubKeyBuf,
      encryptedContentBuf,
      senderEncryptedContentBuf,
      senderSignatureBuf,
    );
    if (!sigValid) throw new Error("Invalid sender signature");

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

      // Validate recipientPubKey matches the recipient's active encap key
      const recipientActiveKey = await getActiveKey(recipientUser.id);
      if (!recipientActiveKey) throw new Error("Recipient has no active key");
      if (input.recipientPubKey !== recipientActiveKey.encapPublicKey.toHex()) {
        throw new Error(
          "recipientPubKey does not match recipient's active encap key",
        );
      }

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
        encryptedContentBuf,
        senderEncryptedContentBuf,
        senderEd25519PubKeyBuf,
        senderX25519PubKeyBuf,
        senderPubKeyBuf,
        recipientX25519PubKeyBuf,
        recipientPubKeyBuf,
        senderSignatureBuf,
        true,
      );
      await insertMessage(
        recipientChannelId,
        senderAddress,
        encryptedContentBuf,
        senderEncryptedContentBuf,
        senderEd25519PubKeyBuf,
        senderX25519PubKeyBuf,
        senderPubKeyBuf,
        recipientX25519PubKeyBuf,
        recipientPubKeyBuf,
        senderSignatureBuf,
        false,
      );
    } else {
      // --- Remote delivery ---
      // Validate recipientPubKey against federation lookup
      const remoteKeys = await fetchRemotePublicKey(input.recipientAddress);
      if (!remoteKeys) throw new Error("Recipient not found via federation");
      if (remoteKeys.encapPublicKey !== input.recipientPubKey) {
        throw new Error(
          "recipientPubKey does not match recipient's federated encap key",
        );
      }
      // PoW is verified by recipient's server in notifyMessage.
      const senderChannelId = await getOrCreateChannel(
        senderUser.id,
        input.recipientAddress,
      );
      await insertMessage(
        senderChannelId,
        senderAddress,
        encryptedContentBuf,
        senderEncryptedContentBuf,
        senderEd25519PubKeyBuf,
        senderX25519PubKeyBuf,
        senderPubKeyBuf,
        recipientX25519PubKeyBuf,
        recipientPubKeyBuf,
        senderSignatureBuf,
        true,
      );

      await deliverRemoteMessage(
        senderAddress,
        input.recipientAddress,
        encryptedContentBuf,
        senderEncryptedContentBuf,
        senderEd25519PubKeyBuf,
        senderX25519PubKeyBuf,
        senderPubKeyBuf,
        recipientX25519PubKeyBuf,
        recipientPubKeyBuf,
        senderSignatureBuf,
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

function messagesToHex<
  T extends {
    encryptedContent: WebBuf;
    senderEncryptedContent: WebBuf;
    senderEd25519PubKey: WebBuf;
    senderX25519PubKey: WebBuf;
    senderPubKey: WebBuf;
    recipientX25519PubKey: WebBuf;
    recipientPubKey: WebBuf;
    senderSignature: WebBuf;
  },
>(rows: T[]) {
  return rows.map((m) => ({
    ...m,
    encryptedContent: m.encryptedContent.toHex(),
    senderEncryptedContent: m.senderEncryptedContent.toHex(),
    senderEd25519PubKey: m.senderEd25519PubKey.toHex(),
    senderX25519PubKey: m.senderX25519PubKey.toHex(),
    senderPubKey: m.senderPubKey.toHex(),
    recipientX25519PubKey: m.recipientX25519PubKey.toHex(),
    recipientPubKey: m.recipientPubKey.toHex(),
    senderSignature: m.senderSignature.toHex(),
  }));
}

export const getMessagesForChannel = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: counterpartyAddress, context: { userId } }) => {
    const channel = await resolveChannel(userId, counterpartyAddress);
    const rows = await getChannelMessages(channel.id, userId);
    return messagesToHex(rows);
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
    const rows = await getChannelMessages(
      channel.id,
      userId,
      undefined,
      data.beforeId,
    );
    return messagesToHex(rows);
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
    const rows = await getNewMessages(channel.id, userId, data.afterId);
    return messagesToHex(rows);
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
      ed25519PublicKey: key.ed25519PublicKey.toHex(),
      encryptedEd25519Key: key.encryptedEd25519Key.toHex(),
      x25519PublicKey: key.x25519PublicKey.toHex(),
      encryptedX25519Key: key.encryptedX25519Key.toHex(),
      signingPublicKey: key.signingPublicKey.toHex(),
      encapPublicKey: key.encapPublicKey.toHex(),
      encryptedSigningKey: key.encryptedSigningKey.toHex(),
      encryptedDecapKey: key.encryptedDecapKey.toHex(),
    };
  });

export const getRemotePowChallenge = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      recipientAddress: z.string(),
      senderAddress: z.string(),
      senderEd25519PubKey: z.string(),
      senderPubKey: z.string(),
      signature: z.string(),
      timestamp: z.number(),
    }),
  )
  .handler(async ({ data: input }) => {
    return fetchRemotePowChallenge(input);
  });
