import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  getMessagesForChannel,
  getMyChannels,
  getOlderMessages,
  sendMessage,
  getMyActiveEncryptedKey,
  getPublicKeyForAddress,
  getRemotePowChallenge,
  pollNewMessages,
  markChannelAsRead,
} from "~/server/message.functions";
import { getMyKeys, getMyUser } from "~/server/user.functions";
import {
  getCachedEncryptionKey,
  decryptSigningKey,
  decryptDecapKey,
  decryptEd25519Key,
  decryptX25519Key,
  signPowRequest,
} from "~/lib/auth";
import {
  encryptMessage,
  decryptMessageContent,
  verifyMessageSignature,
} from "~/lib/message";
import type { MessageContent } from "~/lib/message";
import { encryptVaultEntry } from "~/lib/vault";
import type { VaultEntryData } from "~/lib/vault";
import { createEntry } from "~/server/vault.functions";
import { PowModal } from "~/components/PowModal";
import type { PowChallenge, PowSolution } from "~/lib/use-pow-miner";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
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

export const Route = createFileRoute("/_app/_saved/channel/$address")({
  loader: async ({ params }) => {
    const address = params.address;
    const [msgs, channels, user] = await Promise.all([
      getMessagesForChannel({ data: address }),
      getMyChannels(),
      getMyUser(),
    ]);
    const myAddress =
      user?.name && user?.domain ? `${user.name}@${user.domain}` : null;
    return { address, messages: msgs, channels, myAddress };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.address} — KeyPears` : "KeyPears" },
    ],
  }),
  component: ChannelPage,
});

function ChannelPage() {
  const navigate = useNavigate();
  const {
    address,
    messages: initialMessages,
    channels: initialChannels,
    myAddress,
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

  // Hold in state so the reference is stable across renders. Reading
  // getCachedEncryptionKey() inline would return a new FixedBuf on every
  // render, which would cause any effect depending on it to re-run and
  // cancel in-flight decryption.
  const [encryptionKey, setEncryptionKey] = useState<FixedBuf<32> | null>(null);
  useEffect(() => {
    setEncryptionKey(getCachedEncryptionKey());
  }, []);
  const [powChallenge, setPowChallenge] = useState<PowChallenge | null>(null);

  const [myKeyData, setMyKeyData] = useState<{
    ed25519PublicKey: string;
    encryptedEd25519Key: string;
    x25519PublicKey: string;
    encryptedX25519Key: string;
    signingPublicKey: string;
    encapPublicKey: string;
    encryptedSigningKey: string;
    encryptedDecapKey: string;
  } | null>(null);
  const [keyMap, setKeyMap] = useState<
    Map<string, { encryptedEd25519Key: string; encryptedX25519Key: string; encryptedSigningKey: string; encryptedDecapKey: string; ed25519PublicKey: string; x25519PublicKey: string; encapPublicKey: string; loginKeyHash: string | null }>
  >(new Map());
  const [currentPasswordHash, setCurrentPasswordHash] = useState<string | null>(
    null,
  );
  useEffect(() => {
    getMyActiveEncryptedKey().then((d) =>
      setMyKeyData({
        ed25519PublicKey: d.ed25519PublicKey as string,
        encryptedEd25519Key: d.encryptedEd25519Key as string,
        x25519PublicKey: d.x25519PublicKey as string,
        encryptedX25519Key: d.encryptedX25519Key as string,
        signingPublicKey: d.signingPublicKey as string,
        encapPublicKey: d.encapPublicKey as string,
        encryptedSigningKey: d.encryptedSigningKey as string,
        encryptedDecapKey: d.encryptedDecapKey as string,
      }),
    );
    getMyKeys().then((data) => {
      const map = new Map<
        string,
        { encryptedEd25519Key: string; encryptedX25519Key: string; encryptedSigningKey: string; encryptedDecapKey: string; ed25519PublicKey: string; x25519PublicKey: string; encapPublicKey: string; loginKeyHash: string | null }
      >();
      for (const k of data.keys) {
        map.set(k.ed25519PublicKey as string, {
          encryptedEd25519Key: k.encryptedEd25519Key as string,
          encryptedX25519Key: k.encryptedX25519Key as string,
          encryptedSigningKey: k.encryptedSigningKey as string,
          encryptedDecapKey: k.encryptedDecapKey as string,
          ed25519PublicKey: k.ed25519PublicKey as string,
          x25519PublicKey: k.x25519PublicKey as string,
          encapPublicKey: k.encapPublicKey as string,
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
      // Wait for the initial message list to be set so lastIdRef is valid
      await new Promise((resolve) => setTimeout(resolve, 500));
      while (active) {
        if (!document.hidden && lastIdRef.current) {
          try {
            const newMsgs = await pollNewMessages({
              data: {
                counterpartyAddress: address,
                afterId: lastIdRef.current,
              },
            });
            if (!active) break;
            if (newMsgs.length > 0) {
              setMessageList((prev) => {
                const existingIds = new Set(prev.map((m) => m.id));
                const unique = newMsgs.filter((m) => !existingIds.has(m.id));
                return unique.length > 0 ? [...prev, ...unique] : prev;
              });
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

  type DecryptableMsg = {
    id: string;
    senderAddress: string;
    encryptedContent: string;
    senderEncryptedContent: string;
    senderPubKey: string;
    recipientPubKey: string;
    senderSignature: string;
    senderEd25519PubKey?: string;
    senderX25519PubKey?: string;
    recipientX25519PubKey?: string;
  };

  async function tryDecrypt(msg: DecryptableMsg): Promise<DecryptResult> {
    if (!encryptionKey || keyMap.size === 0 || !myAddress)
      return { ok: false, reason: "loading" };

    const isSender = keyMap.has(msg.senderPubKey);

    // Look up the matching key entry. The keyMap is keyed by ed25519PublicKey.
    // If we're the sender, look up by senderPubKey (our ed25519 key).
    // If we're the recipient, recipientPubKey is an encap key — search by value.
    let matchingKey: { encryptedEd25519Key: string; encryptedX25519Key: string; encryptedSigningKey: string; encryptedDecapKey: string; ed25519PublicKey: string; x25519PublicKey: string; encapPublicKey: string; loginKeyHash: string | null } | undefined;
    if (isSender) {
      matchingKey = keyMap.get(msg.senderPubKey);
    } else {
      for (const entry of keyMap.values()) {
        if (entry.encapPublicKey === msg.recipientPubKey) {
          matchingKey = entry;
          break;
        }
      }
    }
    if (!matchingKey) return { ok: false, reason: "wrong-key" };

    if (matchingKey.loginKeyHash !== currentPasswordHash) {
      return { ok: false, reason: "wrong-key" };
    }

    try {
      // Verify sender signature before trusting
      const sigValid = verifyMessageSignature(
        msg.senderAddress,
        isSender ? address : myAddress,
        WebBuf.fromHex(msg.senderEd25519PubKey ?? ""),
        WebBuf.fromHex(msg.senderPubKey),
        WebBuf.fromHex(msg.senderX25519PubKey ?? ""),
        WebBuf.fromHex(msg.recipientX25519PubKey ?? ""),
        WebBuf.fromHex(msg.recipientPubKey),
        WebBuf.fromHex(msg.encryptedContent),
        WebBuf.fromHex(msg.senderEncryptedContent),
        WebBuf.fromHex(msg.senderSignature),
      );
      if (!sigValid) {
        console.error("[tryDecrypt] invalid sender signature");
        return { ok: false, reason: "error" };
      }

      const myX25519Key = await decryptX25519Key(
        WebBuf.fromHex(matchingKey.encryptedX25519Key),
        encryptionKey,
      );
      const myDecapKey = await decryptDecapKey(
        WebBuf.fromHex(matchingKey.encryptedDecapKey),
        encryptionKey,
      );
      const ciphertextHex = isSender
        ? msg.senderEncryptedContent
        : msg.encryptedContent;
      const senderAddr = msg.senderAddress;
      const recipientAddr = isSender ? address : myAddress;
      // For X25519 decryption, we need the sender's X25519 pub key.
      // If we're the sender, use our own; if recipient, look up from msg or keyMap.
      const senderX25519PubKey = isSender
        ? WebBuf.fromHex(matchingKey.x25519PublicKey)
        : WebBuf.fromHex(msg.senderX25519PubKey ?? "");
      return {
        ok: true,
        content: decryptMessageContent(
          WebBuf.fromHex(ciphertextHex),
          myX25519Key,
          senderX25519PubKey,
          myDecapKey,
          senderAddr,
          recipientAddr,
        ),
      };
    } catch (err) {
      console.error("[tryDecrypt] failed:", err);
      return { ok: false, reason: "error" };
    }
  }

  // Pre-decrypt messages in an effect and memoize results by message ID so
  // that new messages only pay the decryption cost once, and existing
  // results survive re-renders and polling.
  const [decryptedMap, setDecryptedMap] = useState<Map<string, DecryptResult>>(
    new Map(),
  );

  useEffect(() => {
    if (!encryptionKey || keyMap.size === 0) return;
    let cancelled = false;
    (async () => {
      let changed = false;
      const next = new Map(decryptedMap);
      for (const msg of messageList) {
        if (next.has(msg.id)) continue;
        const result = await tryDecrypt(msg);
        if (cancelled) return;
        next.set(msg.id, result);
        changed = true;
      }
      if (!cancelled && changed) setDecryptedMap(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageList, keyMap, currentPasswordHash, encryptionKey]);

  // Reset the decrypted map when the encryption context changes (logout,
  // password change, different key set).
  useEffect(() => {
    setDecryptedMap(new Map());
  }, [keyMap, currentPasswordHash, encryptionKey]);

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
    const data: VaultEntryData =
      secret.secretType === "login"
        ? { type: "login" as const, ...fields }
        : { type: "text" as const, text: fields.text ?? "" };
    const encryptedDataBuf = await encryptVaultEntry(data, encryptionKey);
    // Get keyId from active key data
    const activeKeyData = await getMyKeys();
    const activeKey = activeKeyData.keys[0];
    if (!activeKey) throw new Error("No active key");
    const result = await createEntry({
      data: {
        name: secret.name,
        type: secret.secretType,
        searchTerms: "",
        keyId: activeKey.id,
        encryptedData: encryptedDataBuf.toHex(),
        sourceMessageId: messageId,
        sourceAddress: senderAddress,
      },
    });
    // Mark as saved locally
    setMessageList((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, savedVaultEntryId: result.id } : m,
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
    senderEncryptedContent: string;
    senderSignature: string;
    senderPubKey: string;
    recipientPubKey: string;
    senderEd25519PubKey: string;
    senderX25519PubKey: string;
    recipientX25519PubKey: string;
  } | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !myKeyData || !encryptionKey) return;
    setError("");
    setSending(true);

    try {
      // Look up recipient's public keys from existing messages or fetch them
      const recipientKeyResult = await getPublicKeyForAddress({ data: address });
      if (!recipientKeyResult) throw new Error("Cannot determine recipient key");
      const recipientEncapPubKeyHex = recipientKeyResult.encapPublicKey as string;

      const myEd25519Key = await decryptEd25519Key(
        WebBuf.fromHex(myKeyData.encryptedEd25519Key),
        encryptionKey,
      );
      const myX25519Key = await decryptX25519Key(
        WebBuf.fromHex(myKeyData.encryptedX25519Key),
        encryptionKey,
      );
      const mySigningKey = await decryptSigningKey(
        WebBuf.fromHex(myKeyData.encryptedSigningKey),
        encryptionKey,
      );
      const myEncapPubKey = FixedBuf.fromHex(1184, myKeyData.encapPublicKey);
      const theirEncapPubKey = FixedBuf.fromHex(1184, recipientEncapPubKeyHex);
      const senderAddress = myAddress!;
      const { recipientCiphertext, senderCiphertext, signature: msgSignature } = encryptMessage(
        text,
        senderAddress,
        address,
        myEd25519Key,
        WebBuf.fromHex(myKeyData.ed25519PublicKey),
        mySigningKey,
        WebBuf.fromHex(myKeyData.signingPublicKey),
        myX25519Key,
        WebBuf.fromHex(myKeyData.x25519PublicKey),
        myEncapPubKey,
        WebBuf.fromHex(recipientKeyResult.x25519PublicKey as string),
        theirEncapPubKey,
        WebBuf.fromHex(recipientEncapPubKeyHex),
      );

      pendingSendRef.current = {
        recipientAddress: address,
        encryptedContent: recipientCiphertext.toHex(),
        senderEncryptedContent: senderCiphertext.toHex(),
        senderSignature: msgSignature.toHex(),
        senderPubKey: myKeyData.ed25519PublicKey,
        recipientPubKey: recipientEncapPubKeyHex,
        senderEd25519PubKey: myKeyData.ed25519PublicKey,
        senderX25519PubKey: myKeyData.x25519PublicKey,
        recipientX25519PubKey: recipientKeyResult.x25519PublicKey as string,
      };

      // Sign the challenge request
      const { signature: reqSig, timestamp } = signPowRequest(
        senderAddress,
        address,
        myEd25519Key,
        mySigningKey,
      );

      const challenge = await getRemotePowChallenge({
        data: {
          recipientAddress: address,
          senderAddress,
          senderEd25519PubKey: myKeyData.ed25519PublicKey,
          senderPubKey: myKeyData.signingPublicKey,
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
                <p>Beginning of conversation.</p>
                <p className="mt-1">
                  Messages are end-to-end encrypted. Only you and the other
                  party can read them.
                </p>
              </div>
            )}
            {messageList.map((msg) => {
              const isMine = keyMap.has(msg.senderPubKey);
              const result: DecryptResult = decryptedMap.get(msg.id) ?? {
                ok: false,
                reason: "loading",
              };
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
                      {!isMine &&
                        (() => {
                          const sec =
                            result.content.type === "secret"
                              ? result.content.secret
                              : null;
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
