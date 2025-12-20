import type { Route } from "./+types/vault.$vaultId.messages.$channelId";
import { useState, useEffect, useRef } from "react";
import { Link, href, useRevalidator } from "react-router";
import { ArrowLeft, MessageSquare, MoreVertical, Check, Shield } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~app/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~app/components/ui/alert-dialog";
import { useUnreadCount } from "~app/contexts/sync-context";
import { createClientFromDomain } from "@keypears/api-server/client";
import {
  getUnlockedVault,
  getSessionToken,
  getVaultKey,
} from "~app/lib/vault-store";
import { decryptSecretUpdateBlob } from "~app/lib/secret-encryption";
import { ComposeBox } from "~app/components/compose-box";
import { getSecretUpdatesBySecretId } from "~app/db/models/password";

// Difficulty presets (same as vault settings)
const DIFFICULTY_PRESETS = [
  { label: "Default", value: null, description: "Use vault setting" },
  { label: "Easy", value: 4_000_000, description: "~4 seconds" },
  { label: "Medium", value: 40_000_000, description: "~40 seconds" },
  { label: "Hard", value: 400_000_000, description: "~6 minutes" },
] as const;

// Minimum difficulty users can set
const MIN_USER_DIFFICULTY = 256;

/**
 * Display message type for rendering
 */
interface DisplayMessage {
  id: string;
  direction: "sent" | "received";
  text: string;
  timestamp: Date;
  decryptionError: string | null;
}

