# KeyPears Data Patterns

This document captures the data handling patterns for the KeyPears project,
including validation, database operations, performance optimizations, and error
handling. These patterns apply to both the Tauri app and the webapp to ensure
consistency across all platforms.

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

KeyPears data patterns emphasize:

- **Type safety**: Zod validation ensures data integrity
- **Performance**: Debouncing and optimistic updates for better UX
- **Consistency**: ULID primary keys across all tables
- **Error handling**: Technical logs + user-friendly messages

When in doubt, look at existing models like `vault.ts` or components like
`NewVaultName` for reference implementations.
