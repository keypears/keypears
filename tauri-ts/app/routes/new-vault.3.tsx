import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate, href } from "react-router";
import { CheckCircle, AlertCircle } from "lucide-react";
import { ulid } from "ulid";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import {
  calculatePasswordEntropy,
  derivePasswordKey,
  deriveEncryptionKey,
  deriveLoginKey,
  encryptKey,
  sha256Hash,
  publicKeyCreate,
  FixedBuf,
} from "@keypears/lib";
import { createVault, updateVaultLastAccessed } from "~app/db/models/vault";
import { initDb } from "~app/db";
import { cn } from "~app/lib/utils";
import { createClientFromDomain } from "@keypears/api-server/client";
import { generateDeviceId, detectDeviceDescription } from "~app/lib/device";
import { unlockVault, setSession } from "~app/lib/vault-store";
import { refreshSyncState } from "~app/contexts/sync-context";
import { startBackgroundSync } from "~app/lib/sync-service";

export default function NewVaultStep3() {
  const location = useLocation();
  const navigate = useNavigate();
  const { vaultName, vaultDomain, password } =
    (location.state as {
      vaultName?: string;
      vaultDomain?: string;
      password?: string;
    }) || {};

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [passwordEntropy, setPasswordEntropy] = useState(0);
  const [createdVaultId, setCreatedVaultId] = useState<string | null>(null);
  const hasRun = useRef(false);

  // Redirect to step 1 if missing previous state
  useEffect(() => {
    if (!vaultName || !vaultDomain || !password) {
      navigate(href("/new-vault/1"));
    }
  }, [vaultName, vaultDomain, password, navigate]);

  // Generate all keys and save to database (runs only once)
  useEffect(() => {
    if (!vaultName || !vaultDomain || !password || hasRun.current) {
      return;
    }

    hasRun.current = true;

    const createVaultWithKeys = async () => {
      setIsCreating(true);
      setError("");

      try {
        // Initialize database
        await initDb();

        // Generate vaultId client-side
        const vaultId = ulid();

        // 1. Derive password key from password with vaultId
        const passwordKey = derivePasswordKey(password, vaultId);

        // 2. Derive encryption key from password key
        const encryptionKey = deriveEncryptionKey(passwordKey);

        // 3. Generate random 32-byte vault key (secp256k1 private key)
        const vaultKey = FixedBuf.alloc(32);
        crypto.getRandomValues(vaultKey.buf);

        // 4. Derive vault public key from vault key
        const vaultPublicKey = publicKeyCreate(vaultKey);

        // 5. Hash the public key to get pubkeyhash (vault identity)
        const vaultPubKeyHash = sha256Hash(vaultPublicKey.buf);

        // 6. Encrypt vault key with encryption key
        const encryptedVaultKey = encryptKey(vaultKey, encryptionKey);

        // 7. Derive login key for server authentication
        const loginKey = deriveLoginKey(passwordKey);

        // Calculate entropy for display
        const pwdEntropy = calculatePasswordEntropy(password.length, {
          lowercase: /[a-z]/.test(password),
          uppercase: /[A-Z]/.test(password),
          numbers: /[0-9]/.test(password),
          symbols: /[^a-zA-Z0-9]/.test(password),
        });

        setPasswordEntropy(pwdEntropy);

        // 8. Register vault with server
        const vaultPubKeyHashHex = vaultPubKeyHash.buf.toHex();
        const loginKeyHex = loginKey.buf.toHex();
        const encryptedVaultKeyHex = encryptedVaultKey.toHex();

        const client = await createClientFromDomain(vaultDomain);

        const registrationResult = await client.api.registerVault({
          vaultId,
          name: vaultName,
          domain: vaultDomain,
          vaultPubKeyHash: vaultPubKeyHashHex,
          loginKey: loginKeyHex,
          encryptedVaultKey: encryptedVaultKeyHex,
        });

        // 9. Generate device ID and description
        const deviceId = generateDeviceId();
        const deviceDescription = await detectDeviceDescription();

        // 10. Save vault to local database with server-generated ID
        const vault = await createVault(
          registrationResult.vaultId,
          vaultName,
          vaultDomain,
          encryptedVaultKey.toHex(),
          vaultPubKeyHash.buf.toHex(),
          deviceId,
          deviceDescription,
        );

        // 11. Login to get session token
        const loginResponse = await client.api.login({
          vaultId: vault.id,
          loginKey: loginKeyHex,
          deviceId,
          clientDeviceDescription: deviceDescription,
        });

        // 12. Set session in vault-store
        setSession(vault.id, loginResponse.sessionToken, loginResponse.expiresAt);

        // 13. Unlock vault with all derived keys
        unlockVault({
          vaultId: vault.id,
          vaultName,
          vaultDomain,
          passwordKey,
          encryptionKey,
          loginKey,
          vaultKey,
          vaultPublicKey,
          encryptedVaultKey: encryptedVaultKey.toHex(),
          vaultPubKeyHash: vaultPubKeyHash.buf.toHex(),
          deviceId,
          deviceDescription,
        });

        // 14. Refresh sync state for this vault
        await refreshSyncState(vault.id);

        // 15. Start background sync for this vault
        startBackgroundSync(vault.id, vaultDomain, vaultKey, () => {
          refreshSyncState(vault.id);
        });

        // 16. Update last accessed timestamp
        await updateVaultLastAccessed(vault.id);

        // Store created vault ID for navigation
        setCreatedVaultId(vault.id);
      } catch (err) {
        console.error("Error creating vault:", err);

        let errorMessage = "Failed to create vault";
        if (err instanceof Error) {
          errorMessage = err.message;
        }

        setError(errorMessage);
      } finally {
        setIsCreating(false);
      }
    };

    createVaultWithKeys();
  }, [vaultName, vaultDomain, password]);

  if (!vaultName || !vaultDomain || !password) {
    return null;
  }

  const handleContinue = () => {
    if (createdVaultId) {
      navigate(href("/vault/:vaultId/secrets", { vaultId: createdVaultId }));
    } else {
      navigate(href("/"));
    }
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col items-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="border-border bg-card rounded-lg border p-8">
            {error ? (
              /* Error State */
              <>
                <div className="mb-6 flex flex-col items-center text-center">
                  <div className="bg-destructive/10 mb-4 rounded-full p-4">
                    <AlertCircle className="text-destructive h-12 w-12" />
                  </div>
                  <h1 className="text-2xl font-bold">Vault Creation Failed</h1>
                </div>

                <div className="border-destructive/50 bg-destructive/10 mb-6 rounded-lg border p-4">
                  <p className="text-destructive text-sm">{error}</p>
                </div>

                <div className="space-y-3">
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => navigate(href("/new-vault/1"))}
                  >
                    Start Over
                  </Button>
                  <div className="text-center">
                    <Link
                      to={href("/")}
                      className="text-muted-foreground text-sm transition-opacity hover:opacity-80"
                    >
                      Cancel
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-6 flex flex-col items-center text-center">
                  <div className="bg-primary/10 mb-4 rounded-full p-4">
                    <CheckCircle className="text-primary h-12 w-12" />
                  </div>
                  <h1 className="text-2xl font-bold">
                    {isCreating
                      ? "Creating Vault..."
                      : "Vault Created Successfully"}
                  </h1>
                </div>

                {isCreating ? (
                  <div className="text-muted-foreground mb-6 text-center">
                    <p>Generating keys and registering vault...</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-6 space-y-3">
                      <div className="border-border rounded-lg border p-4">
                        <h3 className="mb-2 font-semibold">Vault Details</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Name:</span>
                            <span className="font-mono">
                              {vaultName}@{vaultDomain}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Password Strength:
                            </span>
                            <span
                              className={cn(
                                "font-medium",
                                passwordEntropy >= 75 && "text-green-500",
                                passwordEntropy >= 50 &&
                                  passwordEntropy < 75 &&
                                  "text-yellow-500",
                                passwordEntropy < 50 && "text-destructive",
                              )}
                            >
                              {passwordEntropy.toFixed(1)} bits
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleContinue}
                      disabled={isCreating}
                    >
                      Continue to Vault
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
