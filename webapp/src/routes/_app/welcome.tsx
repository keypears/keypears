import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Checkbox } from "~/components/ui/checkbox";
import {
  getMyUser,
  saveMyUser,
  deleteMyUser,
  checkNameAvailable,
} from "~/server/user.functions";
import { getServerDomain } from "~/server/config.functions";
import {
  derivePasswordKey,
  deriveLoginKeyFromPasswordKey,
  deriveEncryptionKeyFromPasswordKey,
  generateAndEncryptKeyPairFromEncryptionKey,
  cacheEncryptionKey,
  calculatePasswordEntropy,
  entropyTier,
  entropyLabel,
  entropyColor,
  cacheEntropyTier,
} from "~/lib/auth";
import { nameSchema } from "~/server/schemas";
import { parseAddress } from "~/lib/config";
import { Check, X, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/welcome")({
  loader: async () => {
    const user = await getMyUser();
    if (!user) throw new Error("Not logged in");
    const domain = await getServerDomain();
    return { ...user, domain };
  },
  head: () => ({ meta: [{ title: "Choose Your Address — KeyPears" }] }),
  component: WelcomePage,
});

function WelcomePage() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();

  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [checkingName, setCheckingName] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);

  function extractParsed(): { name: string; domain: string } | null {
    const parsed = parseAddress(address);
    if (!parsed) return null;
    const result = nameSchema.safeParse(parsed.name);
    if (!result.success) return null;
    return parsed;
  }

  function handleAddressChange(value: string) {
    setAddress(value);
    setNameAvailable(null);

    if (!value) {
      setAddressError("");
      return;
    }

    const parsed = parseAddress(value);
    if (!parsed) {
      setAddressError(`Enter a full address (e.g. yourname@${data.domain})`);
      return;
    }

    const result = nameSchema.safeParse(parsed.name);
    if (!result.success) {
      setAddressError(result.error.issues[0]?.message ?? "Invalid name");
    } else {
      setAddressError("");
    }
  }

  async function handleAddressBlur() {
    const parsed = extractParsed();
    if (!parsed || addressError) return;

    setCheckingName(true);
    setNameAvailable(null);
    try {
      const result = await checkNameAvailable({
        data: { name: parsed.name, domain: parsed.domain },
      });
      if (result.error) {
        setAddressError(result.error);
      } else {
        setNameAvailable(result.available);
      }
    } catch {
      setAddressError("Failed to check availability");
    } finally {
      setCheckingName(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const parsed = extractParsed();
    if (!parsed) {
      setError("Please enter a valid address.");
      return;
    }
    if (addressError) {
      setError("Please fix the address error.");
      return;
    }
    if (nameAvailable === false) {
      setError("This name is already taken.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const passwordKey = await derivePasswordKey(password);
      const loginKey = await deriveLoginKeyFromPasswordKey(passwordKey);
      const encryptionKey = await deriveEncryptionKeyFromPasswordKey(passwordKey);
      const { publicKey, encryptedPrivateKey } =
        await generateAndEncryptKeyPairFromEncryptionKey(encryptionKey);
      cacheEncryptionKey(encryptionKey);
      const entropy = calculatePasswordEntropy(password);
      cacheEntropyTier(entropyTier(entropy));
      await saveMyUser({
        data: {
          name: parsed.name,
          domain: parsed.domain,
          loginKey,
          publicKey,
          encryptedPrivateKey,
        },
      });
      navigate({ to: "/home" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col font-sans">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-foreground text-4xl font-bold">
            Choose Your Address
          </h1>
          <p className="text-foreground-dark mt-2">
            This will be your KeyPears identity.
          </p>

          <div className="mt-8">
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder={`yourname@${data.domain}`}
                    value={address}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    onBlur={handleAddressBlur}
                    className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 pr-10"
                    required
                  />
                  <div className="absolute top-1/2 right-3 -translate-y-1/2">
                    {checkingName && (
                      <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                    )}
                    {!checkingName && nameAvailable === true && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                    {!checkingName && nameAvailable === false && (
                      <X className="text-destructive h-4 w-4" />
                    )}
                  </div>
                </div>
                {addressError && (
                  <p className="text-destructive mt-1 text-xs">
                    {addressError}
                  </p>
                )}
                {!addressError && nameAvailable === false && (
                  <p className="text-destructive mt-1 text-xs">
                    This address is already taken
                  </p>
                )}
                {!addressError && nameAvailable === true && (
                  <p className="mt-1 text-xs text-green-500">
                    This address is available!
                  </p>
                )}
              </div>
              <div>
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2"
                  required
                />
                {password.length > 0 && (
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {password.length} characters
                    </span>
                    <span
                      className={entropyColor(
                        entropyTier(calculatePasswordEntropy(password)),
                      )}
                    >
                      {calculatePasswordEntropy(password).toFixed(1)} bits —{" "}
                      {entropyLabel(
                        entropyTier(calculatePasswordEntropy(password)),
                      )}
                    </span>
                  </div>
                )}
              </div>
              <input
                type="password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="bg-background-dark border-border text-foreground rounded border px-4 py-2"
                required
              />
              <div className="flex items-start gap-3">
                <Checkbox
                  id="tos"
                  checked={tosAccepted}
                  onCheckedChange={(checked) =>
                    setTosAccepted(checked === true)
                  }
                  className="mt-0.5"
                />
                <label
                  htmlFor="tos"
                  className="text-muted-foreground cursor-pointer text-sm leading-snug"
                >
                  I agree to the{" "}
                  <Link
                    to="/terms"
                    target="_blank"
                    className="text-accent hover:text-accent/80 no-underline"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    to="/privacy"
                    target="_blank"
                    className="text-accent hover:text-accent/80 no-underline"
                  >
                    Privacy Policy
                  </Link>
                </label>
              </div>
              {error && <p className="text-danger text-sm">{error}</p>}
              <button
                type="submit"
                disabled={
                  saving ||
                  !!addressError ||
                  nameAvailable === false ||
                  !tosAccepted
                }
                className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-4 py-2 font-sans transition-all duration-300 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </form>
            <button
              onClick={async () => {
                await deleteMyUser();
                navigate({ to: "/" });
              }}
              className="text-muted-foreground hover:text-destructive mt-4 cursor-pointer text-xs transition-colors"
            >
              Delete my account
            </button>
          </div>
        </div>
      </div>
      <div className="pb-12" />
    </div>
  );
}
