import { useEffect, useRef } from "react";
import { useParams, useNavigate, Outlet, href } from "react-router";
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
      mountedRef.current &&
      params.vaultId
    ) {
      navigate(href("/unlock-vault/:vaultId", { vaultId: params.vaultId }));
    }
  }, [activeVault, params.vaultId, navigate]);

  if (!activeVault || activeVault.vaultId !== params.vaultId) {
    return null;
  }

  return <Outlet />;
}
