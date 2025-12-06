import { useState } from "react";
import { Link, useNavigate, href } from "react-router";
import { Eye, EyeOff, ChevronDown, CheckCircle, AlertCircle } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import {
  derivePasswordKey,
  deriveEncryptionKey,
  deriveLoginKey,
  decryptKey,
  getOfficialDomains,
  publicKeyCreate,
  WebBuf,
} from "@keypears/lib";
import { createVault, getVaultByNameAndDomain } from "~app/db/models/vault";
import { initDb } from "~app/db";
import { createClientFromDomain } from "@keypears/api-server/client";
import { useServerStatus } from "~app/contexts/ServerStatusContext";
import { generateDeviceId, detectDeviceDescription } from "~app/lib/device";
import { unlockVault, setSession } from "~app/lib/vault-store";
import { refreshSyncState } from "~app/contexts/sync-context";
import { startBackgroundSync } from "~app/lib/sync-service";

export default function ImportVault() {
  const navigate = useNavigate();
  useServerStatus(); // Ensure server status is checked

  const [domain, setDomain] = useState(getOfficialDomains()[0] || "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isDomainDropdownOpen, setIsDomainDropdownOpen] = useState(false);

  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const officialDomains = getOfficialDomains();
  const isFormValid = domain.length > 0 && name.length > 0 && password.length >= 8;

  const handleSelectDomain = (selectedDomain: string) => {
    setDomain(selectedDomain);
    setIsDomainDropdownOpen(false);
  };

  const handleImport = async () => {
    if (!isFormValid) return;

    setIsImporting(true);
    setError("");

    try {
      // Initialize database
      await initDb();

      // 1. Call server to get vault info first (to get vaultId)
      const tempClient = await createClientFromDomain(domain);
      const vaultInfo = await tempClient.api.getVaultInfoPublic({ name, domain });
      const vaultId = vaultInfo.vaultId;

      // 2. Check if vault already exists locally
      const existingVault = await getVaultByNameAndDomain(name, domain);
      if (existingVault) {
        throw new Error("Vault already exists locally. If you want to re-import, please delete it first.");
      }

      // 3. Derive password key from password with vaultId
      const passwordKey = derivePasswordKey(password, vaultId);

      // 4. Derive login key for server authentication
      const loginKey = deriveLoginKey(passwordKey);

      // 5. Generate device ID and description
      const deviceId = generateDeviceId();
      const deviceDescription = await detectDeviceDescription();

      // 6. Login to get session token
      const apiClient = await createClientFromDomain(domain);
      const loginResponse = await apiClient.api.login({
        vaultId,
        loginKey: loginKey.buf.toHex(),
        deviceId,
        clientDeviceDescription: deviceDescription,
      });

      // 7. Verify vault info with session auth
      const authedClient = await createClientFromDomain(domain, { sessionToken: loginResponse.sessionToken });
      await authedClient.api.getVaultInfo({ name, domain });

      // 8. Derive encryption key from password key
      const encryptionKey = deriveEncryptionKey(passwordKey);

      // 9. Decrypt vault key using encryption key
      const encryptedVaultKeyBuf = WebBuf.fromHex(vaultInfo.encryptedVaultKey);
      const vaultKey = decryptKey(encryptedVaultKeyBuf, encryptionKey);

      // 10. Derive vault public key from private key
      const vaultPublicKey = publicKeyCreate(vaultKey);

      // 11. Save vault to local database with device info
      const vault = await createVault(
        vaultInfo.vaultId,
        vaultInfo.name,
        vaultInfo.domain,
        vaultInfo.encryptedVaultKey,
        vaultInfo.vaultPubKeyHash,
        deviceId,
        deviceDescription,
      );

      // 12. Store session in vault store (now requires vaultId)
      setSession(vault.id, loginResponse.sessionToken, loginResponse.expiresAt);

      // 13. Unlock vault in vault store
      unlockVault({
        vaultId: vault.id,
        vaultName: vault.name,
        vaultDomain: vault.domain,
        passwordKey,
        encryptionKey,
        loginKey,
        vaultKey,
        vaultPublicKey,
        encryptedVaultKey: vault.encryptedVaultKey,
        vaultPubKeyHash: vault.vaultPubKeyHash,
        deviceId,
        deviceDescription,
      });

      // 14. Refresh sync state for this vault
      await refreshSyncState(vault.id);

      // 15. Start background sync for this vault
      startBackgroundSync(
        vault.id,
        vault.domain,
        vaultKey,
        () => refreshSyncState(vault.id), // onSyncComplete callback
      );

      setSuccess(true);

      // Navigate to vault after successful import
      setTimeout(() => {
        navigate(href("/vault/:vaultId/secrets", { vaultId: vault.id }));
      }, 1500);
    } catch (err) {
      console.error("Error importing vault:", err);

      let errorMessage = "Failed to import vault";
      if (err instanceof Error) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col items-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="border-border bg-card rounded-lg border p-8">
            {success ? (
              /* Success State */
              <>
                <div className="mb-6 flex flex-col items-center text-center">
                  <div className="bg-primary/10 mb-4 rounded-full p-4">
                    <CheckCircle className="text-primary h-12 w-12" />
                  </div>
                  <h1 className="text-2xl font-bold">Vault Imported Successfully</h1>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Your vault has been imported and sync has started
                  </p>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => navigate(href("/"))}
                >
                  OK
                </Button>
              </>
            ) : error ? (
              /* Error State */
              <>
                <div className="mb-6 flex flex-col items-center text-center">
                  <div className="bg-destructive/10 mb-4 rounded-full p-4">
                    <AlertCircle className="text-destructive h-12 w-12" />
                  </div>
                  <h1 className="text-2xl font-bold">Import Failed</h1>
                </div>

                <div className="border-destructive/50 bg-destructive/10 mb-6 rounded-lg border p-4">
                  <p className="text-destructive text-sm">{error}</p>
                </div>

                <div className="space-y-3">
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => {
                      setError("");
                      setSuccess(false);
                    }}
                  >
                    Try Again
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
              /* Import Form */
              <>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold">Import Vault</h1>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Import an existing vault using your credentials
                  </p>
                </div>

                <div className="mb-6 space-y-4">
                  {/* Domain Selector */}
                  <div className="space-y-2">
                    <label htmlFor="domain" className="text-sm font-medium">
                      Domain
                    </label>
                    <div className="relative">
                      <Input
                        id="domain"
                        type="text"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        onFocus={() => setIsDomainDropdownOpen(true)}
                        placeholder="keypears.com"
                        className="pr-10"
                        disabled={isImporting}
                      />
                      <div className="absolute top-1/2 right-2 -translate-y-1/2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          tabIndex={-1}
                          onClick={() =>
                            setIsDomainDropdownOpen(!isDomainDropdownOpen)
                          }
                          aria-label="Show domain suggestions"
                          disabled={isImporting}
                        >
                          <ChevronDown size={18} />
                        </Button>
                      </div>
                      {isDomainDropdownOpen && (
                        <div className="bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1 w-full rounded-md border shadow-md">
                          <div className="p-1">
                            {officialDomains.map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => handleSelectDomain(d)}
                                className="focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Vault Name */}
                  <div className="space-y-2">
                    <label htmlFor="vault-name" className="text-sm font-medium">
                      Vault Name
                    </label>
                    <Input
                      id="vault-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="alice"
                      disabled={isImporting}
                      autoFocus
                    />
                    <p className="text-muted-foreground text-xs">
                      Your vault:{" "}
                      <span className="font-mono">
                        {name || "___"}@{domain}
                      </span>
                    </p>
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium">
                      Password
                    </label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && isFormValid) {
                            handleImport();
                          }
                        }}
                        placeholder="Enter your password"
                        className="pr-10"
                        disabled={isImporting}
                      />
                      <div className="absolute top-1/2 right-2 -translate-y-1/2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          tabIndex={-1}
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          disabled={isImporting}
                        >
                          {showPassword ? (
                            <EyeOff size={18} />
                          ) : (
                            <Eye size={18} />
                          )}
                        </Button>
                      </div>
                    </div>
                    {password.length > 0 && password.length < 8 && (
                      <p className="text-destructive text-xs">
                        Password must be at least 8 characters
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleImport}
                    disabled={!isFormValid || isImporting}
                  >
                    {isImporting ? "Importing..." : "Import Vault"}
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
