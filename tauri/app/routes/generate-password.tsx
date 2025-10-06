import { Navbar } from "~app/components/navbar";
import { PasswordGenerator } from "~app/components/password-generator";

export default function GeneratePasswordPage() {
  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <PasswordGenerator />
      </div>
    </div>
  );
}
