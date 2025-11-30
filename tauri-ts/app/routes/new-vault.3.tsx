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
  blake3Hash,
  publicKeyCreate,
  FixedBuf,
} from "@keypears/lib";
import { createVault } from "~app/db/models/vault";
import { initDb } from "~app/db";
import { cn } from "~app/lib/utils";
import { createApiClient } from "~app/lib/api-client";
import { generateDeviceId, detectDeviceDescription } from "~app/lib/device";

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
        console.log("=== Vault Creation ===");
        console.log("Vault ID:", vaultId);
        console.log("Vault Name:", vaultName);
        console.log("Vault Domain:", vaultDomain);

        // 1. Derive password key from password with vaultId
        console.log("\n--- Step 1: Derive Password Key ---");
        const passwordKey = derivePasswordKey(password, vaultId);
        console.log("Password Key:", passwordKey.buf.toHex());

        // 2. Derive encryption key from password key
        console.log("\n--- Step 2: Derive Encryption Key ---");
        const encryptionKey = deriveEncryptionKey(passwordKey);
        console.log("Encryption Key:", encryptionKey.buf.toHex());

        // 3. Generate random 32-byte vault key (secp256k1 private key)
        console.log("\n--- Step 3: Generate Vault Key ---");
        const vaultKey = FixedBuf.alloc(32);
        crypto.getRandomValues(vaultKey.buf);
        console.log("Vault Key (private):", vaultKey.buf.toHex());

        // 4. Derive vault public key from vault key
        console.log("\n--- Step 4: Derive Vault Public Key ---");
        const vaultPublicKey = publicKeyCreate(vaultKey);
        console.log("Vault Public Key:", vaultPublicKey.buf.toHex());

        // 5. Hash the public key to get pubkeyhash (vault identity)
        console.log("\n--- Step 5: Hash Public Key ---");
        const vaultPubKeyHash = blake3Hash(vaultPublicKey.buf);
        console.log("Vault PubKeyHash:", vaultPubKeyHash.buf.toHex());

        // 6. Encrypt vault key with encryption key
        console.log("\n--- Step 6: Encrypt Vault Key ---");
        const encryptedVaultKey = encryptKey(vaultKey, encryptionKey);
        console.log("Encrypted Vault Key:", encryptedVaultKey.toHex());

        // 7. Derive login key for server authentication
        console.log("\n--- Step 7: Derive Login Key ---");
        const loginKey = deriveLoginKey(passwordKey);
        console.log("Login Key:", loginKey.buf.toHex());
        console.log("(Login key will be sent to server unhashed - server will KDF it with 1k rounds)");

        // Calculate and log entropy
        const pwdEntropy = calculatePasswordEntropy(password.length, {
          lowercase: /[a-z]/.test(password),
          uppercase: /[A-Z]/.test(password),
          numbers: /[0-9]/.test(password),
          symbols: /[^a-zA-Z0-9]/.test(password),
        });

        console.log("\n--- Entropy Analysis ---");
        console.log("Password Entropy:", pwdEntropy.toFixed(1), "bits");

        setPasswordEntropy(pwdEntropy);

        // 8. Register vault with server (send unhashed login key + encrypted vault key)
        console.log("\n--- Step 8: Register with Server ---");
        const vaultPubKeyHashHex = vaultPubKeyHash.buf.toHex();
        const loginKeyHex = loginKey.buf.toHex();
        const encryptedVaultKeyHex = encryptedVaultKey.toHex();

        console.log("vaultPubKeyHash length:", vaultPubKeyHashHex.length, "expected: 64");
        console.log("loginKey length:", loginKeyHex.length, "expected: 64");
        console.log("encryptedVaultKey length:", encryptedVaultKeyHex.length);
        console.log("vaultPubKeyHash value:", vaultPubKeyHashHex);
        console.log("loginKey value:", loginKeyHex);
        console.log("(Server will KDF login key with 1k rounds)");

        const client = createApiClient(vaultDomain);
        console.log("Calling registerVault with:", {
          vaultId,
          name: vaultName,
          domain: vaultDomain,
          vaultPubKeyHash: vaultPubKeyHashHex,
          loginKey: loginKeyHex,
          encryptedVaultKey: encryptedVaultKeyHex,
        });

        const registrationResult = await client.api.registerVault({
          vaultId,
          name: vaultName,
          domain: vaultDomain,
          vaultPubKeyHash: vaultPubKeyHashHex,
          loginKey: loginKeyHex,
          encryptedVaultKey: encryptedVaultKeyHex,
        });
        console.log("Server registration successful. Vault ID:", registrationResult.vaultId);

        // 9. Generate device ID and description
        console.log("\n--- Step 9: Generate Device Info ---");
        const deviceId = generateDeviceId();
        const deviceDescription = await detectDeviceDescription();
        console.log("Device ID:", deviceId);
        console.log("Device Description:", deviceDescription);

        // 10. Save vault to local database with server-generated ID
        console.log("\n--- Step 10: Save to Local Database ---");
        const vault = await createVault(
          registrationResult.vaultId, // Server-generated ULID
          vaultName,
          vaultDomain,
          encryptedVaultKey.toHex(),
          vaultPubKeyHash.buf.toHex(),
          deviceId,
          deviceDescription,
        );
        console.log("Vault saved to database with ID:", vault.id);
        console.log("Vault PubKeyHash:", vault.vaultPubKeyHash);

        console.log("\n=== Vault Creation Complete ===\n");
      } catch (err) {
        console.error("Error creating vault:", err);
        console.error("Error details:", JSON.stringify(err, null, 2));

        let errorMessage = "Failed to create vault";
        if (err instanceof Error) {
          errorMessage = err.message;
          console.error("Error name:", err.name);
          console.error("Error stack:", err.stack);
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
    navigate(href("/"));
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
                      to="/"
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
                    {isCreating ? "Creating Vault..." : "Vault Created Successfully"}
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
                            <span className="font-mono">{vaultName}@{vaultDomain}</span>
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
                      Continue to Vaults
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
