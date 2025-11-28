import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { useServerStatus } from "~/contexts/ServerStatusContext";

/**
 * ServerStatusBanner displays the current server connectivity status
 * at the top of the app. Shows:
 * - Green banner when online
 * - Red banner when offline with error message
 * - Yellow banner when validating
 */
export function ServerStatusBanner(): JSX.Element | null {
  const { status } = useServerStatus();

  // Don't show banner when online (normal state)
  if (status.isOnline && !status.isValidating) {
    return null;
  }

  // Validating state (yellow)
  if (status.isValidating) {
    return (
      <div className="bg-yellow dark:bg-yellow/20 border-b border-yellow-dark dark:border-yellow flex items-center justify-center gap-2 px-4 py-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-text dark:text-text" />
        <span className="text-text dark:text-text">
          Checking server connection...
        </span>
      </div>
    );
  }

  // Offline state (red)
  if (!status.isOnline) {
    return (
      <div className="bg-red dark:bg-red/20 border-b border-red-dark dark:border-red flex items-center justify-center gap-2 px-4 py-2 text-sm">
        <AlertCircle className="h-4 w-4 text-text dark:text-text" />
        <span className="text-text dark:text-text">
          Server offline: {status.error || "Unable to connect"}
        </span>
      </div>
    );
  }

  // Online state (green - brief flash)
  return (
    <div className="bg-green dark:bg-green/20 border-b border-green-dark dark:border-green flex items-center justify-center gap-2 px-4 py-2 text-sm">
      <CheckCircle className="h-4 w-4 text-text dark:text-text" />
      <span className="text-text dark:text-text">Connected to server</span>
    </div>
  );
}
