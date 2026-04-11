import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { getMyKeys, getMyUser } from "~/server/user.functions";
import {
  getCachedEncryptionKey,
  decryptPrivateKey,
  signPowRequest,
} from "~/lib/auth";
import { encryptMessage, decryptMessageContent } from "~/lib/message";
import type { MessageContent } from "~/lib/message";
import { encryptVaultEntry } from "~/lib/vault";
import type { VaultEntryData } from "~/lib/vault";
import { createEntry } from "~/server/vault.functions";
import { PowModal } from "~/components/PowModal";
import type { PowChallenge, PowSolution } from "~/lib/use-pow-miner";
import { FixedBuf } from "@webbuf/fixedbuf";
import {
  Send as SendIcon,
  LockKeyhole,
  KeyRound,
  FileText,
  Lock as LockIcon,
  Loader2,
  Home,
  MessageSquare,
  Menu,
  X,
} from "lucide-react";

import { addressParam } from "~/lib/route-params";

export const Route = createFileRoute("/_app/_saved/channel/$address")({
  params: addressParam,
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.address} — KeyPears` : "KeyPears" }],
  }),
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
  const navigate = useNavigate();
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

  // Sync loader data into state on navigation
  useEffect(() => {
    setMessageList(initialMessages);
    setHasMore(initialMessages.length >= 20);
  }, [initialMessages]);
  useEffect(() => {
    setChannels(initialChannels);
  }, [initialChannels]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const encryptionKey = getCachedEncryptionKey();
  const [powChallenge, setPowChallenge] = useState<PowChallenge | null>(null);

  const [myKeyData, setMyKeyData] = useState<{
    publicKey: string;
    encryptedPrivateKey: string;
  } | null>(null);
  const [keyMap, setKeyMap] = useState<
    Map<string, { encryptedPrivateKey: string; loginKeyHash: string | null }>
  >(new Map());
  const [currentPasswordHash, setCurrentPasswordHash] = useState<string | null>(null);
  useEffect(() => {
    getMyActiveEncryptedKey().then(setMyKeyData);
    getMyKeys().then((data) => {
      const map = new Map<string, { encryptedPrivateKey: string; loginKeyHash: string | null }>();
      for (const k of data.keys) {
        map.set(k.publicKey, {
          encryptedPrivateKey: k.encryptedPrivateKey,
          loginKeyHash: k.loginKeyHash,
        });
      }
      setKeyMap(map);
      setCurrentPasswordHash(data.passwordHash);
      return data;
    });
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
        if (!document.hidden) {
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
    | { ok: true; content: MessageContent }
    | { ok: false; reason: "loading" | "wrong-key" | "error" };

  function tryDecrypt(msg: {
    encryptedContent: string;
    senderPubKey: string;
    recipientPubKey: string;
  }): DecryptResult {
    if (!encryptionKey || keyMap.size === 0)
      return { ok: false, reason: "loading" };

    const isSender = keyMap.has(msg.senderPubKey);
    const myPubKeyHex = isSender ? msg.senderPubKey : msg.recipientPubKey;
    const theirPubKeyHex = isSender ? msg.recipientPubKey : msg.senderPubKey;

    const matchingKey = keyMap.get(myPubKeyHex);
    if (!matchingKey) return { ok: false, reason: "wrong-key" };

    if (matchingKey.loginKeyHash !== currentPasswordHash) {
      return { ok: false, reason: "wrong-key" };
    }

    try {
      const myPrivKey = decryptPrivateKey(
        matchingKey.encryptedPrivateKey,
        encryptionKey,
      );
      const theirPubKey = FixedBuf.fromHex(33, theirPubKeyHex);
      return {
        ok: true,
        content: decryptMessageContent(
          msg.encryptedContent,
          myPrivKey,
          theirPubKey,
        ),
      };
    } catch (err) {
      console.error("[tryDecrypt] failed:", err);
      return { ok: false, reason: "error" };
    }
  }

  async function handleSaveSecret(
    secret: {
      name: string;
      secretType: string;
      fields: Record<string, unknown>;
    },
    messageId: string,
    senderAddress: string,
  ) {
    const fields = secret.fields as Record<string, string>;
    if (!myKeyData || !encryptionKey) return;
    const myPrivKey = decryptPrivateKey(
      myKeyData.encryptedPrivateKey,
      encryptionKey,
    );
    const data: VaultEntryData =
      secret.secretType === "login"
        ? { type: "login" as const, ...fields }
        : { type: "text" as const, text: fields.text ?? "" };
    const encryptedData = encryptVaultEntry(data, myPrivKey);
    const result = await createEntry({
      data: {
        name: secret.name,
        type: secret.secretType,
        searchTerms: "",
        publicKey: myKeyData.publicKey,
        encryptedData,
        sourceMessageId: messageId,
        sourceAddress: senderAddress,
      },
    });
    // Mark as saved locally
    setMessageList((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, savedVaultEntryId: result.id }
          : m,
      ),
    );
    navigate({
      to: "/vault/$id",
      params: { id: result.id },
    });
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

      // Build sender address and sign the challenge request
      const me = await getMyUser();
      if (!me?.name || !me.domain) throw new Error("Account not saved");
      const senderAddress = `${me.name}@${me.domain}`;
      const { signature: reqSig, timestamp } = signPowRequest(
        senderAddress,
        address,
        myPrivKey,
      );

      const challenge = await getRemotePowChallenge({
        data: {
          recipientAddress: address,
          senderAddress,
          senderPubKey: myKeyData.publicKey,
          signature: reqSig,
          timestamp,
        },
      });
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
      // Don't manually poll — the 200ms polling loop picks it up
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
        <Link
          to="/home"
          onClick={onSelect}
          className="text-muted-foreground hover:text-foreground flex items-center gap-2 px-4 py-3 text-sm no-underline transition-colors"
        >
          <Home className="h-4 w-4" />
          Home
        </Link>
        <div className="border-border/30 border-t" />
        <div className="flex-1 overflow-y-auto">
          {channels.map((ch) => (
            <Link
              key={ch.id}
              to="/channel/$address"
              params={{ address: ch.counterpartyAddress }}
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
            </Link>
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
              const isMine = keyMap.has(msg.senderPubKey);
              const result = tryDecrypt(msg);
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  {result.ok && result.content.type === "text" ? (
                    <div
                      className={`max-w-[70%] rounded-lg px-4 py-2 text-sm ${
                        isMine
                          ? "bg-accent/15 text-foreground"
                          : "bg-background-highlight text-foreground"
                      }`}
                    >
                      <p className="break-words">{result.content.text}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ) : result.ok && result.content.type === "secret" ? (
                    <div
                      className={`max-w-[70%] rounded-lg px-4 py-2 text-sm ${
                        isMine
                          ? "bg-accent/15 text-foreground"
                          : "bg-background-highlight text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {result.content.secret.secretType === "login" ? (
                          <KeyRound className="h-4 w-4 shrink-0" />
                        ) : (
                          <FileText className="h-4 w-4 shrink-0" />
                        )}
                        <span className="font-medium">
                          {result.content.secret.name}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {result.content.secret.secretType === "login"
                          ? "Login"
                          : "Secret"}
                      </p>
                      {!isMine && (() => {
                        const sec = result.content.type === "secret" ? result.content.secret : null;
                        if (!sec) return null;
                        if (msg.savedVaultEntryId) {
                          return (
                            <Link
                              to="/vault/$id"
                              params={{ id: msg.savedVaultEntryId }}
                              className="text-accent hover:text-accent/80 mt-2 inline-block text-xs no-underline"
                            >
                              Saved
                            </Link>
                          );
                        }
                        return (
                          <button
                            onClick={() =>
                              handleSaveSecret(sec, msg.id, msg.senderAddress)
                            }
                            className="bg-accent text-accent-foreground hover:bg-accent/90 mt-2 inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs transition-all"
                          >
                            <LockIcon className="h-3 w-3" />
                            Save to Vault
                          </button>
                        );
                      })()}
                      <p className="text-muted-foreground mt-1 text-xs">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ) : !result.ok ? (
                    <div className="border-border/30 max-w-[70%] rounded-lg border border-dashed px-4 py-2 text-sm">
                      <div className="text-muted-foreground flex items-center gap-2 italic">
                        <LockKeyhole className="h-3 w-3 shrink-0" />
                        {result.reason === "loading"
                          ? "Decrypting..."
                          : result.reason === "wrong-key"
                            ? "Cannot decrypt — update password on Keys page"
                            : "Unable to decrypt this message"}
                      </div>
                      {result.reason === "wrong-key" && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          This key may use a different password.{" "}
                          <Link
                            to="/keys"
                            className="text-accent hover:text-accent/80 no-underline"
                          >
                            Go to Keys
                          </Link>
                        </p>
                      )}
                      <p className="text-muted-foreground mt-1 text-xs">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ) : null}
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