function MessageBubble({
  message,
}: {
  message: DisplayMessage;
}) {
  const isFromMe = message.direction === "sent";

  return (
    <div className={`flex ${isFromMe ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg p-3 ${
          isFromMe
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        {message.decryptionError ? (
          <p className="text-sm italic opacity-70">
            Failed to decrypt: {message.decryptionError}
          </p>
        ) : (
          <p className="text-sm whitespace-pre-wrap">
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Load messages from local vault
 */
async function loadVaultMessages(
  vaultId: string,
  secretId: string,
): Promise<DisplayMessage[]> {
  const vaultKey = getVaultKey(vaultId);
  const updates = await getSecretUpdatesBySecretId(vaultId, secretId);

  const messages: DisplayMessage[] = [];

  for (const update of updates) {
    try {
      const blobData = decryptSecretUpdateBlob(update.encryptedBlob, vaultKey);

      if (blobData.type !== "message" || !blobData.messageData) {
        continue;
      }

      const msgData = blobData.messageData;
      messages.push({
        id: update.id,
        direction: msgData.direction,
        text: msgData.content.text,
        timestamp: new Date(msgData.timestamp),
        decryptionError: null,
      });
    } catch (err) {
      console.error("Failed to decrypt vault message:", err);
      messages.push({
        id: update.id,
        direction: "received", // Assume received for errors
        text: "",
        timestamp: new Date(update.createdAt),
        decryptionError: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Sort by timestamp descending (newest first for reverse chronological display)
  return messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const { vaultId, channelId } = params;

  const vault = getUnlockedVault(vaultId);
  if (!vault) {
    throw new Response("Vault not unlocked", { status: 401 });
  }

  const sessionToken = getSessionToken(vaultId);
  if (!sessionToken) {
    throw new Response("No session", { status: 401 });
  }

  const client = await createClientFromDomain(vault.vaultDomain, {
    sessionToken,
  });

  const ownerAddress = `${vault.vaultName}@${vault.vaultDomain}`;

  // Fetch channel info
  const channelsResponse = await client.api.getChannels({
    vaultId,
    ownerAddress,
    limit: 100, // Get more to find our channel
  });

  // Find the channel in the list
  const channel = channelsResponse.channels.find((c) => c.id === channelId);

  if (!channel) {
    throw new Response("Channel not found", { status: 404 });
  }

  // Always load messages from local vault (sync service keeps it updated)
  const messages = await loadVaultMessages(vaultId!, channel.secretId);

  return {
    vaultId: vaultId!,
    channelId: channelId!,
    vaultDomain: vault.vaultDomain,
    ownerAddress,
    channel,
    messages,
  };
}

export default function ChannelDetail({ loaderData }: Route.ComponentProps) {
  const {
    vaultId,
    vaultDomain,
    ownerAddress,
    channel,
    messages: initialMessages,
  } = loaderData;

  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages);
  const [channelMinDifficulty, setChannelMinDifficulty] = useState<number | null>(
    channel.minDifficulty
  );
  const [isUpdatingDifficulty, setIsUpdatingDifficulty] = useState(false);
  const [difficultyError, setDifficultyError] = useState<string | null>(null);
  const revalidator = useRevalidator();

  // Custom difficulty dialog state
  const [isCustomDialogOpen, setIsCustomDialogOpen] = useState(false);
  const [customDifficultyInput, setCustomDifficultyInput] = useState("");
  const [customDifficultyError, setCustomDifficultyError] = useState<string | null>(null);

  // Sync state with loader data when it changes (e.g., after revalidation)
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    setChannelMinDifficulty(channel.minDifficulty);
  }, [channel.minDifficulty]);

  // Auto-refresh when new messages arrive via background sync
  const globalUnreadCount = useUnreadCount(vaultId);
  const prevUnreadCount = useRef(globalUnreadCount);

  useEffect(() => {
    if (globalUnreadCount > prevUnreadCount.current) {
      revalidator.revalidate();
    }
    prevUnreadCount.current = globalUnreadCount;
  }, [globalUnreadCount, revalidator]);

  const handleMessageSent = (): void => {
    revalidator.revalidate();
  };

  // Check if current value matches a preset (by value)
  const isPresetSelected = (presetValue: number | null): boolean => {
    return channelMinDifficulty === presetValue;
  };

  // Check if current value is custom (not matching any preset)
  const isCustomValue = (): boolean => {
    if (channelMinDifficulty === null) return false;
    return !DIFFICULTY_PRESETS.some((p) => p.value === channelMinDifficulty);
  };

  const handleDifficultyChange = async (value: number | null) => {
    setIsUpdatingDifficulty(true);
    setDifficultyError(null);

    try {
      const sessionToken = getSessionToken(vaultId);
      if (!sessionToken) {
        throw new Error("No session token available");
      }

      const client = await createClientFromDomain(vaultDomain, {
        sessionToken,
      });

      const response = await client.api.updateChannelMinDifficulty({
        channelId: channel.id,
        minDifficulty: value,
      });

      setChannelMinDifficulty(response.minDifficulty);
    } catch (err) {
      console.error("Error updating channel difficulty:", err);
      setDifficultyError(err instanceof Error ? err.message : "Failed to update difficulty");
    } finally {
      setIsUpdatingDifficulty(false);
    }
  };

  const handleCustomDialogOpen = () => {
    setCustomDifficultyInput(channelMinDifficulty?.toString() ?? "");
    setCustomDifficultyError(null);
    setIsCustomDialogOpen(true);
  };

  const handleCustomDifficultySubmit = async () => {
    // Validate input
    const trimmed = customDifficultyInput.trim();
    if (!trimmed) {
      setCustomDifficultyError("Please enter a difficulty value");
      return;
    }

    const parsed = parseInt(trimmed, 10);
    if (isNaN(parsed) || parsed < MIN_USER_DIFFICULTY) {
      setCustomDifficultyError(`Minimum difficulty is ${MIN_USER_DIFFICULTY}`);
      return;
    }

    setIsCustomDialogOpen(false);
    await handleDifficultyChange(parsed);
  };

  // Format number with commas for display
  const formatNumber = (num: number): string => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const counterpartyAddress = channel.counterpartyAddress;

  return (
    <>
      <Navbar vaultId={vaultId} />
      <div className="mx-auto flex max-w-2xl flex-col px-4 py-4">
        {/* Header with back button and channel info */}
        <div className="mb-4 flex items-center gap-3">
          <Link
            to={href("/vault/:vaultId/messages", { vaultId })}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="bg-primary/10 flex-shrink-0 rounded-full p-2">
              <MessageSquare className="text-primary h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-semibold">{counterpartyAddress}</h1>
              <p className="text-muted-foreground text-sm">
                {messages.length} messages
              </p>
            </div>
          </div>

          {/* Difficulty dropdown menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={isUpdatingDifficulty}>
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Spam Protection
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {DIFFICULTY_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.label}
                  onClick={() => handleDifficultyChange(preset.value)}
                  className="flex items-center justify-between"
                >
                  <span>
                    {preset.label}
                    <span className="text-muted-foreground ml-2 text-xs">
                      {preset.description}
                    </span>
                  </span>
                  {isPresetSelected(preset.value) && (
                    <Check className="h-4 w-4" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleCustomDialogOpen}
                className="flex items-center justify-between"
              >
                <span>
                  Custom
                  {isCustomValue() && channelMinDifficulty && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {formatNumber(channelMinDifficulty)}
                    </span>
                  )}
                </span>
                {isCustomValue() && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Difficulty error message */}
        {difficultyError && (
          <div className="border-destructive/50 bg-destructive/10 mb-4 rounded-lg border p-3">
            <p className="text-destructive text-sm">{difficultyError}</p>
          </div>
        )}

        {/* Compose box - at top before messages */}
        <ComposeBox
          vaultId={vaultId}
          vaultDomain={vaultDomain}
          ownerAddress={ownerAddress}
          counterpartyAddress={counterpartyAddress}
          onMessageSent={handleMessageSent}
        />

        {/* Message list */}
        <div className="mt-4 flex-1 space-y-3">
          {messages.length === 0 ? (
            <div className="border-border bg-card rounded-lg border p-8 text-center">
              <p className="text-muted-foreground">No messages yet</p>
            </div>
          ) : (
            /* Messages in reverse chronological order (newest first at top) */
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
              />
            ))
          )}
        </div>
      </div>

      {/* Custom difficulty dialog */}
      <AlertDialog open={isCustomDialogOpen} onOpenChange={setIsCustomDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set Custom Difficulty</AlertDialogTitle>
            <AlertDialogDescription>
              Set a custom difficulty for this sender. Higher values require more
              computation. Minimum: {MIN_USER_DIFFICULTY}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              type="text"
              value={customDifficultyInput}
              onChange={(e) => {
                setCustomDifficultyInput(e.target.value.replace(/[^0-9]/g, ""));
                setCustomDifficultyError(null);
              }}
              placeholder="e.g., 10000000"
              className="font-mono"
            />
            {customDifficultyError && (
              <p className="text-destructive mt-2 text-sm">{customDifficultyError}</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCustomDifficultySubmit}>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
