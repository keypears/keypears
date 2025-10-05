import { useEffect, useRef } from "react";
import { useParams, useNavigate, Outlet, useLocation, Link } from "react-router";
import { Navbar } from "~app/components/navbar";
import { useVault } from "~app/contexts/vault-context";
import { Tabs, TabsList, TabsTrigger } from "~app/components/ui/tabs";

export default function VaultPasswordsLayout() {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
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

  const isDeletedTab = location.pathname.includes('/passwords/deleted');
  const activeTab = isDeletedTab ? 'deleted' : 'active';

  return (
    <div className="bg-background min-h-screen">
      <Navbar showBackButton />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Tabs value={activeTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active" asChild>
              <Link to={`/vault/${params.vaultId}/passwords`}>
                Passwords
              </Link>
            </TabsTrigger>
            <TabsTrigger value="deleted" asChild>
              <Link to={`/vault/${params.vaultId}/passwords/deleted`}>
                Deleted
              </Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Outlet />
      </div>
    </div>
  );
}
