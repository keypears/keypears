import { oc } from "@orpc/contract";
import { z } from "zod";

const serverInfo = oc.output(
  z.object({
    domain: z.string(),
  }),
);

const getPublicKey = oc
  .input(z.object({ address: z.string() }))
  .output(z.object({
    ed25519PublicKey: z.string().nullable(),
    x25519PublicKey: z.string().nullable(),
    signingPublicKey: z.string().nullable(),
    encapPublicKey: z.string().nullable(),
  }));

const getPowChallenge = oc
  .input(
    z.object({
      senderAddress: z.string(),
      recipientAddress: z.string(),
      senderEd25519PubKey: z.string(),
      senderPubKey: z.string(),
      signature: z.string(),
      timestamp: z.number(),
    }),
  )
  .output(
    z.object({
      header: z.string(),
      target: z.string(),
      expiresAt: z.number(),
      difficulty: z.number(),
      signature: z.string(),
      senderAddress: z.string().optional(),
      recipientAddress: z.string().optional(),
    }),
  );

const notifyMessage = oc
  .input(
    z.object({
      senderAddress: z.string(),
      recipientAddress: z.string(),
      pullToken: z.string(),
      senderEd25519PubKey: z.string(),
      senderEncryptedContent: z.string(),
      senderSignature: z.string(),
      pow: z.object({
        solvedHeader: z.string(),
        target: z.string(),
        expiresAt: z.number(),
        signature: z.string(),
      }),
    }),
  )
  .output(z.object({ success: z.literal(true) }));

const pullMessage = oc
  .input(z.object({ token: z.string() }))
  .output(
    z.object({
      senderAddress: z.string(),
      recipientAddress: z.string(),
      encryptedContent: z.string(),
      senderEncryptedContent: z.string(),
      senderEd25519PubKey: z.string(),
      senderX25519PubKey: z.string(),
      senderPubKey: z.string(),
      recipientX25519PubKey: z.string(),
      recipientPubKey: z.string(),
      senderSignature: z.string(),
    }),
  );

export const contract = {
  serverInfo,
  getPublicKey,
  getPowChallenge,
  notifyMessage,
  pullMessage,
};
