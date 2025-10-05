import type { MetaFunction } from "react-router";
import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { CheckCircle } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Footer } from "~app/components/footer";
import { Button } from "~app/components/ui/button";
import {
  calculatePasswordEntropy,
  derivePasswordKey,
  deriveEncryptionKey,
  deriveLoginKey,
  generateKey,
  encryptKey,
} from "@keypears/lib";
import { createVault } from "~app/db/models/vault";
import { cn } from "~app/lib/utils";

export default function NewVaultStep4() {
  const location = useLocation();
  const navigate = useNavigate();
  const { vaultName, password, pin } =
    (location.state as {
      vaultName?: string;
      password?: string;
      pin?: string;
    }) || {};

  const [isCreating, setIsCreating] = useState(false);
  const [passwordEntropy, setPasswordEntropy] = useState(0);
  const [pinEntropy, setPinEntropy] = useState(0);
  const hasRun = useRef(false);

  // Redirect to step 1 if missing previous state
  useEffect(() => {
    if (!vaultName || !password || !pin) {
      navigate("/new-vault/1");
    }
  }, [vaultName, password, pin, navigate]);

  // Generate all keys and save to database (runs only once)
  useEffect(() => {
    if (!vaultName || !password || !pin || hasRun.current) {
      return;
    }

    hasRun.current = true;

    const createVaultWithKeys = async () => {
      setIsCreating(true);

      try {
        console.log("=== Vault Creation ===");
        console.log("Vault Name:", vaultName);

        // 1. Derive password key from password
        console.log("\n--- Step 1: Derive Password Key ---");
        const passwordKey = derivePasswordKey(password);
        console.log("Password Key:", passwordKey.buf.toHex());

        // 2. Derive encryption key from password key
        console.log("\n--- Step 2: Derive Encryption Key ---");
        const encryptionKey = deriveEncryptionKey(passwordKey);
        console.log("Encryption Key:", encryptionKey.buf.toHex());

        // 3. Derive login key from password key
        console.log("\n--- Step 3: Derive Login Key ---");
        const loginKey = deriveLoginKey(passwordKey);
        console.log("Login Key:", loginKey.buf.toHex());

        // 4. Generate random vault master key (immutable)
        console.log("\n--- Step 4: Generate Vault Master Key ---");
        const vaultKey = generateKey();
        console.log("Vault Key (master):", vaultKey.buf.toHex());

        // 5. Encrypt vault key with encryption key
        console.log("\n--- Step 5: Encrypt Vault Key ---");
        const encryptedVaultKey = encryptKey(vaultKey, encryptionKey);
        console.log("Encrypted Vault Key:", encryptedVaultKey.toHex());

        // 6. Derive PIN key from PIN
        console.log("\n--- Step 6: Derive PIN Key ---");
        const pinKey = derivePasswordKey(pin);
        console.log("PIN Key:", pinKey.buf.toHex());

        // 7. Encrypt password key with PIN key
        console.log("\n--- Step 7: Encrypt Password Key with PIN ---");
        const encryptedPasswordKey = encryptKey(passwordKey, pinKey);
        console.log("Encrypted Password Key:", encryptedPasswordKey.toHex());

        // Calculate and log entropy
        const pwdEntropy = calculatePasswordEntropy(password.length, {
          lowercase: /[a-z]/.test(password),
          uppercase: /[A-Z]/.test(password),
          numbers: /[0-9]/.test(password),
          symbols: /[^a-zA-Z0-9]/.test(password),
        });

        const pinEnt = calculatePasswordEntropy(pin.length, {
          lowercase: /[a-z]/.test(pin),
          uppercase: /[A-Z]/.test(pin),
          numbers: /[0-9]/.test(pin),
          symbols: /[^a-zA-Z0-9]/.test(pin),
        });

        console.log("\n--- Entropy Analysis ---");
        console.log("Password Entropy:", pwdEntropy.toFixed(1), "bits");
        console.log("PIN Entropy:", pinEnt.toFixed(1), "bits");

        setPasswordEntropy(pwdEntropy);
        setPinEntropy(pinEnt);

        // Save only name and ID to database
        console.log("\n--- Step 8: Save to Database ---");
        const vault = await createVault(vaultName);
        console.log("Vault saved to database with ID:", vault.id);

        console.log("\n=== Vault Creation Complete ===\n");
      } catch (error) {
        console.error("Error creating vault:", error);
      } finally {
        setIsCreating(false);
      }
    };

    createVaultWithKeys();
  }, [vaultName, password, pin]);

  if (!vaultName || !password || !pin) {
    return null;
  }

  const handleContinue = () => {
    navigate("/");
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="border-border bg-card rounded-lg border p-8">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="bg-primary/10 mb-4 rounded-full p-4">
                <CheckCircle className="text-primary h-12 w-12" />
              </div>
              <h1 className="text-2xl font-bold">Vault Created Successfully</h1>
            </div>

            {isCreating ? (
              <div className="text-muted-foreground mb-6 text-center">
                <p>Generating keys...</p>
              </div>
            ) : (
              <>
                <div className="mb-6 space-y-3">
                  <div className="border-border rounded-lg border p-4">
                    <h3 className="mb-2 font-semibold">Vault Details</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Name:</span>
                        <span className="font-mono">{vaultName}@localhost</span>
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
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          PIN Strength:
                        </span>
                        <span
                          className={cn(
                            "font-medium",
                            pinEntropy >= 30 && "text-green-500",
                            pinEntropy >= 20 &&
                              pinEntropy < 30 &&
                              "text-yellow-500",
                            pinEntropy < 20 && "text-destructive",
                          )}
                        >
                          {pinEntropy.toFixed(1)} bits
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-border bg-muted/50 rounded-lg border p-4">
                    <p className="text-muted-foreground text-xs">
                      Check your browser console to see all the generated keys
                      and encryption details.
                    </p>
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
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [
    { title: "Vault Created | KeyPears" },
    { name: "description", content: "Your vault has been created successfully" },
  ];
};
