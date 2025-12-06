import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate, href } from "react-router";
import { Check, X, Loader2, ChevronDown } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { vaultNameSchema, getOfficialDomains } from "@keypears/lib";
import { ZodError } from "zod";
import { createClientFromDomain } from "@keypears/api-server/client";

export default function NewVaultStep2() {
  const location = useLocation();
  const navigate = useNavigate();
  const { password } = (location.state as { password?: string }) || {};

  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [isDomainDropdownOpen, setIsDomainDropdownOpen] = useState(false);
  const domainDropdownRef = useRef<HTMLDivElement>(null);

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

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        domainDropdownRef.current &&
        !domainDropdownRef.current.contains(event.target as Node)
      ) {
        setIsDomainDropdownOpen(false);
      }
    };

    if (isDomainDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isDomainDropdownOpen]);

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
      // Call API endpoint to check availability
      const client = await createClientFromDomain(domain);
      const result = await client.api.checkNameAvailability({ name, domain });
      setNameAvailable(result.available);
    } catch (error) {
      console.error("Error checking name availability:", error);

      // Extract error message for display
      const errorMessage = error instanceof Error
        ? error.message
        : "Unable to check availability";

      // Check if it's a server validation error
      if (errorMessage.includes("Invalid KeyPears server")) {
        setNameError(errorMessage.replace("Invalid KeyPears server: ", ""));
      } else {
        setNameError(errorMessage);
      }

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

  // Handle selecting a domain from dropdown
  const handleSelectDomain = (selectedDomain: string) => {
    setDomain(selectedDomain);
    setNameAvailable(null);
    setIsDomainDropdownOpen(false);
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
                {/* Domain Selector - Editable with dropdown suggestions */}
                <div className="space-y-2">
                  <label htmlFor="domain" className="text-sm font-medium">
                    Domain
                  </label>
                  <div className="relative" ref={domainDropdownRef}>
                    <Input
                      id="domain"
                      type="text"
                      value={domain}
                      onChange={(e) => handleDomainChange(e.target.value)}
                      onFocus={() => setIsDomainDropdownOpen(true)}
                      placeholder="keypears.com"
                      className="pr-10"
                    />
                    <div className="absolute top-1/2 right-2 -translate-y-1/2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        tabIndex={-1}
                        onClick={() => setIsDomainDropdownOpen(!isDomainDropdownOpen)}
                        aria-label="Show domain suggestions"
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
                  <p className="text-muted-foreground text-xs">
                    Select a domain or enter a custom one
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
