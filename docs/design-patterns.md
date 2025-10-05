# KeyPears Design Patterns

This document captures the design patterns, UI conventions, and architectural
decisions for the KeyPears project. These patterns apply to both the Tauri app
and the webapp to ensure consistency across all platforms.

## Visual Design System

### Color System

KeyPears uses **Catppuccin** color palettes with custom semantic tokens:

- **Light mode**: Catppuccin Latte
- **Dark mode**: Catppuccin Mocha
- **Primary color**: Green (`--green-500` / `hsl(109 58% 40%)` in light,
  `hsl(115 54% 76%)` in dark)
- **Destructive color**: Red (`--red-500`)
- **Accent colors**: Full Catppuccin palette (red, peach, yellow, green, teal,
  blue, sapphire, mauve)

All colors are defined in `app.css` with complete 50-900 scales for each color
family. The design uses semantic color tokens (`--primary`, `--destructive`,
`--muted`, etc.) that automatically adapt to light/dark mode.

### Typography

- **Font stack**: System default fonts (no custom fonts)
- **Prose content**: Use `keypears-prose` class for markdown/blog content
  - Extends `@tailwindcss/typography` with brand colors
  - Links are primary green with no underline (underline on hover)
  - Smooth opacity transitions: `transition: opacity 0.2s` + `opacity: 0.8` on
    hover
- **Monospace**: Use `font-mono` class for technical content (vault names,
  passwords, keys)
- **Size scale**: Use Tailwind's default scale (`text-sm`, `text-base`,
  `text-lg`, `text-xl`, `text-2xl`)

### Spacing & Layout

- **Mobile-first**: All apps use single-column layout by default
- **Container widths**:
  - `max-w-2xl`: Standard content width (672px) - used for most pages
  - `max-w-3xl`: Wider content for blog posts (768px)
  - Full-width cards on mobile with `px-4` page padding
- **Vertical spacing**: Use `space-y-4` or `space-y-6` for consistent spacing
- **Border radius**: `rounded-lg` for cards, `rounded-md` for inputs/buttons
- **Card padding**: `p-8` for large cards, `p-6` for standard, `p-4` for compact

### Component Styling Patterns

```tsx
// Card pattern
<div className="border-border bg-card rounded-lg border p-8">

// Icon badge pattern (for decorative icons)
<div className="bg-primary/10 rounded-full p-4">
  <Icon className="text-primary h-8 w-8" />
</div>

// Link pattern
<Link className="text-primary hover:underline hover:opacity-80 transition-opacity">

// Muted text
<p className="text-muted-foreground text-sm">
```

## Component Patterns

### Shadcn UI First

**ALWAYS prefer shadcn components over custom implementations.**

- Import from `~app/components/ui/*`
- Use `Button`, `Input`, `Checkbox`, `Slider`, `Sheet`, `AlertDialog`, etc.
- Only create custom components when shadcn doesn't provide the pattern
- Shadcn components are configured with Catppuccin theme in `app.css`

### Icons with Lucide React

**NEVER hard-code SVG icons inline.**

```tsx
import { Copy, Check, Eye, EyeOff, Lock, Menu } from "lucide-react";

// Use with size prop
<Copy size={20} />
<Check size={18} />
<Lock className="h-8 w-8" />
```

### Button Variants

```tsx
// Primary action
<Button>Continue</Button>

// Secondary action
<Button variant="outline">Cancel</Button>

// Destructive action
<Button variant="destructive">Delete</Button>

// Icon-only button
<Button variant="ghost" size="icon-sm" aria-label="Copy">
  <Copy size={20} />
</Button>

// Link as button
<Button asChild>
  <Link to="/path">Go</Link>
</Button>
```

### Input Patterns

#### Standard Input with Label

```tsx
<div className="space-y-2">
  <label htmlFor="field-name" className="text-sm font-medium">
    Field Label
  </label>
  <Input
    id="field-name"
    type="text"
    value={value}
    onChange={(e) => setValue(e.target.value)}
    placeholder="placeholder text"
  />
</div>
```

