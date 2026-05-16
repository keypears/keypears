import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

export interface ServerInfoOutput {
  domain: string;
}

export interface GetPublicKeyInput {
  address: string;
}

export interface GetPublicKeyOutput {
  ed25519PublicKey: string | null;
  x25519PublicKey: string | null;
  signingPublicKey: string | null;
  encapPublicKey: string | null;
  keyNumber: number | null;
}

export interface GetPowChallengeInput {
  senderAddress: string;
  recipientAddress: string;
  senderEd25519PubKey: string;
  senderMldsaPubKey: string;
  signature: string;
  timestamp: number;
}

export interface PowChallengeOutput {
  header: string;
  target: string;
  expiresAt: number;
  difficulty: number;
  signature: string;
  senderAddress?: string;
  recipientAddress?: string;
}

export interface NotifyMessageInput {
  senderAddress: string;
  recipientAddress: string;
  pullToken: string;
  pow: {
    solvedHeader: string;
    target: string;
    expiresAt: number;
    signature: string;
  };
}

export interface PullMessageInput {
  token: string;
}

export interface PullMessageOutput {
  senderAddress: string;
  recipientAddress: string;
  encryptedContent: string;
  senderEncryptedContent: string;
  senderEd25519PubKey: string;
  senderX25519PubKey: string;
  senderMldsaPubKey: string;
  recipientX25519PubKey: string;
  recipientMlkemPubKey: string;
  senderSignature: string;
  recipientKeyNumber: number;
}

export interface KeypearsClient {
  serverInfo(): Promise<ServerInfoOutput>;
  getPublicKey(input: GetPublicKeyInput): Promise<GetPublicKeyOutput>;
  getPowChallenge(input: GetPowChallengeInput): Promise<PowChallengeOutput>;
  notifyMessage(input: NotifyMessageInput): Promise<{ success: true }>;
  pullMessage(input: PullMessageInput): Promise<PullMessageOutput>;
}

export function createKeypearsClient(apiDomain: string): KeypearsClient {
  const link = new RPCLink({ url: `https://${apiDomain}/api` });
  return createORPCClient(link) as unknown as KeypearsClient;
}

export function createKeypearsClientFromUrl(apiUrl: string): KeypearsClient {
  const link = new RPCLink({ url: apiUrl });
  return createORPCClient(link) as unknown as KeypearsClient;
}
