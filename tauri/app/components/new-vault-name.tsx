import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { vaultNameSchema } from "@keypears/lib";
import { getVaultByName, getVaults } from "~app/db/models/vault";
import { ZodError } from "zod";

export function NewVaultName() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  // Load default vault name on mount
  useEffect(() => {
    const loadDefaultName = async () => {
      const vaults = await getVaults();
      const vaultNames = new Set(vaults.map((v) => v.name));

      // Try "password", "password2", "password3", etc.
      let defaultName = "password";
      let counter = 2;

      while (vaultNames.has(defaultName)) {
        defaultName = `password${counter}`;
        counter++;
      }

      setName(defaultName);
    };

    loadDefaultName();
  }, []);

  // Validate name format with Zod
  const validateFormat = (value: string): boolean => {
    try {
      vaultNameSchema.parse(value);
      setError(""); // Clear error on success
      return true;
    } catch (err) {
      if (err instanceof ZodError) {
        setError(err.issues[0]?.message || "Invalid name");
      }
      return false;
    }
  };

  // Check if name already exists in database
  const checkNameExists = async (value: string): Promise<boolean> => {
    setIsChecking(true);
    try {
      const existing = await getVaultByName(value);
      if (existing) {
        setError("A vault with this name already exists");
        return true;
      }
      return false;
    } finally {
      setIsChecking(false);
    }
  };

  // Validate name on change with debounce for database check
  useEffect(() => {
    if (!name) {
      setError("");
      return;
    }

    // First validate format
    if (!validateFormat(name)) {
      return;
    }

    // Then check if name exists (debounced)
    const timer = setTimeout(() => {
      checkNameExists(name);
    }, 500);

    return () => clearTimeout(timer);
  }, [name]);

  const handleNameChange = (value: string) => {
    setName(value);
  };

  const handleContinue = async () => {
    // Validate format
    if (!validateFormat(name)) {
      return;
    }

    // Check if name exists
    const exists = await checkNameExists(name);
    if (exists) {
      return;
    }

    // Navigate to next step with vault name in state
    navigate("/new-vault/2", {
      state: { vaultName: name },
    });
  };

  const isValid = name.length > 0 && !error && !isChecking;

  return (
    <div className="border-border bg-card rounded-lg border p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create New Vault</h1>
      </div>

      <div className="mb-6">
        <h2 className="mb-4 text-lg font-semibold">Choose a vault name</h2>

        <div className="space-y-2">
          <label htmlFor="vault-name" className="text-sm font-medium">
            Vault Name
          </label>
          <Input
            id="vault-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isValid) {
                handleContinue();
              }
            }}
            placeholder="passwords"
            className={error ? "border-red-500" : ""}
            autoFocus
          />
          <p className="text-muted-foreground text-xs">
            Your vault:{" "}
            <span className="font-mono">{name || "___"}@localhost</span>
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {isChecking && (
            <p className="text-muted-foreground text-xs">
              Checking availability...
            </p>
          )}
        </div>

        <div className="text-muted-foreground mt-4 space-y-1 text-xs">
          <p>• 3-20 characters</p>
          <p>• Lowercase letters and numbers only</p>
          <p>• Must start with a letter</p>
          <p>• Name must be unique</p>
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
            to="/"
            className="text-muted-foreground text-sm transition-opacity hover:opacity-80"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
