import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  getMessagesForChannel,
  getOlderMessages,
  sendMessage,
  getMyActiveEncryptedKey,
  pollNewMessages,
  markChannelAsRead,
} from "~/server/message.functions";
import { getCachedEncryptionKey, decryptPrivateKey } from "~/lib/auth";
import { encryptMessage, decryptMessage } from "~/lib/message";
import { FixedBuf } from "@webbuf/fixedbuf";
import { Send as SendIcon, ArrowLeft, LockKeyhole, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/_saved/channel/$address")({
  loader: async ({ params }) => {
    const address = params.address;
    const msgs = await getMessagesForChannel({ data: address });
    return { address, messages: msgs };
  },
  component: ChannelPage,
});

function ChannelPage() {
  const { address, messages: initialMessages } = Route.useLoaderData();
  const [messageList, setMessageList] = useState(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(initialMessages.length >= 20);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const encryptionKey = getCachedEncryptionKey();

  const [myKeyData, setMyKeyData] = useState<{
    publicKey: string;
    encryptedPrivateKey: string;
  } | null>(null);
  useEffect(() => {
    getMyActiveEncryptedKey().then(setMyKeyData);
  }, []);

  // Mark as read on mount
  useEffect(() => {
    markChannelAsRead({ data: address });
  }, [address]);

  // Scroll to bottom on initial load and when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView();
  }, [messageList.length]);

  // Poll for new messages — 200ms after each response
  const lastIdRef = useRef(
    messageList.length > 0 ? messageList[messageList.length - 1].id : "",
  );
  useEffect(() => {
    if (messageList.length > 0) {
      lastIdRef.current = messageList[messageList.length - 1].id;
    }
  }, [messageList]);

  useEffect(() => {
    let active = true;
    async function poll() {
      while (active) {
        try {
          const newMsgs = await pollNewMessages({
            data: { counterpartyAddress: address, afterId: lastIdRef.current },
          });
          if (!active) break;
          if (newMsgs.length > 0) {
            setMessageList((prev) => [...prev, ...newMsgs]);
            markChannelAsRead({ data: address });
          }
        } catch {
          // ignore errors, retry after delay
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    poll();
    return () => {
      active = false;
    };
  }, [address]);

  // Reverse infinite scroll — load older messages when scrolling to top
  async function loadOlder() {
    if (loadingOlder || !hasMore || messageList.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldestId = messageList[0].id;
      const older = await getOlderMessages({
        data: { counterpartyAddress: address, beforeId: oldestId },
      });
      if (older.length < 20) setHasMore(false);
      if (older.length > 0) {
        const container = messagesContainerRef.current;
        const prevHeight = container?.scrollHeight ?? 0;
        setMessageList((prev) => [...older, ...prev]);
        // Restore scroll position after prepend
        requestAnimationFrame(() => {
          if (container) {
            const newHeight = container.scrollHeight;
            container.scrollTop = newHeight - prevHeight;
          }
        });
      }
    } catch {
      // ignore
    } finally {
      setLoadingOlder(false);
    }
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (e.currentTarget.scrollTop === 0) {
      loadOlder();
    }
  }

  type DecryptResult =
    | { ok: true; text: string }
    | { ok: false; reason: "loading" | "wrong-key" | "error" };

  function tryDecrypt(msg: {
    encryptedContent: string;
    senderPubKey: string;
    recipientPubKey: string;
  }): DecryptResult {
    if (!encryptionKey || !myKeyData) return { ok: false, reason: "loading" };
    try {
      const myPrivKey = decryptPrivateKey(
        myKeyData.encryptedPrivateKey,
        encryptionKey,
      );
      const isSender = msg.senderPubKey === myKeyData.publicKey;
      const theirPubKeyHex = isSender ? msg.recipientPubKey : msg.senderPubKey;
      const theirPubKey = FixedBuf.fromHex(33, theirPubKeyHex);
      return { ok: true, text: decryptMessage(msg.encryptedContent, myPrivKey, theirPubKey) };
    } catch {
      // Key mismatch — likely encrypted with a rotated or old key
      const isSender = msg.senderPubKey === myKeyData.publicKey;
      if (!isSender && msg.recipientPubKey !== myKeyData.publicKey) {
        return { ok: false, reason: "wrong-key" };
      }
      return { ok: false, reason: "error" };
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !myKeyData || !encryptionKey) return;
    setError("");
    setSending(true);

    try {
      const otherMsg = messageList.find(
        (m) => m.senderPubKey !== myKeyData.publicKey,
      );
      const recipientPubKeyHex =
        otherMsg?.senderPubKey ?? messageList[0]?.recipientPubKey;
      if (!recipientPubKeyHex) throw new Error("Cannot determine recipient");

      const myPrivKey = decryptPrivateKey(
        myKeyData.encryptedPrivateKey,
        encryptionKey,
      );
      const theirPubKey = FixedBuf.fromHex(33, recipientPubKeyHex);
      const encryptedContent = encryptMessage(text, myPrivKey, theirPubKey);

      await sendMessage({
        data: {
          recipientAddress: address,
          encryptedContent,
          senderPubKey: myKeyData.publicKey,
          recipientPubKey: recipientPubKeyHex,
        },
      });

      const newMsgs = await pollNewMessages({
        data: { counterpartyAddress: address, afterId: lastIdRef.current },
      });
      if (newMsgs.length > 0) {
        setMessageList((prev) => [...prev, ...newMsgs]);
      }
      setText("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col font-sans">
      {/* Fixed header */}
      <div className="bg-background border-border/30 flex items-center gap-3 border-b px-4 py-3">
        <a
          href="/inbox"
          className="text-muted-foreground hover:text-foreground no-underline"
        >
          <ArrowLeft className="h-5 w-5" />
        </a>
        <span className="text-foreground text-sm font-medium">{address}</span>
      </div>

      {/* Scrollable messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {loadingOlder && (
            <div className="flex justify-center py-2">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
          )}
          {!hasMore && messageList.length > 0 && (
            <p className="text-muted-foreground text-center text-xs">
              Beginning of conversation
            </p>
          )}
          {messageList.map((msg) => {
            const isMine = msg.senderPubKey === myKeyData?.publicKey;
            const result = tryDecrypt(msg);
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                {result.ok ? (
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-2 text-sm ${
                      isMine
                        ? "bg-accent/15 text-foreground"
                        : "bg-background-highlight text-foreground"
                    }`}
                  >
                    <p className="break-words">{result.text}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                ) : (
                  <div className="border-border/30 max-w-[70%] rounded-lg border border-dashed px-4 py-2 text-sm">
                    <div className="text-muted-foreground flex items-center gap-2 italic">
                      <LockKeyhole className="h-3 w-3 shrink-0" />
                      {result.reason === "loading"
                        ? "Decrypting..."
                        : result.reason === "wrong-key"
                          ? "Encrypted with a different key"
                          : "Unable to decrypt this message"}
                    </div>
                    {result.reason === "wrong-key" && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        This message may have been sent before a key rotation or
                        password reset.
                      </p>
                    )}
                    <p className="text-muted-foreground mt-1 text-xs">
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Fixed input */}
      <form
        onSubmit={handleSend}
        className="bg-background border-border/30 flex gap-3 border-t px-4 py-3"
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
