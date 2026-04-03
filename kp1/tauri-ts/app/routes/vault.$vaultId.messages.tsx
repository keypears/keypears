import { Outlet } from "react-router";

// Note: Parent layout (vault.$vaultId.tsx) handles vault unlock validation
// and redirects to unlock page if needed. No need to duplicate that check here.

export default function VaultMessagesLayout() {
  return <Outlet />;
}
