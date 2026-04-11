import {
  createRouter,
  ErrorComponent,
  Link,
  useRouter,
} from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { Loader2 } from "lucide-react";

function DefaultErrorComponent({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="flex flex-1 items-center justify-center p-8 font-sans">
      <div className="text-center">
        <p className="text-foreground text-lg font-bold">Something went wrong</p>
        <p className="text-muted-foreground mt-2 text-sm">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={() => router.invalidate()}
          className="bg-accent text-accent-foreground hover:bg-accent/90 mt-4 rounded px-4 py-2 text-sm transition-all"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function DefaultPendingComponent() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Loader2 className="text-accent h-8 w-8 animate-spin" />
    </div>
  );
}

function DefaultNotFoundComponent() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 font-sans">
      <div className="text-center">
        <p className="text-foreground text-lg font-bold">Page not found</p>
        <p className="text-muted-foreground mt-2 text-sm">
          The page you're looking for doesn't exist.
        </p>
        <Link
          to="/"
          className="text-accent hover:text-accent/80 mt-4 inline-block text-sm no-underline"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultErrorComponent: DefaultErrorComponent as typeof ErrorComponent,
    defaultPendingComponent: DefaultPendingComponent,
    defaultNotFoundComponent: DefaultNotFoundComponent,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
