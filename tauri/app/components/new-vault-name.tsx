import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";

export function NewVaultName() {
  const navigate = useNavigate();
  const [name, setName] = useState("passwords");
  const [error, setError] = useState("");

  const validateName = (value: string): boolean => {
    // Must start with a letter
    if (!/^[a-z]/.test(value)) {
      setError("Name must start with a letter");
      return false;
    }

    // Only lowercase letters and numbers
    if (!/^[a-z][a-z0-9]*$/.test(value)) {
      setError("Only lowercase letters and numbers allowed");
      return false;
    }

    setError("");
    return true;
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (value) {
      validateName(value);
    } else {
      setError("");
    }
  };

  const handleNext = () => {
    if (validateName(name)) {
      // Navigate to step 2 (password selection)
      navigate("/new-vault/2");
    }
  };

  const isValid = name.length > 0 && !error;

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create New Vault</h1>
        <p className="mt-2 text-sm text-muted-foreground">Step 1 of 3</p>
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
            placeholder="passwords"
            className={error ? "border-red-500" : ""}
          />
          <p className="text-xs text-muted-foreground">
            Your vault: <span className="font-mono">{name}@localhost</span>
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="mt-4 space-y-1 text-xs text-muted-foreground">
          <p>• Lowercase letters and numbers only</p>
          <p>• Must start with a letter</p>
          <p>• Name must be unique</p>
        </div>
      </div>

      <div className="space-y-3">
        <Button
          className="w-full"
          size="lg"
          onClick={handleNext}
          disabled={!isValid}
        >
          Next
        </Button>
        <div className="text-center">
          <Link
            to="/"
            className="text-sm text-muted-foreground transition-opacity hover:opacity-80"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
