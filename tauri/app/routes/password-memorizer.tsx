import type { MetaFunction } from "react-router";
import { Navbar } from "~app/components/navbar";
import { PasswordMemorizer } from "~app/components/password-memorizer";

export default function PasswordMemorizerPage() {
  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <PasswordMemorizer />
      </div>
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [
    { title: "Password Memorizer | KeyPears" },
    {
      name: "description",
      content: "Practice memorizing passwords through repetition",
    },
  ];
};
