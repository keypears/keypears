import { useState, useRef, useEffect } from "react";
import { AtSign, ChevronDown, Check, X, Loader2 } from "lucide-react";
import { Input } from "~app/components/ui/input";
import { Button } from "~app/components/ui/button";
import { getOfficialDomains } from "@keypears/lib";
import { cn } from "~app/lib/utils";

interface VaultAddressInputProps {
  name: string;
  domain: string;
  onNameChange: (name: string) => void;
  onDomainChange: (domain: string) => void;
  onNameBlur?: () => void;
  onDomainBlur?: () => void;
  nameError?: string;
  domainError?: string;
  isCheckingAvailability?: boolean;
  nameAvailable?: boolean | null;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function VaultAddressInput({
  name,
  domain,
  onNameChange,
  onDomainChange,
  onNameBlur,
  onDomainBlur,
  nameError,
  domainError,
  isCheckingAvailability,
  nameAvailable,
  disabled,
  autoFocus,
}: VaultAddressInputProps) {
  const [isDomainDropdownOpen, setIsDomainDropdownOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const domainInputRef = useRef<HTMLInputElement>(null);
  const domainContainerRef = useRef<HTMLDivElement>(null);

  const officialDomains = getOfficialDomains();

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        domainContainerRef.current &&
        !domainContainerRef.current.contains(event.target as Node)
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

  // Parse email address and split into name/domain
  const parseEmailAddress = (
    value: string,
  ): { name: string; domain: string } | null => {
    const atIndex = value.indexOf("@");
    if (atIndex === -1) return null;

    const namePart = value.substring(0, atIndex);
    const domainPart = value.substring(atIndex + 1);

    return { name: namePart, domain: domainPart };
  };

  // Handle name input change
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Check if value contains @
    const parsed = parseEmailAddress(value);
    if (parsed) {
      // Split the email: name goes to name field, domain goes to domain field
      onNameChange(parsed.name);
      if (parsed.domain) {
        onDomainChange(parsed.domain);
      }
      // Focus domain input
      domainInputRef.current?.focus();
    } else {
      onNameChange(value);
    }
  };

  // Handle name input keydown
  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "@") {
      e.preventDefault();
      // Jump to domain input
      domainInputRef.current?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      nameInputRef.current?.blur();
    }
  };

  // Handle domain input change
  const handleDomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Check if pasted value contains @ (full email pasted into domain field)
    const parsed = parseEmailAddress(value);
    if (parsed) {
      onNameChange(parsed.name);
      onDomainChange(parsed.domain);
    } else {
      onDomainChange(value);
    }
  };

  // Handle domain input keydown
  const handleDomainKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      domainInputRef.current?.blur();
      setIsDomainDropdownOpen(false);
    }
  };

  // Handle selecting a domain from dropdown
  const handleSelectDomain = (selectedDomain: string) => {
    onDomainChange(selectedDomain);
    setIsDomainDropdownOpen(false);
    // Trigger blur callback after selection
    onDomainBlur?.();
  };

  // Handle name focus - show dropdown is not needed for name
  const handleNameFocus = () => {
    // Selection handled by mouseUp
  };

  // Handle name mouseUp - select all
  const handleNameMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    e.currentTarget.select();
  };

  // Handle domain focus - show dropdown
  const handleDomainFocus = () => {
    setIsDomainDropdownOpen(true);
  };

  // Handle domain mouseUp - select all
  const handleDomainMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    e.currentTarget.select();
  };

  // Handle domain blur
  const handleDomainBlur = () => {
    // Small delay to allow dropdown click to register
    setTimeout(() => {
      onDomainBlur?.();
    }, 150);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Vault Address</label>

      <div className="flex">
        {/* Name Input */}
        <div className="relative flex-1">
          <Input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={handleNameChange}
            onKeyDown={handleNameKeyDown}
            onFocus={handleNameFocus}
            onMouseUp={handleNameMouseUp}
            onBlur={onNameBlur}
            placeholder="alice"
            disabled={disabled}
            autoFocus={autoFocus}
            className={cn(
              "rounded-r-none border-r-0 pr-8",
              nameError && "border-destructive",
            )}
          />
          <div className="absolute top-1/2 right-2 -translate-y-1/2">
            {isCheckingAvailability && (
              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
            )}
            {!isCheckingAvailability && nameAvailable === true && (
              <Check className="h-4 w-4 text-green-500" />
            )}
            {!isCheckingAvailability && nameAvailable === false && (
              <X className="text-destructive h-4 w-4" />
            )}
          </div>
        </div>

        {/* Domain Input with @ prefix */}
        <div className="relative flex-1" ref={domainContainerRef}>
          <div className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2">
            <AtSign className="text-muted-foreground h-4 w-4" />
          </div>
          <Input
            ref={domainInputRef}
            type="text"
            value={domain}
            onChange={handleDomainChange}
            onKeyDown={handleDomainKeyDown}
            onFocus={handleDomainFocus}
            onMouseUp={handleDomainMouseUp}
            onBlur={handleDomainBlur}
            placeholder="keypears.com"
            disabled={disabled}
            className={cn(
              "rounded-l-none pr-8 pl-7",
              domainError && "border-destructive",
            )}
          />
          <div className="absolute top-1/2 right-1 -translate-y-1/2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              tabIndex={-1}
              onClick={() => setIsDomainDropdownOpen(!isDomainDropdownOpen)}
              aria-label="Show domain suggestions"
              disabled={disabled}
            >
              <ChevronDown size={18} />
            </Button>
          </div>

          {/* Domain Dropdown */}
          {isDomainDropdownOpen && (
            <div className="bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1 w-full rounded-md border shadow-md">
              <div className="p-1">
                {officialDomains.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleSelectDomain(d)}
                    className="focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground relative flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none"
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      <p className="text-muted-foreground text-xs">
        Your vault:{" "}
        <span className="font-mono">
          {name || "___"}@{domain || "___"}
        </span>
      </p>

      {/* Error messages */}
      {nameError && <p className="text-destructive text-xs">{nameError}</p>}
      {domainError && <p className="text-destructive text-xs">{domainError}</p>}
      {!nameError && !domainError && nameAvailable === false && (
        <p className="text-destructive text-xs">
          This name is already taken for {domain}
        </p>
      )}
      {!nameError && !domainError && nameAvailable === true && (
        <p className="text-xs text-green-500">This name is available!</p>
      )}
    </div>
  );
}