#### Input with Inline Action Button

When adding buttons inside inputs (e.g., show/hide password), wrap the button in
an absolutely positioned div to avoid layout conflicts with the Button
component's `inline-flex`:

```tsx
<div className="relative">
  <Input
    type={showPassword ? "text" : "password"}
    value={password}
    className="pr-10"
  />
  <div className="absolute right-2 top-1/2 -translate-y-1/2">
    <Button
      variant="ghost"
      size="icon-sm"
      tabIndex={-1}
      onClick={() => setShowPassword(!showPassword)}
    >
      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
    </Button>
  </div>
</div>
```

#### Input with Validation

```tsx
<Input
  value={value}
  onChange={(e) => setValue(e.target.value)}
  className={error ? "border-destructive" : ""}
/>
{error && <p className="text-destructive text-xs">{error}</p>}
```

#### Input with Metadata Display

```tsx
<div className="flex justify-between text-xs">
  <span className="text-muted-foreground">{length} characters</span>
  <span className="text-green-500">{entropy.toFixed(1)} bits</span>
</div>
```

### Empty State Pattern

```tsx
<div className="border-border bg-card rounded-lg border p-8">
  <div className="flex flex-col items-center text-center">
    <div className="bg-primary/10 mb-4 rounded-full p-4">
      <Icon className="text-primary h-8 w-8" />
    </div>
    <h2 className="mb-2 text-xl font-semibold">No items yet</h2>
    <p className="text-muted-foreground mb-6 text-sm">
      Description of empty state
    </p>
    <Button size="lg" className="w-full">
      Primary Action
    </Button>
  </div>
</div>
```

### List Item Pattern

```tsx
<div className="space-y-3">
  {items.map((item) => (
    <div
      key={item.id}
      className="border-border bg-card hover:bg-accent rounded-lg border p-4 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 rounded-full p-2">
          <Icon className="text-primary h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">{item.name}</h3>
        </div>
        <Button variant="ghost" size="icon-sm">
          <X size={20} />
        </Button>
      </div>
    </div>
  ))}
</div>
```

### Confirmation Dialog Pattern

```tsx
const [itemToDelete, setItemToDelete] = useState<Item | null>(null);

<AlertDialog
  open={!!itemToDelete}
  onOpenChange={(open) => !open && setItemToDelete(null)}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Confirm Action?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleDelete}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## Layout Patterns

### Page Layout

All pages follow this structure:

```tsx
export default function PageName() {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col px-4 py-8">
        <div className="mx-auto w-full max-w-2xl">
          {/* Page content */}
        </div>
      </div>
      <Footer />
    </div>
  );
}
```

**Key points:**

- `flex min-h-screen flex-col`: Full-height flex container
- `flex-1`: Main content area grows to fill space
- `px-4 py-8`: Consistent page padding
- `mx-auto w-full max-w-2xl`: Centered content with max width
- Footer is optional (omit for wizard flows)

### Simplified Layout (Wizard Steps)

For multi-step flows, omit the footer and simplify:

```tsx
<div className="bg-background min-h-screen">
  <Navbar />
  <div className="mx-auto max-w-2xl px-4 py-8">
    <ComponentOrCard />
  </div>
</div>
```

### Navbar Pattern

The navbar is a persistent header with:

- Burger menu (left side) that opens a slide-out sheet
- Sticky positioning (`sticky top-0 z-40`)
- Consistent height (`h-14`)
- Border bottom for visual separation

### Component-Based Cards

Complex UI elements are extracted into separate components:

```tsx
// Route file: minimal wrapper
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

// Component file: all the logic
export function PasswordGenerator() {
  return (
    <div className="border-border bg-card rounded-lg border p-8">
      {/* Complex component UI */}
    </div>
  );
}
```

## Interaction Patterns

### Keyboard Accessibility

**All forms must support keyboard-only navigation:**

1. **Tab order**: Inputs should be reachable via Tab key
2. **Skip decorative elements**: Use `tabIndex={-1}` on inline action buttons
3. **Enter to submit**: Add `onKeyDown` handlers to inputs:

```tsx
<Input
  onKeyDown={(e) => {
    if (e.key === "Enter" && isValid) {
      handleSubmit();
    }
  }}
