import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import {
  sendMessage,
  getPublicKeyForAddress,
  getMyActiveEncryptedKey,
} from "~/server/message.functions";
import { getLoginPowChallenge } from "~/server/pow.functions";
import { getCachedEncryptionKey, decryptPrivateKey } from "~/lib/auth";
import { encryptMessage } from "~/lib/message";
import { FixedBuf } from "@webbuf/fixedbuf";
import { Send as SendIcon } from "lucide-react";

export const Route = createFileRoute("/_app/_saved/_chrome/send")({
  component: SendPage,
});

function SendPage() {
  const [recipient, setRecipient] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const startTimeRef = useRef(0);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);

    try {
      // 1. Look up recipient's public key
      setStatus("Looking up recipient...");
      const recipientKeyResult = await getPublicKeyForAddress({
        data: recipient,
      });
      if (!recipientKeyResult)
        throw new Error("Recipient not found or has no key");

      // 2. Get our own encrypted private key
      setStatus("Preparing encryption...");
      const myKeyData = await getMyActiveEncryptedKey();
      const encryptionKey = getCachedEncryptionKey();
      if (!encryptionKey) throw new Error("Please log in again");

      const myPrivKey = decryptPrivateKey(
        myKeyData.encryptedPrivateKey,
        encryptionKey,
      );
      const theirPubKey = FixedBuf.fromHex(33, recipientKeyResult.publicKey);

      // 3. Encrypt the message
      setStatus("Encrypting...");
      const encryptedContent = encryptMessage(text, myPrivKey, theirPubKey);

      // 4. Check if PoW is needed (new channel)
      // We optimistically try without PoW first
      try {
        await sendMessage({
          data: {
            recipientAddress: recipient,
            encryptedContent,
            senderPubKey: myKeyData.publicKey,
            recipientPubKey: recipientKeyResult.publicKey,
          },
        });
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.message.includes("Proof of work required")
        ) {
          // Need PoW for new channel
          setStatus("New channel — computing proof of work...");
          const challenge = await getLoginPowChallenge();
          startTimeRef.current = performance.now();

          const { Pow5_64b_Wasm, hashMeetsTarget } = await import(
            "@keypears/pow5"
          );
          const { WebBuf } = await import("@webbuf/webbuf");

          const headerBuf = FixedBuf.fromHex(64, challenge.header);
          const targetBuf = FixedBuf.fromHex(32, challenge.target);

          let solvedHeaderHex: string | null = null;
          let nonce = 0;

          while (!solvedHeaderHex) {
            const nonceBuf = WebBuf.alloc(32);
            let remaining = BigInt(nonce);
            for (let i = 31; i >= 0; i--) {
              nonceBuf[i] = Number(remaining & 0xffn);
              remaining = remaining >> 8n;
            }
            const testHeader = FixedBuf.fromBuf(
              64,
              WebBuf.from([...nonceBuf, ...headerBuf.buf.slice(32)]),
            );
            const hash = Pow5_64b_Wasm.elementaryIteration(testHeader);

            if (hashMeetsTarget(hash, targetBuf)) {
              solvedHeaderHex = testHeader.buf.toHex();
            }

            nonce++;
            if (nonce % 1000 === 0) {
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }

          setStatus("Sending...");
          await sendMessage({
            data: {
              recipientAddress: recipient,
              encryptedContent,
              senderPubKey: myKeyData.publicKey,
              recipientPubKey: recipientKeyResult.publicKey,
              pow: {
                solvedHeader: solvedHeaderHex,
                target: challenge.target,
                expiresAt: challenge.expiresAt,
                signature: challenge.signature,
              },
            },
          });
        } else {
          throw err;
        }
      }

      setText("");
      setRecipient("");
      setStatus("Message sent!");
      setTimeout(() => setStatus(""), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
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
          placeholder="Recipient address (e.g. 5@keypears.com)"
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
        {status && (
          <p className="text-muted-foreground text-sm">{status}</p>
        )}
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
