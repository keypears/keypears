import type { MetaFunction } from "react-router";
import { PasswordList } from "~app/components/password-list";

export default function VaultPasswordsDeleted() {
  return <PasswordList showDeleted={true} />;
}

export const meta: MetaFunction = () => {
  return [
    { title: "Deleted Passwords | KeyPears" },
    { name: "description", content: "View deleted passwords" },
  ];
};
