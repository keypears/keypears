import type { MetaFunction } from "react-router";
import { Navbar } from "~app/components/navbar";
import { Footer } from "~app/components/footer";
import { PasswordGenerator } from "~app/components/password-generator";

export default function GeneratePasswordPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <PasswordGenerator />
        <Footer />
      </div>
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [
    { title: "Generate Password | KeyPears" },
    { name: "description", content: "Generate secure passwords with KeyPears" },
  ];
};
