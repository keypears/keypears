import { Link, href } from "react-router";
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
          <Link to={href("/vault/:vaultId/passwords", { vaultId })}>
            Passwords
          </Link>
        </TabsTrigger>
        <TabsTrigger value="deleted" asChild>
          <Link to={href("/vault/:vaultId/passwords/deleted", { vaultId })}>
            Deleted
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
