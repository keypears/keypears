import { useState } from "react";
import { Link } from "react-router";
import { Menu } from "lucide-react";
import { Button } from "~app/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~app/components/ui/sheet";

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-40 w-full border-b border-border bg-background">
        <div className="flex h-14 items-center justify-between px-4">
          {/* Left: Burger Menu */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </Button>

          {/* Right: Placeholder for avatar */}
          <div className="w-10" />
        </div>
      </nav>

      {/* Slide-out menu */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-2">
            <Link
              to="/"
              className="block rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => setOpen(false)}
            >
              Home
            </Link>
            <Link
              to="/generate-password"
              className="block rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => setOpen(false)}
            >
              Generate Password
            </Link>
            <Link
              to="/test-tauri"
              className="block rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => setOpen(false)}
            >
              Test Tauri
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
