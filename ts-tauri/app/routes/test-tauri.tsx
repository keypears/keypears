import { Navbar } from "~app/components/navbar";
import { TestTauri } from "~app/components/test-tauri";

export default function TestTauriPage() {
  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <TestTauri />
      </div>
    </div>
  );
}
