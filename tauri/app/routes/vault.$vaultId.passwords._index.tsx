import type { MetaFunction } from "react-router";
import { PasswordList } from "~app/components/password-list";

export default function VaultPasswordsIndex() {
  return <PasswordList showDeleted={false} />;
}

export const meta: MetaFunction = () => {
  return [
    { title: "Passwords | KeyPears" },
    { name: "description", content: "Manage your passwords" },
  ];
};
