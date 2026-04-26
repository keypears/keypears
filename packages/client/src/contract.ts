import { oc } from "@orpc/contract";
import { z } from "zod";

// --- Reusable hex schemas ---

const HEX_RE = /^[0-9a-f]*$/i;

/** Hex-encoded byte string of exactly N bytes (2*N hex chars). */
const hexBytes = (n: number) => z.string().regex(HEX_RE).length(n * 2);

/** Hex-encoded byte string of at most N bytes. */
const hexMaxBytes = (n: number) => z.string().regex(HEX_RE).max(n * 2);

/** KeyPears address: name@domain */
const addressSchema = z.string().regex(/^[a-z][a-z0-9]*@[a-z0-9.-]+$/);

// --- Contract ---

const serverInfo = oc.output(
  z.object({
    domain: z.string(),
  }),
);

const getPublicKey = oc
  .input(z.object({ address: addressSchema }))
  .output(z.object({
    ed25519PublicKey: hexBytes(32).nullable(),
    x25519PublicKey: hexBytes(32).nullable(),
    signingPublicKey: hexBytes(1952).nullable(),
    encapPublicKey: hexBytes(1184).nullable(),
    keyNumber: z.number().nullable(),
  }));

const getPowChallenge = oc
  .input(
    z.object({
      senderAddress: addressSchema,
      recipientAddress: addressSchema,
      senderEd25519PubKey: hexBytes(32),
      senderMldsaPubKey: hexBytes(1952),
      signature: hexBytes(3374),
      timestamp: z.number(),
    }),
  )
  .output(
    z.object({
      header: hexBytes(32),
      target: hexBytes(32),
      expiresAt: z.number(),
      difficulty: z.number(),
      signature: z.string(),
      senderAddress: addressSchema.optional(),
      recipientAddress: addressSchema.optional(),
    }),
  );

const notifyMessage = oc
  .input(
    z.object({
      senderAddress: addressSchema,
      recipientAddress: addressSchema,
      pullToken: z.string().min(1),
      pow: z.object({
        solvedHeader: hexBytes(32),
        target: hexBytes(32),
        expiresAt: z.number(),
        signature: z.string(),
      }),
    }),
  )
  .output(z.object({ success: z.literal(true) }));

const pullMessage = oc
  .input(z.object({ token: z.string().min(1) }))
  .output(
    z.object({
      senderAddress: addressSchema,
      recipientAddress: addressSchema,
      encryptedContent: hexMaxBytes(50_000),
      senderEncryptedContent: hexMaxBytes(50_000),
      senderEd25519PubKey: hexBytes(32),
      senderX25519PubKey: hexBytes(32),
      senderMldsaPubKey: hexBytes(1952),
      recipientX25519PubKey: hexBytes(32),
      recipientMlkemPubKey: hexBytes(1184),
      senderSignature: hexMaxBytes(3375),
      recipientKeyNumber: z.number(),
    }),
  );

export const contract = {
  serverInfo,
  getPublicKey,
  getPowChallenge,
  notifyMessage,
  pullMessage,
};