/>
```

4. **Auto-focus**: Use `autoFocus` prop on the first input of each page:

```tsx
<Input autoFocus />
```

### Form Validation Patterns

**Real-time validation with visual feedback:**

```tsx
const [value, setValue] = useState("");
const [error, setError] = useState("");

// Validate on change
const handleChange = (newValue: string) => {
  setValue(newValue);
  try {
    schema.parse(newValue);
    setError("");
  } catch (err) {
    if (err instanceof ZodError) {
      setError(err.issues[0]?.message || "Invalid");
    }
  }
};

// Visual feedback
<Input
  value={value}
  onChange={(e) => handleChange(e.target.value)}
  className={error ? "border-destructive" : ""}
/>
{error && <p className="text-destructive text-xs">{error}</p>}
```

**Debounced async validation (e.g., checking uniqueness):**

```tsx
useEffect(() => {
  if (!value) {
    setError("");
    return;
  }

  // First validate format
  if (!validateFormat(value)) return;

  // Then check database (debounced)
  const timer = setTimeout(() => {
    checkUniqueness(value);
  }, 500);

  return () => clearTimeout(timer);
}, [value]);
```

### Button States

```tsx
// Disabled when form invalid
<Button disabled={!isValid}>Submit</Button>

// Loading state with spinner
<Button disabled={isLoading}>
  {isLoading ? "Loading..." : "Submit"}
</Button>

// Icon button with animation
<Button onClick={handleRefresh}>
  <RotateCw className={isRefreshing ? "animate-spin" : ""} />
</Button>
```

### Copy to Clipboard Pattern

```tsx
const [copied, setCopied] = useState(false);

<div className="relative">
  <Button
    onClick={() => {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }}
  >
    <Copy size={20} />
  </Button>
  {copied && (
    <div className="animate-in fade-in slide-in-from-bottom-2 absolute -top-8 left-1/2 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-md bg-green-500 px-2 py-1 text-xs text-white">
        <Check size={12} />
        <span>Copied</span>
      </div>
    </div>
  )}
</div>
```

### Multi-Step Wizards

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

## Code Organization Patterns

### File Structure

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

### Naming Conventions

- **Files**: kebab-case (`new-vault-name.tsx`, `password-generator.tsx`)
- **Components**: PascalCase (`PasswordGenerator`, `NewVaultName`)
- **Functions**: camelCase (`handleSubmit`, `validateInput`)
- **Constants**: UPPER_SNAKE_CASE or camelCase depending on usage
- **Routes**: Use React Router v7 file-based routing conventions

### Import Patterns

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

### Component Structure

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

## Validation Patterns

### Zod Schema Validation

All validation uses Zod schemas:

```tsx
import { vaultNameSchema } from "@keypears/lib";
import { ZodError } from "zod";

const validate = (value: string) => {
  try {
    vaultNameSchema.parse(value);
    setError("");
    return true;
  } catch (err) {
    if (err instanceof ZodError) {
      setError(err.issues[0]?.message || "Invalid");
    }
    return false;
  }
};
```

### Password Entropy Display

```tsx
import { calculatePasswordEntropy } from "@keypears/lib";

const entropy = calculatePasswordEntropy(password.length, {
  lowercase: /[a-z]/.test(password),
  uppercase: /[A-Z]/.test(password),
  numbers: /[0-9]/.test(password),
  symbols: /[^a-zA-Z0-9]/.test(password),
});

// Color-coded feedback
<span
  className={cn(
    entropy >= 75 && "text-green-500",
    entropy >= 50 && entropy < 75 && "text-yellow-500",
    entropy < 50 && "text-destructive",
  )}
>
  {entropy.toFixed(1)} bits
</span>
```

## Cryptography Patterns

### Three-Tier Key Derivation

```tsx
import {
  derivePasswordKey,
  deriveEncryptionKey,
  deriveLoginKey,
  generateKey,
  encryptKey,
} from "@keypears/lib";

