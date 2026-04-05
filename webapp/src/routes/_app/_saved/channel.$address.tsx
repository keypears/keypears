import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  getMessagesForChannel,
  getMyChannels,
  getOlderMessages,
  sendMessage,
  getMyActiveEncryptedKey,
  getRemotePowChallenge,
  pollNewMessages,
  markChannelAsRead,
} from "~/server/message.functions";
import { getCachedEncryptionKey, decryptPrivateKey } from "~/lib/auth";
import { encryptMessage, decryptMessage } from "~/lib/message";
import { PowModal } from "~/components/PowModal";
import type { PowChallenge, PowSolution } from "~/lib/use-pow-miner";
import { FixedBuf } from "@webbuf/fixedbuf";
import {
  Send as SendIcon,
  LockKeyhole,
  Loader2,
  Inbox,
  MessageSquare,
  Menu,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_app/_saved/channel/$address")({
  loader: async ({ params }) => {
    const address = params.address;
    const [msgs, channels] = await Promise.all([
      getMessagesForChannel({ data: address }),
      getMyChannels(),
    ]);
    return { address, messages: msgs, channels };
  },
  component: ChannelPage,
});

function ChannelPage() {
  const {
    address,
    messages: initialMessages,
    channels: initialChannels,
  } = Route.useLoaderData();
  const [messageList, setMessageList] = useState(initialMessages);
  const [channels, setChannels] = useState(initialChannels);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(initialMessages.length >= 20);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const encryptionKey = getCachedEncryptionKey();
  const [powChallenge, setPowChallenge] = useState<PowChallenge | null>(null);

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

  // Poll channel list for sidebar updates
  useEffect(() => {
    let active = true;
    async function poll() {
      while (active) {
        try {
          const updated = await getMyChannels();
          if (!active) break;
          setChannels(updated);
        } catch {
          // ignore
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    poll();
    return () => {
      active = false;
    };
  }, []);

  // Reverse infinite scroll
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
      return {
        ok: true,
        text: decryptMessage(msg.encryptedContent, myPrivKey, theirPubKey),
      };
    } catch {
      const isSender = msg.senderPubKey === myKeyData.publicKey;
      if (!isSender && msg.recipientPubKey !== myKeyData.publicKey) {
        return { ok: false, reason: "wrong-key" };
      }
      return { ok: false, reason: "error" };
    }
  }

  const pendingSendRef = useRef<{
    recipientAddress: string;
    encryptedContent: string;
    senderPubKey: string;
    recipientPubKey: string;
  } | null>(null);

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

      pendingSendRef.current = {
        recipientAddress: address,
        encryptedContent,
        senderPubKey: myKeyData.publicKey,
        recipientPubKey: recipientPubKeyHex,
      };

      const challenge = await getRemotePowChallenge({ data: address });
      setPowChallenge(challenge);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send.");
      setSending(false);
    }
  }

  async function handlePowComplete(solution: PowSolution) {
    setPowChallenge(null);
    const pending = pendingSendRef.current;
    if (!pending) return;

    try {
      await sendMessage({
        data: { ...pending, pow: solution },
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
      pendingSendRef.current = null;
    }
  }

  function handlePowCancel() {
    setPowChallenge(null);
    setSending(false);
    pendingSendRef.current = null;
  }

  // --- Channel list panel (shared between drawer and desktop sidebar) ---
  function ChannelList({ onSelect }: { onSelect?: () => void }) {
    return (
      <div className="flex flex-col">
        <a
          href="/inbox"
          onClick={onSelect}
          className="text-muted-foreground hover:text-foreground flex items-center gap-2 px-4 py-3 text-sm no-underline transition-colors"
        >
          <Inbox className="h-4 w-4" />
          Inbox
        </a>
        <div className="border-border/30 border-t" />
        <div className="flex-1 overflow-y-auto">
          {channels.map((ch) => (
            <a
              key={ch.id}
              href={`/channel/${ch.counterpartyAddress}`}
              onClick={onSelect}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm no-underline transition-colors ${
                ch.counterpartyAddress === address
                  ? "bg-accent/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/5"
              }`}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="truncate">{ch.counterpartyAddress}</span>
              {ch.unreadCount > 0 && (
                <span className="bg-accent text-accent-foreground ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium">
                  {ch.unreadCount}
                </span>
              )}
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex font-sans">
      {/* Desktop channel list panel */}
      <div className="bg-background border-border/30 hidden w-64 flex-col border-r lg:flex">
        <div className="border-border/30 flex items-center gap-2 border-b px-4 py-3">
          <span className="text-foreground text-sm font-bold">Channels</span>
        </div>
        <ChannelList />
      </div>

      {/* Mobile drawer backdrop */}
      <button
        type="button"
        aria-label="Close channels"
        className={`fixed inset-0 z-30 bg-black/20 transition-opacity duration-300 ease-in-out lg:hidden dark:bg-black/40 ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Mobile drawer */}
      <div
        className={`bg-background border-border/30 fixed top-0 left-0 z-40 flex h-full w-64 transform flex-col border-r shadow-lg transition-transform duration-300 ease-in-out lg:hidden ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-border/30 flex items-center gap-2 border-b px-4 py-3">
          <button
            onClick={() => setDrawerOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="text-foreground text-sm font-bold">Channels</span>
        </div>
        <ChannelList onSelect={() => setDrawerOpen(false)} />
      </div>

      {/* Main conversation area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="bg-background border-border/30 flex items-center gap-3 border-b px-4 py-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-muted-foreground hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
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
              <div className="text-muted-foreground mb-2 text-center text-xs">
                <p>Beginning of conversation</p>
                <p className="mt-1">
                  Messages are end-to-end encrypted. Only you and the other
                  party can read them.
                </p>
              </div>
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
                          This message may have been sent before a key rotation
                          or password reset.
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

      <PowModal
        challenge={powChallenge}
        onComplete={handlePowComplete}
        onCancel={handlePowCancel}
      />
    </div>
  );
}
