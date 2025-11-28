import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, href } from "react-router";
import { Check, X, Loader2 } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { vaultNameSchema, getOfficialDomains } from "@keypears/lib";
import { ZodError } from "zod";

export default function NewVaultStep2() {
  const location = useLocation();
  const navigate = useNavigate();
  const { password } = (location.state as { password?: string }) || {};

  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);

  // Redirect to step 1 if no password
  useEffect(() => {
    if (!password) {
      navigate(href("/new-vault/1"));
    }
  }, [password, navigate]);

  // Set default domain on mount
  useEffect(() => {
    const domains = getOfficialDomains();
    if (domains.length > 0) {
      setDomain(domains[0] || "");
    }
  }, []);

  if (!password) {
    return null;
  }

  // Validate name format with Zod
  const validateFormat = (value: string): boolean => {
    try {
      vaultNameSchema.parse(value);
      setNameError("");
      return true;
    } catch (err) {
      if (err instanceof ZodError) {
        setNameError(err.issues[0]?.message || "Invalid name");
      }
      return false;
    }
  };

  // Check name availability for selected domain
  const checkNameAvailability = async () => {
    if (!name || !domain) return;

    // First validate format
    if (!validateFormat(name)) {
      setNameAvailable(null);
      return;
    }

    setIsCheckingAvailability(true);
    setNameAvailable(null);

    try {
      // TODO: Call API endpoint to check availability
      // For now, just simulate the check
      // const client = createClient({ url: `http://${domain}:${getDevPort(domain) || 4273}/api` });
      // const result = await client.checkNameAvailability({ name, domain });
      // setNameAvailable(result.available);

      // Temporary: always return available (will be implemented in Phase 5)
      await new Promise((resolve) => setTimeout(resolve, 500));
      setNameAvailable(true);
    } catch (error) {
      console.error("Error checking name availability:", error);
      setNameError("Unable to check availability");
      setNameAvailable(null);
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  // Handle name change
  const handleNameChange = (value: string) => {
    setName(value);
    setNameAvailable(null);
    setNameError("");
  };

  // Handle name blur (trigger availability check)
  const handleNameBlur = () => {
    if (name && domain) {
      checkNameAvailability();
    }
  };

  // Handle domain change (reset availability)
  const handleDomainChange = (value: string) => {
    setDomain(value);
    setNameAvailable(null);
  };

  const handleContinue = () => {
    // Validate format
    if (!validateFormat(name)) {
      return;
    }

    // Check if we have a domain
    if (!domain) {
      setNameError("Please select a domain");
      return;
    }

    // Navigate to step 3
    navigate(href("/new-vault/3"), {
      state: {
        password,
        vaultName: name,
        vaultDomain: domain,
      },
    });
  };

  const isValid = name.length > 0 && domain.length > 0 && !nameError;
  const officialDomains = getOfficialDomains();

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col items-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="border-border bg-card rounded-lg border p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold">Create New Vault</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Step 2 of 3: Choose domain and name
              </p>
            </div>

            <div className="mb-6">
              <h2 className="mb-4 text-lg font-semibold">
                Choose your vault name
              </h2>

              <div className="space-y-4">
                {/* Domain Selector */}
                <div className="space-y-2">
                  <label htmlFor="domain" className="text-sm font-medium">
                    Domain
                  </label>
                  <select
                    id="domain"
                    value={domain}
                    onChange={(e) => handleDomainChange(e.target.value)}
                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {officialDomains.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <p className="text-muted-foreground text-xs">
                    Select the domain for your vault
                  </p>
                </div>

                {/* Name Input */}
                <div className="space-y-2">
                  <label htmlFor="vault-name" className="text-sm font-medium">
                    Vault Name
                  </label>
                  <div className="relative">
                    <Input
                      id="vault-name"
                      type="text"
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      onBlur={handleNameBlur}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && isValid) {
                          handleContinue();
                        } else if (e.key === "Tab") {
                          // Blur will trigger availability check
                        }
                      }}
                      placeholder="alice"
                      className={nameError ? "border-destructive pr-10" : "pr-10"}
                      autoFocus
                    />
                    <div className="absolute top-1/2 right-2 -translate-y-1/2">
                      {isCheckingAvailability && (
                        <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                      )}
                      {!isCheckingAvailability && nameAvailable === true && (
                        <Check className="h-4 w-4 text-green-500" />
                      )}
                      {!isCheckingAvailability && nameAvailable === false && (
                        <X className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Your vault:{" "}
                    <span className="font-mono">
                      {name || "___"}@{domain}
                    </span>
                  </p>
                  {nameError && (
                    <p className="text-destructive text-xs">{nameError}</p>
                  )}
                  {!nameError && nameAvailable === false && (
                    <p className="text-destructive text-xs">
                      This name is already taken for {domain}
                    </p>
                  )}
                  {!nameError && nameAvailable === true && (
                    <p className="text-xs text-green-500">
                      This name is available!
                    </p>
                  )}
                </div>

                <div className="text-muted-foreground space-y-1 text-xs">
                  <p>• 1-30 characters</p>
                  <p>• Lowercase letters and numbers only</p>
                  <p>• Must start with a letter</p>
                  <p>• Name must be unique per domain</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                className="w-full"
                size="lg"
                onClick={handleContinue}
                disabled={!isValid}
              >
                Continue
              </Button>
              <div className="text-center">
                <Link
                  to="/new-vault/1"
                  className="text-muted-foreground text-sm transition-opacity hover:opacity-80"
                >
                  Back
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
