import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { z } from "zod/v4";
import { getMyUser, getMyKeys } from "~/server/user.functions";
import { authMiddleware } from "~/server/auth-middleware";
import { getCachedEncryptionKey, decryptSigningKey } from "~/lib/auth";
import { mlDsa65Sign } from "@webbuf/mldsa";
import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf } from "@webbuf/fixedbuf";
import { buildCanonicalPayload } from "@keypears/client";
import { Shield, LogIn, X } from "lucide-react";

/** Default signing window: 10 minutes from now. */
const SIGN_EXPIRY_MS = 10 * 60 * 1000;

/** Server function: generate nonce, timestamp, and expires at signing time. */
const getSigningChallenge = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { FixedBuf } = await import("@webbuf/fixedbuf");
    return {
      nonce: FixedBuf.fromRandom(32).buf.toHex(),
      timestamp: new Date().toISOString(),
      expires: new Date(Date.now() + SIGN_EXPIRY_MS).toISOString(),
    };
  },
);

const signSearchSchema = z.object({
  type: z.literal("sign-in").catch("sign-in" as const),
  domain: z.string().catch(""),
  data: z.string().optional().catch(undefined),
  redirect_uri: z.string().catch(""),
  state: z.string().catch(""),
});

type SignSearch = z.infer<typeof signSearchSchema>;

function validateSearchParams(search: SignSearch): string | null {
  if (search.type !== "sign-in") return "Unsupported signing type.";
  if (!search.domain) return "Missing domain.";
  if (search.data !== undefined && !/^[0-9a-fA-F]{1,64}$/.test(search.data))
    return "Data must be hex, max 64 characters.";
  if (!search.redirect_uri) return "Missing redirect_uri.";
  try {
    const url = new URL(search.redirect_uri);
    if (url.protocol !== "https:" && url.hostname !== "localhost")
      return "redirect_uri must be HTTPS.";
    // redirect_uri must match the declared domain — exact match or subdomain
    if (
      url.hostname !== search.domain &&
      !url.hostname.endsWith(`.${search.domain}`)
    )
      return `redirect_uri hostname must match domain "${search.domain}".`;
  } catch {
    return "Invalid redirect_uri.";
  }
  if (!search.state) return "Missing state.";
  return null;
}

function signPayload(
  payload: string,
  signingKey: FixedBuf<4032>,
): string {
  const message = WebBuf.fromUtf8(payload);
  const sig = mlDsa65Sign(signingKey, message);
  const bytes = new Uint8Array(sig.buf);
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const Route = createFileRoute("/_app/_saved/sign")({
  validateSearch: signSearchSchema,
  head: () => ({ meta: [{ title: "Sign — KeyPears" }] }),
  loader: async () => {
    const [user, keyData] = await Promise.all([getMyUser(), getMyKeys()]);
    return { user, keyData };
  },
  component: SignPage,
});

function SignPage() {
  const search = Route.useSearch();
  const { user, keyData } = Route.useLoaderData();

  const [privateKey, setPrivateKey] = useState<FixedBuf<4032> | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState("");

  // Decrypt the active private key
  useEffect(() => {
    const encryptionKey = getCachedEncryptionKey();
    if (!encryptionKey || !keyData.keys.length) return;
    let cancelled = false;
    (async () => {
      for (const k of keyData.keys) {
        if (k.loginKeyHash === keyData.passwordHash) {
          try {
            const priv = await decryptSigningKey(
              k.encryptedSigningKey,
              encryptionKey,
            );
            if (!cancelled) setPrivateKey(priv);
            return;
          } catch {
            // locked key, try next
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [keyData]);

  const validationError = validateSearchParams(search);
  const myAddress =
    user?.name && user?.domain ? `${user.name}@${user.domain}` : null;

  async function handleApprove() {
    if (!privateKey || !myAddress) return;
    setSigning(true);
    setError("");
    try {
      const { nonce, timestamp, expires } = await getSigningChallenge();
      const payload = buildCanonicalPayload({
        type: search.type,
        domain: search.domain,
        address: myAddress,
        nonce,
        timestamp,
        expires,
        data: search.data,
      });
      const signature = signPayload(payload, privateKey);

      const form = document.createElement("form");
      form.method = "POST";
      form.action = search.redirect_uri;
      const fields: Record<string, string> = {
        signature,
        address: myAddress,
        nonce,
        timestamp,
        expires,
        state: search.state,
      };
      if (search.data !== undefined) fields.data = search.data;
      for (const [name, value] of Object.entries(fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Signing failed. Try again.",
      );
      setSigning(false);
    }
  }

  function handleDeny() {
    const callbackUrl = new URL(search.redirect_uri);
    callbackUrl.searchParams.set("error", "access_denied");
    callbackUrl.searchParams.set("state", search.state);
    window.location.href = callbackUrl.toString();
  }

  // Validation error — do not redirect, show error
  if (validationError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 font-sans">
        <div className="w-full max-w-md text-center">
          <Shield className="text-danger mx-auto mb-4 h-12 w-12" />
          <h1 className="text-foreground text-xl font-bold">
            Invalid Signing Request
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {validationError}
          </p>
        </div>
      </div>
    );
  }

  // No user/address — should not happen (route is under _saved)
  if (!myAddress) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 font-sans">
        <div className="w-full max-w-md text-center">
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8 font-sans">
      <div className="border-border/30 w-full max-w-md rounded-lg border p-8">
        {/* Header */}
        <div className="text-center">
          <Shield className="text-accent mx-auto mb-4 h-12 w-12" />
          <h1 className="text-foreground text-xl font-bold">
            {search.domain}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            wants to verify your identity
          </p>
        </div>

        {/* Identity */}
        <div className="mt-8">
          <label className="text-muted-foreground text-xs uppercase tracking-wider">
            Sign in as
          </label>
          <div className="bg-background-dark border-border mt-2 rounded border px-4 py-3">
            <span className="text-foreground text-sm font-medium">
              {myAddress}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="mt-4">
          <p className="text-muted-foreground text-xs">
            Type: {search.type}
          </p>
        </div>

        {/* Error */}
        {error && <p className="text-danger mt-4 text-sm">{error}</p>}

        {/* Actions */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={handleApprove}
            disabled={signing || !privateKey}
            className="bg-accent text-accent-foreground hover:bg-accent/90 flex flex-1 items-center justify-center gap-2 rounded px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" />
            {signing ? "Signing..." : "Approve"}
          </button>
          <button
            onClick={handleDeny}
            disabled={signing}
            className="border-border text-muted-foreground hover:text-foreground flex flex-1 items-center justify-center gap-2 rounded border px-4 py-2.5 text-sm transition-all"
          >
            <X className="h-4 w-4" />
            Deny
          </button>
        </div>

        {/* Private key loading state */}
        {!privateKey && keyData.keys.length > 0 && (
          <p className="text-muted-foreground mt-4 text-center text-xs">
            Decrypting signing key...
          </p>
        )}
      </div>
    </div>
  );
}
