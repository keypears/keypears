import { Navbar } from "~app/components/navbar";
import { Footer } from "~app/components/footer";

export default function About() {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col px-4 py-8">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">About KeyPears</h1>
          </div>

          <div className="border-border bg-card rounded-lg border p-6">
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="mb-2 font-semibold">Version</h2>
                <p className="text-muted-foreground text-sm">0.1.0</p>
              </div>

              <div className="border-border border-t pt-6">
                <h2 className="mb-2 font-semibold">License</h2>
                <p className="text-muted-foreground text-sm">
                  Apache 2.0 - Open Source
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
