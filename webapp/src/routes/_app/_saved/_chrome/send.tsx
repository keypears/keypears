import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { z } from "zod";
import {
  sendMessage,
  getPublicKeyForAddress,
  getRemotePowChallenge,
} from "~/server/message.functions";
import { getMyUser } from "~/server/user.functions";
import { signPowRequest } from "~/lib/auth";
import { prepareOutboundMessage, loadActiveSenderKeys } from "~/lib/message";
import type { OutboundMessage } from "~/lib/message";
import { parseAddress } from "~/lib/config";
import { PowModal } from "~/components/PowModal";
import type { PowChallenge, PowSolution } from "~/lib/use-pow-miner";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { Send as SendIcon, Check, X, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/_saved/_chrome/send")({
  head: () => ({ meta: [{ title: "Send — KeyPears" }] }),
  validateSearch: z.object({
    to: z.string().catch(""),
  }),
  component: SendPage,
});

function SendPage() {
  const { to } = Route.useSearch();
  const navigate = useNavigate();
  const [recipient, setRecipient] = useState(to);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [powChallenge, setPowChallenge] = useState<PowChallenge | null>(null);

  // Recipient validation
  const [recipientStatus, setRecipientStatus] = useState<
    "idle" | "checking" | "found" | "not-found" | "invalid"
  >("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-fill recipient from ?to= search param once on mount.
  // handleRecipientChange is stable (no external deps) but defined after this
  // hook, so eslint can't verify — safe to suppress.
  useEffect(() => {
    if (to) handleRecipientChange(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRecipientChange(value: string) {
    setRecipient(value);
    setRecipientStatus("idle");

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value) {
      setRecipientStatus("idle");
      return;
    }

    const parsed = parseAddress(value);
    if (!parsed) {
      setRecipientStatus("invalid");
      return;
    }

    setRecipientStatus("checking");
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await getPublicKeyForAddress({ data: value });
        setRecipientStatus(result ? "found" : "not-found");
      } catch {
        setRecipientStatus("not-found");
      }
    }, 500);
  }

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Store encrypted data while PoW is mining
  const pendingSendRef = useRef<OutboundMessage | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);

    try {
      setStatus("Looking up recipient...");
      const recipientKeyResult = await getPublicKeyForAddress({
        data: recipient,
      });
      if (!recipientKeyResult)
        throw new Error("Recipient not found or has no key");

      setStatus("Preparing encryption...");
      const sender = await loadActiveSenderKeys();
      const me = await getMyUser();
      if (!me?.name || !me.domain) throw new Error("Account not saved");
      const senderAddress = `${me.name}@${me.domain}`;

      const msg = prepareOutboundMessage(
        text,
        senderAddress,
        recipient,
        sender,
        {
          x25519PubKey: WebBuf.fromHex(recipientKeyResult.x25519PublicKey),
          encapKey: FixedBuf.fromHex(1184, recipientKeyResult.encapPublicKey),
          encapPubKey: WebBuf.fromHex(recipientKeyResult.encapPublicKey),
          keyNumber: recipientKeyResult.keyNumber,
        },
      );

      pendingSendRef.current = msg;
      setStatus("");
      const { signature: reqSig, timestamp } = signPowRequest(
        senderAddress,
        recipient,
        sender.ed25519Key,
        sender.signingKey,
      );

      const challenge = await getRemotePowChallenge({
        data: {
          recipientAddress: recipient,
          senderAddress,
          senderEd25519PubKey: sender.ed25519PubKey.toHex(),
          senderMldsaPubKey: sender.signingPubKey.toHex(),
          signature: reqSig,
          timestamp,
        },
      });
      setPowChallenge(challenge);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
      setStatus("");
      setSending(false);
    }
  }

  async function handlePowComplete(solution: PowSolution) {
    setPowChallenge(null);
    const pending = pendingSendRef.current;
    if (!pending) return;

    try {
      setStatus("Sending...");
      await sendMessage({
        data: { ...pending, pow: solution },
      });
      navigate({
        to: "/channel/$address",
        params: { address: pending.recipientAddress },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
      setStatus("");
    } finally {
      setSending(false);
      pendingSendRef.current = null;
    }
  }

  function handlePowCancel() {
    setPowChallenge(null);
    setSending(false);
    setStatus("");
    pendingSendRef.current = null;
  }

  return (
    <div className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-foreground text-2xl font-bold">Send Message</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Messages are end-to-end encrypted using Diffie-Hellman key exchange.
      </p>

      <form onSubmit={handleSend} className="mt-6 flex flex-col gap-4">
        <div>
          <div className="relative">
            <input
              type="text"
              placeholder="Recipient address (e.g. alice@keypears.com)"
              value={recipient}
              onChange={(e) => handleRecipientChange(e.target.value)}
              className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 pr-10"
              required
            />
            <div className="absolute top-1/2 right-3 -translate-y-1/2">
              {recipientStatus === "checking" && (
                <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
              )}
              {recipientStatus === "found" && (
                <Check className="h-4 w-4 text-green-500" />
              )}
              {recipientStatus === "not-found" && (
                <X className="text-destructive h-4 w-4" />
              )}
              {recipientStatus === "invalid" && (
                <X className="text-muted-foreground h-4 w-4" />
              )}
            </div>
          </div>
          {recipientStatus === "not-found" && (
            <p className="text-destructive mt-1 text-xs">Recipient not found</p>
          )}
          {recipientStatus === "invalid" && (
            <p className="text-muted-foreground mt-1 text-xs">
              Enter a full address (e.g. alice@keypears.com)
            </p>
          )}
          {recipientStatus === "found" && (
            <p className="mt-1 text-xs text-green-500">Recipient found</p>
          )}
        </div>
        <textarea
          placeholder="Your message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="bg-background-dark border-border text-foreground min-h-32 rounded border px-4 py-2"
          required
        />
        {error && <p className="text-danger text-sm">{error}</p>}
        {status && <p className="text-muted-foreground text-sm">{status}</p>}
        <button
          type="submit"
          disabled={sending || recipientStatus === "not-found"}
          className="bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center justify-center gap-2 rounded px-4 py-2 font-sans transition-all duration-300 disabled:opacity-50"
        >
          <SendIcon className="h-4 w-4" />
          {sending ? "Sending..." : "Send"}
        </button>
      </form>

      <PowModal
        challenge={powChallenge}
        onComplete={handlePowComplete}
        onCancel={handlePowCancel}
      />
    </div>
  );
}
