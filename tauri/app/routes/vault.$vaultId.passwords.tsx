import { useEffect, useRef } from "react";
import { useParams, useNavigate, Outlet } from "react-router";
import { Navbar } from "~app/components/navbar";
import { useVault } from "~app/contexts/vault-context";

export default function VaultPasswordsLayout() {
  const params = useParams();
  const navigate = useNavigate();
  const { activeVault } = useVault();
  const mountedRef = useRef(true);

  // Redirect to unlock page if vault is not unlocked
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      (!activeVault || activeVault.vaultId !== params.vaultId) &&
      mountedRef.current
    ) {
      navigate(`/unlock-vault/${params.vaultId}`);
    }
  }, [activeVault, params.vaultId, navigate]);

  if (!activeVault || activeVault.vaultId !== params.vaultId) {
    return null;
  }

  return (
    <div className="bg-background min-h-screen">
      <Navbar showBackButton />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Outlet />
      </div>
    </div>
  );
}
