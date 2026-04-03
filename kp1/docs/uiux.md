# KeyPears UI/UX Design Patterns

This document captures the UI and UX design patterns for the KeyPears project.
These patterns apply to both the Tauri app and the web-kp to ensure consistency
across all platforms.

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

## Accessibility Patterns

- Use semantic HTML (`<button>`, `<label>`, `<nav>`)
- Provide `aria-label` for icon-only buttons
- Ensure color contrast meets WCAG AA standards (Catppuccin themes are designed
  for this)
- Support keyboard navigation (Tab, Enter, Escape)
- Use `tabIndex={-1}` to skip non-essential interactive elements in tab order

## Summary

KeyPears UI/UX design patterns emphasize:

- **Consistency**: Use shadcn components and Catppuccin colors throughout
- **Accessibility**: Keyboard-first navigation, semantic HTML, proper labeling
- **Mobile-first**: Single-column layouts, touch-friendly targets
- **Simplicity**: Minimal abstractions, clear component hierarchy, predictable
  patterns

When in doubt, look at existing components like `PasswordGenerator`,
`NewVaultName`, or routes like `_index.tsx` and `new-vault.2.tsx` for reference
implementations.
