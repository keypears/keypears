import type { JSX } from "react";
import { AlertCircle } from "lucide-react";
import { useServerStatus } from "~app/contexts/ServerStatusContext";

/**
 * ServerStatusBanner displays a warning when the server is offline.
 * Only shows a red banner when there's an actual connection error.
 * Returns null for online and validating states to avoid UI flashes.
 */
export function ServerStatusBanner(): JSX.Element | null {
  const { status } = useServerStatus();

  // Only show banner when offline (after validation completed with error)
  if (!status.isOnline && !status.isValidating) {
    return (
      <div className="bg-red dark:bg-red/20 border-red-dark dark:border-red flex items-center justify-center gap-2 border-b px-4 py-2 text-sm">
        <AlertCircle className="text-text dark:text-text h-4 w-4" />
        <span className="text-text dark:text-text">
          Server offline: {status.error || "Unable to connect"}
        </span>
      </div>
    );
  }

  return null;
}
