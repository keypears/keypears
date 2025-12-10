import { useState, useEffect } from "react";
import { Link, useNavigate, href } from "react-router";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { VaultAddressInput } from "~app/components/vault-address-input";
import { vaultNameSchema, getOfficialDomains } from "@keypears/lib";
import { ZodError } from "zod";
import { createClientFromDomain } from "@keypears/api-server/client";

export default function NewVaultStep1() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [nameError, setNameError] = useState("");
  const [domainError, setDomainError] = useState("");
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);

  // Set default domain on mount
  useEffect(() => {
    const domains = getOfficialDomains();
    if (domains.length > 0) {
      setDomain(domains[0] || "");
    }
  }, []);

  // Validate name format with Zod
  const validateNameFormat = (value: string): boolean => {
    if (!value) {
      setNameError("");
      return false;
    }
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
    if (!validateNameFormat(name)) {
      setNameAvailable(null);
      return;
    }

    setIsCheckingAvailability(true);
    setNameAvailable(null);
    setDomainError("");

    try {
      // Call API endpoint to check availability
      const client = await createClientFromDomain(domain);
      const result = await client.api.checkNameAvailability({ name, domain });
      setNameAvailable(result.available);
    } catch (error) {
      console.error("Error checking name availability:", error);

      // Extract error message for display
      const errorMessage =
        error instanceof Error ? error.message : "Unable to check availability";

      // Check if it's a server validation error
      if (errorMessage.includes("Invalid KeyPears server")) {
        setDomainError(errorMessage.replace("Invalid KeyPears server: ", ""));
      } else {
        setDomainError(errorMessage);
      }

      setNameAvailable(null);
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  // Handle name change - validate format immediately
  const handleNameChange = (value: string) => {
    setName(value);
    setNameAvailable(null);
    validateNameFormat(value);
  };

  // Handle domain change - just reset availability, don't validate yet
  const handleDomainChange = (value: string) => {
    setDomain(value);
    setNameAvailable(null);
    setDomainError("");
  };

  // Handle name blur - check availability
  const handleNameBlur = () => {
    if (name && domain && !nameError) {
      checkNameAvailability();
    }
  };

  // Handle domain blur - check availability
  const handleDomainBlur = () => {
    if (name && domain && !nameError) {
      checkNameAvailability();
    }
  };

  const handleContinue = () => {
    // Validate format
    if (!validateNameFormat(name)) {
      return;
    }

    // Check if we have a domain
    if (!domain) {
      setDomainError("Please select a domain");
      return;
    }

    // Navigate to step 2
    navigate(href("/new-vault/2"), {
      state: {
        vaultName: name,
        vaultDomain: domain,
      },
    });
  };

  const isValid =
    name.length > 0 && domain.length > 0 && !nameError && !domainError;

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col items-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="border-border bg-card rounded-lg border p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold">Create New Vault</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Step 1 of 3: Choose your vault name
              </p>
            </div>

            <div className="mb-6">
              <h2 className="mb-4 text-lg font-semibold">
                Choose your vault name
              </h2>

              <p className="text-muted-foreground mb-4 text-sm">
                Your vault name is your unique identifier. It works like an
                email address - you can share it with others to receive secrets.
              </p>

              <div className="space-y-4">
                <VaultAddressInput
                  name={name}
                  domain={domain}
                  onNameChange={handleNameChange}
                  onDomainChange={handleDomainChange}
                  onNameBlur={handleNameBlur}
                  onDomainBlur={handleDomainBlur}
                  nameError={nameError}
                  domainError={domainError}
                  isCheckingAvailability={isCheckingAvailability}
                  nameAvailable={nameAvailable}
                  autoFocus
                />

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
                  to={href("/")}
                  className="text-muted-foreground text-sm transition-opacity hover:opacity-80"
                >
                  Cancel
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
