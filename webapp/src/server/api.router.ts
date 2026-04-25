import { implement } from "@orpc/server";
import { contract, createKeypearsClientFromUrl } from "@keypears/client";
import { verifyMessageSignature } from "~/lib/message";
import { fetchRemotePublicKey } from "./federation.server";
import { mlDsa65Verify } from "@webbuf/mldsa";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { db } from "~/db";
import { pendingDeliveries } from "~/db/schema";
import { eq, lt } from "drizzle-orm";
import {
  getActiveKey,
  getUserByNameAndDomain,
  getDomainByName,
  getUserPowSettings,
} from "./user.server";
import { getDomain, parseAddress } from "~/lib/config";
import { hashToken } from "./utils";
import { getOrCreateChannel, insertMessage } from "./message.server";
import {
  createPowChallenge,
  MESSAGE_DIFFICULTY,
  CHANNEL_DIFFICULTY,
} from "./pow.server";
import { channelExists, messageExists } from "./message.server";
import { verifyAndConsumePow } from "./pow.consume";
import { resolveApiUrl } from "./federation.server";

// --- oRPC Router (implements @keypears/client contract) ---

const os = implement(contract);

const serverInfo = os.serverInfo.handler(async () => {
  return {
    domain: getDomain(),
  };
});

const getPublicKey = os.getPublicKey.handler(async ({ input }) => {
  const parsed = parseAddress(input.address);
  if (!parsed) return { signingPublicKey: null, encapPublicKey: null };
  const domain = await getDomainByName(parsed.domain);
  if (!domain) return { signingPublicKey: null, encapPublicKey: null };
  const user = await getUserByNameAndDomain(parsed.name, domain.id);
  if (!user || !user.passwordHash) return { signingPublicKey: null, encapPublicKey: null };
  const key = await getActiveKey(user.id);
  if (!key) return { signingPublicKey: null, encapPublicKey: null };
  return { signingPublicKey: key.signingPublicKey.toHex(), encapPublicKey: key.encapPublicKey.toHex() };
});

const getPowChallengeEndpoint = os.getPowChallenge.handler(
  async ({ input }) => {
    // Verify timestamp is recent (5 minutes)
    if (Math.abs(Date.now() - input.timestamp) > 5 * 60 * 1000) {
      throw new Error("Request expired");
    }

    // Look up sender's public key from their domain via federation
    const senderParsed = parseAddress(input.senderAddress);
    if (!senderParsed) throw new Error("Invalid sender address");
    const senderApiUrl = await resolveApiUrl(senderParsed.domain);
    const remoteClient = createKeypearsClientFromUrl(senderApiUrl);
    const senderKeyResult = await remoteClient.getPublicKey({
      address: input.senderAddress,
    });
    if (!senderKeyResult.signingPublicKey) throw new Error("Sender not found");

    // Verify the provided public key matches the federation lookup
    if (senderKeyResult.signingPublicKey !== input.senderPubKey) {
      throw new Error("Public key mismatch");
    }

    // Verify the ML-DSA-65 signature
    const verifyingKey = FixedBuf.fromHex(1952, input.senderPubKey);
    const message = WebBuf.fromUtf8(`${input.senderAddress}:${input.recipientAddress}:${input.timestamp}`);
    const sig = FixedBuf.fromHex(3309, input.signature);
    const ok = mlDsa65Verify(verifyingKey, message, sig);
    if (!ok) {
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
  },
);

const notifyMessageHandler = os.notifyMessage.handler(async ({ input }) => {
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
    const remoteClient = createKeypearsClientFromUrl(senderApiUrl);
    const messageData = await remoteClient.pullMessage({
      token: input.pullToken,
    });
    // Verify message sizes
    if (messageData.encryptedContent.length > 100_000) {
      throw new Error("Message too large");
    }
    if (messageData.senderEncryptedContent.length > 100_000) {
      throw new Error("Sender encrypted content too large");
    }
    if (messageData.senderSignature.length > 6700) {
      throw new Error("Sender signature too large");
    }
    // Verify the message matches the notification
    if (messageData.senderAddress !== input.senderAddress)
      throw new Error("Sender address mismatch");
    if (messageData.recipientAddress !== input.recipientAddress)
      throw new Error("Recipient address mismatch");

    // Convert hex strings from oRPC to WebBuf for crypto and DB operations
    const encryptedContentBuf = WebBuf.fromHex(messageData.encryptedContent);
    const senderEncryptedContentBuf = WebBuf.fromHex(
      messageData.senderEncryptedContent,
    );
    const senderPubKeyBuf = WebBuf.fromHex(messageData.senderPubKey);
    const recipientPubKeyBuf = WebBuf.fromHex(messageData.recipientPubKey);
    const senderSignatureBuf = WebBuf.fromHex(messageData.senderSignature);

    // Verify sender signature over the message envelope
    const sigValid = verifyMessageSignature(
      messageData.senderAddress,
      messageData.recipientAddress,
      senderPubKeyBuf,
      recipientPubKeyBuf,
      encryptedContentBuf,
      senderEncryptedContentBuf,
      senderSignatureBuf,
    );
    if (!sigValid) {
      throw new Error("Invalid sender signature");
    }

    // Verify senderPubKey matches the sender's federated signing key
    const senderKeys = await fetchRemotePublicKey(messageData.senderAddress);
    if (!senderKeys) throw new Error("Sender not found via federation");
    if (senderKeys.signingPublicKey !== messageData.senderPubKey) {
      throw new Error("senderPubKey does not match federated signing key");
    }

    // Verify recipientPubKey matches the local recipient's active encap key
    const recipientActiveKey = await getActiveKey(recipientUser.id);
    if (!recipientActiveKey) throw new Error("Recipient has no active key");
    if (recipientActiveKey.encapPublicKey.toHex() !== messageData.recipientPubKey) {
      throw new Error("recipientPubKey does not match recipient's encap key");
    }

    // Store in recipient's channel (idempotent: skip if duplicate)
    const channelId = await getOrCreateChannel(
      recipientUser.id,
      messageData.senderAddress,
    );

    const duplicate = await messageExists(
      channelId,
      senderPubKeyBuf,
      recipientPubKeyBuf,
      encryptedContentBuf,
    );

    if (!duplicate) {
      await insertMessage(
        channelId,
        messageData.senderAddress,
        encryptedContentBuf,
        senderEncryptedContentBuf,
        senderPubKeyBuf,
        recipientPubKeyBuf,
        senderSignatureBuf,
        false,
      );
    }

    return { success: true as const };
  } catch (err) {
    console.error("notifyMessage handler failed:", err);
    throw err;
  }
});

const pullMessageHandler = os.pullMessage.handler(async ({ input }) => {
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
    encryptedContent: delivery.encryptedContent.toHex(),
    senderEncryptedContent: delivery.senderEncryptedContent.toHex(),
    senderPubKey: delivery.senderPubKey.toHex(),
    recipientPubKey: delivery.recipientPubKey.toHex(),
    senderSignature: delivery.senderSignature.toHex(),
  };
});

export const apiRouter = os.router({
  serverInfo,
  getPublicKey,
  getPowChallenge: getPowChallengeEndpoint,
  notifyMessage: notifyMessageHandler,
  pullMessage: pullMessageHandler,
});
