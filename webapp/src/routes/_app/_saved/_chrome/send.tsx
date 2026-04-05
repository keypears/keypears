import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  sendMessage,
  getPublicKeyForAddress,
  getMyActiveEncryptedKey,
  getRemotePowChallenge,
} from "~/server/message.functions";
import { getCachedEncryptionKey, decryptPrivateKey } from "~/lib/auth";
import { encryptMessage } from "~/lib/message";
import { usePowMiner } from "~/lib/use-pow-miner";
import { FixedBuf } from "@webbuf/fixedbuf";
import { Send as SendIcon } from "lucide-react";

export const Route = createFileRoute("/_app/_saved/_chrome/send")({
  component: SendPage,
});

function SendPage() {
  const navigate = useNavigate();
  const [recipient, setRecipient] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const miner = usePowMiner();

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
      const myKeyData = await getMyActiveEncryptedKey();
      const encryptionKey = getCachedEncryptionKey();
      if (!encryptionKey) throw new Error("Please log in again");

      const myPrivKey = decryptPrivateKey(
        myKeyData.encryptedPrivateKey,
        encryptionKey,
      );
      const theirPubKey = FixedBuf.fromHex(33, recipientKeyResult.publicKey);

      const encryptedContent = encryptMessage(text, myPrivKey, theirPubKey);

      // Get PoW challenge from recipient's server and mine it
      setStatus("Computing proof of work...");
      const challenge = await getRemotePowChallenge({ data: recipient });
      const solution = await miner.mine(challenge);

      setStatus("Sending...");
      await sendMessage({
        data: {
          recipientAddress: recipient,
          encryptedContent,
          senderPubKey: myKeyData.publicKey,
          recipientPubKey: recipientKeyResult.publicKey,
          pow: solution,
        },
      });

      navigate({ to: `/channel/${recipient}` });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
      setStatus("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-foreground text-2xl font-bold">Send Message</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Messages are end-to-end encrypted using Diffie-Hellman key exchange.
      </p>

      <form onSubmit={handleSend} className="mt-6 flex flex-col gap-4">
        <input
          type="text"
          placeholder="Recipient address (e.g. 5@domain.com)"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="bg-background-dark border-border text-foreground rounded border px-4 py-2"
          required
        />
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
          disabled={sending}
          className="bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center justify-center gap-2 rounded px-4 py-2 font-sans transition-all duration-300 disabled:opacity-50"
        >
          <SendIcon className="h-4 w-4" />
          {sending ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}
