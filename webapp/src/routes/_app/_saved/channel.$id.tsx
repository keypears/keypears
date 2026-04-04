import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getMessagesForChannel,
  sendMessage,
  getMyActiveEncryptedKey,
} from "~/server/message.functions";
import { getCachedEncryptionKey, decryptPrivateKey } from "~/lib/auth";
import { encryptMessage, decryptMessage } from "~/lib/message";
import { FixedBuf } from "@webbuf/fixedbuf";
import { Send as SendIcon, ArrowLeft } from "lucide-react";


export const Route = createFileRoute("/_app/_saved/channel/$id")({
  loader: async ({ params }) => {
    const channelId = Number(params.id);
    const msgs = await getMessagesForChannel({ data: channelId });
    return { channelId, messages: msgs };
  },
  component: ChannelPage,
});

function ChannelPage() {
  const { channelId, messages: initialMessages } = Route.useLoaderData();
  const [messageList, setMessageList] = useState(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const encryptionKey = getCachedEncryptionKey();

  // Determine counterparty from first message
  const myKeyData = useMyKey();
  const myAddress =
    myKeyData?.publicKey
      ? messageList.find((m) => m.senderPubKey === myKeyData.publicKey)
          ?.senderAddress ?? null
      : null;

  function useMyKey() {
    const [data, setData] = useState<{
      publicKey: string;
      encryptedPrivateKey: string;
    } | null>(null);
    if (!data) {
      getMyActiveEncryptedKey().then(setData);
    }
    return data;
  }

  function tryDecrypt(msg: {
    encryptedContent: string;
    senderPubKey: string;
    recipientPubKey: string;
  }): string {
    if (!encryptionKey || !myKeyData) return "[encrypted]";
    try {
      const myPrivKey = decryptPrivateKey(
        myKeyData.encryptedPrivateKey,
        encryptionKey,
      );
      // If I'm the sender, I need the recipient's pub key for ECDH
      // If I'm the recipient, I need the sender's pub key
      const isSender = msg.senderPubKey === myKeyData.publicKey;
      const theirPubKeyHex = isSender
        ? msg.recipientPubKey
        : msg.senderPubKey;
      const theirPubKey = FixedBuf.fromHex(33, theirPubKeyHex);
      return decryptMessage(msg.encryptedContent, myPrivKey, theirPubKey);
    } catch {
      return "[unable to decrypt]";
    }
  }

  // Find counterparty address
  const counterpartyAddress =
    messageList.length > 0
      ? messageList[0].senderAddress === myAddress
        ? `recipient` // We don't have it directly, derive from channel
        : messageList[0].senderAddress
      : "Unknown";

  // Better: look at messages to find the other party
  const otherAddress = messageList.find(
    (m) => m.senderAddress !== myAddress,
  )?.senderAddress;
  const displayAddress = otherAddress ?? counterpartyAddress;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !myKeyData || !encryptionKey) return;
    setError("");
    setSending(true);

    try {
      // Find recipient address and pub key from existing messages
      const otherMsg = messageList.find(
        (m) => m.senderPubKey !== myKeyData.publicKey,
      );
      const recipientPubKeyHex =
        otherMsg?.senderPubKey ??
        messageList[0]?.recipientPubKey;
      if (!recipientPubKeyHex) throw new Error("Cannot determine recipient");

      // Determine recipient address
      let recipientAddr = otherMsg?.senderAddress;
      if (!recipientAddr) {
        // We sent the first message — recipient pub key is in recipientPubKey field
        // We need to look up who this key belongs to... use channel counterparty
        // For now, derive from the channel data
        throw new Error("Cannot determine recipient address");
      }

      const myPrivKey = decryptPrivateKey(
        myKeyData.encryptedPrivateKey,
        encryptionKey,
      );
      const theirPubKey = FixedBuf.fromHex(33, recipientPubKeyHex);
      const encryptedContent = encryptMessage(text, myPrivKey, theirPubKey);

      await sendMessage({
        data: {
          recipientAddress: recipientAddr,
          encryptedContent,
          senderPubKey: myKeyData.publicKey,
          recipientPubKey: recipientPubKeyHex,
        },
      });

      setMessageList([
        ...messageList,
        {
          id: Date.now(),
          channelId,
          senderAddress: myAddress ?? "",
          encryptedContent,
          senderPubKey: myKeyData.publicKey,
          recipientPubKey: recipientPubKeyHex,
          createdAt: new Date(),
        },
      ]);
      setText("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col font-sans">
      {/* Header */}
      <div className="border-border/30 flex items-center gap-3 border-b px-4 py-3">
        <a
          href="/inbox"
          className="text-muted-foreground hover:text-foreground no-underline"
        >
          <ArrowLeft className="h-5 w-5" />
        </a>
        <span className="text-foreground text-sm font-medium">
          {displayAddress}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messageList.map((msg) => {
            const isMine = msg.senderPubKey === myKeyData?.publicKey;
            const decrypted = tryDecrypt(msg);
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 text-sm ${
                    isMine
                      ? "bg-accent/15 text-foreground"
                      : "bg-background-highlight text-foreground"
                  }`}
                >
                  <p className="break-words">{decrypted}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="border-border/30 flex gap-3 border-t px-4 py-3"
      >
        <input
          type="text"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="bg-background-dark border-border text-foreground flex-1 rounded border px-4 py-2 text-sm"
          required
        />
        {error && <p className="text-danger text-sm">{error}</p>}
        <button
          type="submit"
          disabled={sending}
          className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-4 py-2 transition-all disabled:opacity-50"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
