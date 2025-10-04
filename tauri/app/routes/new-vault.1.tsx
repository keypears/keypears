import type { MetaFunction } from "react-router";
import { Navbar } from "~app/components/navbar";
import { NewVaultName } from "~app/components/new-vault-name";

export default function NewVaultStep1() {
  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <NewVaultName />
      </div>
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [
    { title: "Create Vault | KeyPears" },
    { name: "description", content: "Create a new vault" },
  ];
};
