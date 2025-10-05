import { Link } from "react-router";
import { Tabs, TabsList, TabsTrigger } from "~app/components/ui/tabs";

interface PasswordTabsNavProps {
  vaultId: string;
  activeTab: "active" | "deleted";
}

export function PasswordTabsNav({ vaultId, activeTab }: PasswordTabsNavProps) {
  return (
    <Tabs value={activeTab} className="mb-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="active" asChild>
          <Link to={`/vault/${vaultId}/passwords`}>
            Passwords
          </Link>
        </TabsTrigger>
        <TabsTrigger value="deleted" asChild>
          <Link to={`/vault/${vaultId}/passwords/deleted`}>
            Deleted
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