// 1. Derive password key from user's password
const passwordKey = derivePasswordKey(password);

// 2. Derive encryption key (for encrypting vault master key)
const encryptionKey = deriveEncryptionKey(passwordKey);

// 3. Derive login key (for server authentication)
const loginKey = deriveLoginKey(passwordKey);

// 4. Generate immutable vault master key
const vaultKey = generateKey();

// 5. Encrypt vault key with encryption key
const encryptedVaultKey = encryptKey(vaultKey, encryptionKey);

// 6. Derive PIN key from PIN (for local quick unlock)
const pinKey = derivePasswordKey(pin);

// 7. Encrypt password key with PIN key
const encryptedPasswordKey = encryptKey(passwordKey, pinKey);
```

All cryptographic operations use the `@keypears/lib` package. See
`docs/key-derivation.md` for complete details.

## Database Patterns

### ULID Primary Keys

All tables use ULID primary keys:

```tsx
import { text } from "drizzle-orm/sqlite-core"; // or postgres-core
import { ulid } from "ulid";

export const tableName = sqliteTable("table_name", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => ulid()),
  // other fields...
});
```

### Model Functions

Database models follow this pattern:

```tsx
// models/item.ts
import { db } from "../index";
import { items } from "../schema";
import { eq } from "drizzle-orm";

export interface Item {
  id: string;
  name: string;
}

export async function createItem(name: string): Promise<Item> {
  // Validate with Zod if schema exists
  await db.insert(items).values({ name });

  // Tauri SQLite doesn't support .returning()
  const item = await getItemByName(name);
  if (!item) throw new Error("Failed to create item");

  return item;
}

export async function getItem(id: string): Promise<Item | undefined> {
  const result = await db.select().from(items).where(eq(items.id, id));
  return result[0];
}

export async function getItems(): Promise<Item[]> {
  return await db.select().from(items);
}

export async function deleteItem(id: string): Promise<void> {
  await db.delete(items).where(eq(items.id, id));
}
```

**Important**: Tauri SQLite with Drizzle ORM doesn't support `.returning()`.
Always insert then fetch.

## Performance Patterns

### Debounced Validation

```tsx
useEffect(() => {
  const timer = setTimeout(() => {
    expensiveValidation(value);
  }, 500);

  return () => clearTimeout(timer);
}, [value]);
```

### Optimistic Updates

```tsx
const handleAction = async () => {
  // Update local state immediately
  setItems(optimisticNewState);

  try {
    // Perform async operation
    await performAction();
    // Fetch fresh data on success
    const updated = await fetchData();
    setItems(updated);
  } catch (error) {
    // Revert on error
    setItems(previousState);
  }
};
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

## Accessibility Patterns

- Use semantic HTML (`<button>`, `<label>`, `<nav>`)
- Provide `aria-label` for icon-only buttons
- Ensure color contrast meets WCAG AA standards (Catppuccin themes are designed
  for this)
- Support keyboard navigation (Tab, Enter, Escape)
- Use `tabIndex={-1}` to skip non-essential interactive elements in tab order

## Error Handling Patterns

```tsx
try {
  await operation();
} catch (error) {
  console.error("Descriptive error message:", error);
  setError("User-friendly error message");
}
```

Always log technical details to console and show user-friendly messages in the
UI.

## Summary

KeyPears design patterns emphasize:

- **Consistency**: Use shadcn components and Catppuccin colors throughout
- **Accessibility**: Keyboard-first navigation, semantic HTML, proper labeling
- **Mobile-first**: Single-column layouts, touch-friendly targets
- **Type safety**: Zod validation, TypeScript types, React Router type
  generation
- **Simplicity**: Minimal abstractions, clear component hierarchy, predictable
  patterns
- **Performance**: Debouncing, optimistic updates, efficient re-renders

When in doubt, look at existing components like `PasswordGenerator`,
`NewVaultName`, or routes like `_index.tsx` and `new-vault.2.tsx` for reference
implementations.
