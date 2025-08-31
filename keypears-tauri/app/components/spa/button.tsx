import { Compubutton } from "@compubutton/compubutton";
import { $path } from "safe-routes";

type ButtonMode = "standard" | "compucha" | "secret";

export function Button({
  initialText = "Swipe",
  computingText = "Computing",
  successText = "Computed!",
  errorText = "Error!",
  onComputing = async () => {},
  onSuccess = async () => {},
  onError = async () => {},
  onFinishedSuccess = async () => {},
  onFinishedError = async () => {},
  mode: buttonMode = "standard",
  delayComputedMs = 0,
  disabled = false,
  user = null,
  className = "",
}: {
  initialText?: string;
  computingText?: string;
  successText?: string;
  errorText?: string;
  onComputing?: () => Promise<void>;
  onSuccess?: () => Promise<void>;
  onError?: (err: Error) => Promise<void>;
  onFinishedSuccess?: () => Promise<void>;
  onFinishedError?: () => Promise<void>;
  mode?: ButtonMode;
  delayComputedMs?: number;
  disabled?: boolean;
  user: { id: number; avatarId: string | null } | null;
  className?: string;
}) {
  let userAvatarUrl: string | null = null;
  if (user?.avatarId) {
    // userAvatarUrl = "/avatar/:userId/:userAvatarId/:size", {
    //   userId: user.id,
    //   userAvatarId: user.avatarId,
    //   size: "300.jpg",
    // };
    userAvatarUrl = `/avatar/${user.id}/${user.avatarId}/300.jpg`;
  }
  return (
    <Compubutton
      initialText={initialText}
      computingText={computingText}
      successText={successText}
      errorText={errorText}
      onComputing={onComputing}
      onSuccess={onSuccess}
      onError={onError}
      onFinishedSuccess={onFinishedSuccess}
      onFinishedError={onFinishedError}
      mode={buttonMode}
      delayComputedMs={delayComputedMs}
      disabled={disabled}
      userAvatarUrl={user ? userAvatarUrl : null}
      className={className}
    />
  );
}
