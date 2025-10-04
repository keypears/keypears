import type { MetaFunction } from "react-router";
import { Navbar } from "~app/components/navbar";
import { Footer } from "~app/components/footer";
import { TestTauri } from "~app/components/test-tauri";

export default function TestTauriPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <TestTauri />
        <Footer />
      </div>
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [
    { title: "Test Tauri | KeyPears" },
    { name: "description", content: "Test Tauri functionality" },
  ];
};
