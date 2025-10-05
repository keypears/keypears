# KeyPears Code Patterns

This document captures the code organization, structure, and React patterns for
the KeyPears project. These patterns apply to both the Tauri app and the webapp
to ensure consistency across all platforms.

## File Structure

```
app/
  routes/              # Page components
    _index.tsx         # Homepage
    page-name.tsx      # Single page
    wizard.1.tsx       # Multi-step flow (step 1)
    wizard.2.tsx       # Multi-step flow (step 2)
  components/          # Reusable components
    component-name.tsx # Complex UI components
    ui/                # Shadcn components
      button.tsx
      input.tsx
  db/                  # Database layer
    models/            # Database models
      model-name.ts
    schema.ts          # Drizzle schema
    index.ts           # Database connection
  lib/                 # Utilities
    utils.ts           # Helper functions
```

## Naming Conventions

- **Files**: kebab-case (`new-vault-name.tsx`, `password-generator.tsx`)
- **Components**: PascalCase (`PasswordGenerator`, `NewVaultName`)
- **Functions**: camelCase (`handleSubmit`, `validateInput`)
- **Constants**: UPPER_SNAKE_CASE or camelCase depending on usage
- **Routes**: Use React Router v7 file-based routing conventions

## Import Patterns

Always organize imports in this order:

```tsx
// React Router types (top)
import type { MetaFunction } from "react-router";
import type { Route } from "./+types/page-name";

// React hooks
import { useState, useEffect } from "react";

// React Router
import { Link, useNavigate, useLocation } from "react-router";

// Third-party UI libraries
import { Icon1, Icon2 } from "lucide-react";

// Internal UI components
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";

// Internal custom components
import { Navbar } from "~app/components/navbar";
import { CustomComponent } from "~app/components/custom-component";

// Utilities and library functions
import { helperFunction } from "~app/lib/utils";
import { cryptoFunction } from "@keypears/lib";

// Database models
import { getItems, createItem } from "~app/db/models/model-name";
```

## Component Structure

Follow this template for all components:

```tsx
// 1. Imports

// 2. Type definitions (if needed)
interface Props {
  // ...
}

// 3. Component function
export function ComponentName({ ...props }: Props) {
  // 3a. Hooks (state, effects, router)
  const [state, setState] = useState("");
  const navigate = useNavigate();

  // 3b. Derived state and computations
  const isValid = state.length > 0;

  // 3c. Event handlers
  const handleSubmit = () => {
    // ...
  };

  // 3d. Effects
  useEffect(() => {
    // ...
  }, []);

  // 3e. Conditional returns
  if (!data) return null;

  // 3f. JSX
  return (
    <div>
      {/* ... */}
    </div>
  );
}

// 4. Metadata (for routes)
export const meta: MetaFunction = () => {
  return [
    { title: "Page Title | KeyPears" },
    { name: "description", content: "Page description" },
  ];
};
```

## State Management Patterns

### Local State with React Router

KeyPears uses React Router's built-in state management:

```tsx
// Data loading with clientLoader
export async function clientLoader() {
  const data = await fetchData();
  return { data };
}

export default function Page({ loaderData }: Route.ComponentProps) {
  // Sync loader data to local state for optimistic updates
  const [items, setItems] = useState(loaderData.data);

  useEffect(() => {
    setItems(loaderData.data);
  }, [loaderData.data]);

  const handleDelete = async (id: string) => {
    await deleteItem(id);
    const updated = await fetchData();
    setItems(updated); // Optimistic update
  };
}
```

### One-Time Effect Execution

Use `useRef` to prevent effect re-runs:

```tsx
const hasRun = useRef(false);

useEffect(() => {
  if (hasRun.current) return;
  hasRun.current = true;

  // Runs only once
  doExpensiveWork();
}, []);
```

**Important**: Do NOT include state that changes inside the effect in the
dependency array, as this causes infinite loops.

### Form State with Character Sets

For password generators, track enabled character sets:

```tsx
const [lowercase, setLowercase] = useState(true);
const [uppercase, setUppercase] = useState(false);
const [numbers, setNumbers] = useState(false);
const [symbols, setSymbols] = useState(false);

// Prevent disabling last character set
const getEnabledCount = () => {
  return [lowercase, uppercase, numbers, symbols].filter(Boolean).length;
};

<Checkbox
  checked={lowercase}
  onCheckedChange={(checked) => {
    if (!checked && getEnabledCount() <= 1) return;
    setLowercase(checked === true);
  }}
/>
```

## Multi-Step Wizards

Use React Router's state passing for wizard flows:

```tsx
// Step 1: Collect data and navigate
const handleContinue = () => {
  navigate("/wizard/step-2", {
    state: { data: formData },
  });
};

// Step 2: Receive data from previous step
const location = useLocation();
const { data } = (location.state as { data?: DataType }) || {};

// Redirect if missing required state
useEffect(() => {
  if (!data) {
    navigate("/wizard/step-1");
  }
}, [data, navigate]);
```

**Pattern for cumulative state:**

```tsx
// Step 2 → Step 3: Add new data to existing state
navigate("/wizard/step-3", {
  state: {
    ...location.state,
    newField: newValue,
  },
});
```

## Meta Tags Pattern

Every route should export metadata:

```tsx
export const meta: MetaFunction = () => {
  return [
    { title: "Page Title | KeyPears" },
    { name: "description", content: "Description for SEO and social sharing" },
  ];
};
```

## Summary

KeyPears code patterns emphasize:

- **Type safety**: TypeScript types, React Router type generation
- **Simplicity**: Minimal abstractions, clear component hierarchy
- **Consistency**: Standard file structure, import ordering, component structure
- **React Router first**: Use built-in state management and routing patterns

When in doubt, look at existing components like `PasswordGenerator`,
`NewVaultName`, or routes like `_index.tsx` and `new-vault.2.tsx` for reference
implementations.
