i am building a password manager called KeyPears. there will be a sqlite
database that stores the keys client-side. all meta data is unencrypted, but the
passwords are encrypted. i need a function that generates random passwords
subject to certain constraints. the first password generator i need should
generate all lowercase characters. what is the best way to do this in
typescript/node.js?

# === ASSISTANT ===

Here's a robust password generator function for your KeyPears password manager
that generates lowercase passwords:

```typescript
import crypto from 'crypto';

interface PasswordOptions {
  length: number;
  excludeSimilar?: boolean; // excludes characters like 'l', 'o', '0', '1'
  excludeAmbiguous?: boolean; // excludes characters that might be confusing
}

/**
 * Generates a random password with lowercase letters only
 * @param options Configuration for password generation
 * @returns A randomly generated lowercase password
 */
export function generateLowercasePassword(options: PasswordOptions): string {
  const { length, excludeSimilar = false, excludeAmbiguous = false } = options;
  
  if (length <= 0) {
    throw new Error('Password length must be greater than 0');
  }
  
  if (length > 1000) {
    throw new Error('Password length too long (max 1000 characters)');
  }
  
  let charset = 'abcdefghijklmnopqrstuvwxyz';
  
  // Remove similar looking characters if requested
  if (excludeSimilar) {
    charset = charset.replace(/[il1o0]/g, '');
  }
  
  // Remove potentially ambiguous characters if requested
  if (excludeAmbiguous) {
    charset = charset.replace(/[il1o0]/g, ''); // same as excludeSimilar for lowercase
  }
  
  if (charset.length === 0) {
    throw new Error('No valid characters available for password generation');
  }
  
  let password = '';
  
  for (let i = 0; i < length; i++) {
    // Use cryptographically secure random number generation
    const randomBytes = crypto.randomBytes(1);
    const randomIndex = randomBytes[0] % charset.length;
    password += charset[randomIndex];
  }
  
  return password;
}

// Usage examples:
// const password1 = generateLowercasePassword({ length: 16 });
// const password2 = generateLowercasePassword({ length: 20, excludeSimilar: true });
```

For even better cryptographic security, here's an alternative approach that
avoids modulo bias:

```typescript
import crypto from 'crypto';

/**
 * Generates a cryptographically secure random password with lowercase letters
 * Uses rejection sampling to avoid modulo bias
 */
export function generateSecureLowercasePassword(options: PasswordOptions): string {
  const { length, excludeSimilar = false } = options;
  
  if (length <= 0) {
    throw new Error('Password length must be greater than 0');
  }
  
  let charset = 'abcdefghijklmnopqrstuvwxyz';
  
  if (excludeSimilar) {
    charset = charset.replace(/[il1o0]/g, '');
  }
  
  const charsetLength = charset.length;
  let password = '';
  
  for (let i = 0; i < length; i++) {
    let randomValue: number;
    
    // Rejection sampling to avoid modulo bias
    do {
      randomValue = crypto.randomBytes(1)[0];
    } while (randomValue >= Math.floor(256 / charsetLength) * charsetLength);
    
    password += charset[randomValue % charsetLength];
  }
  
  return password;
}
```

**Key features of this implementation:**

1. **Cryptographically secure**: Uses `crypto.randomBytes()` instead of
   `Math.random()`
2. **Configurable**: Easy to adjust length and character exclusions
3. **Input validation**: Prevents common errors
4. **TypeScript**: Full type safety
5. **Modulo bias protection**: The second version eliminates statistical bias
6. **Extensible**: Easy to modify for your future password generators

**Usage in your KeyPears app:**

```typescript
// Generate a simple 16-character lowercase password
const password = generateLowercasePassword({ length: 16 });

// Generate a 20-character password excluding similar-looking characters
const safePassword = generateLowercasePassword({ 
  length: 20, 
  excludeSimilar: true 
});
```

This foundation will make it easy to create additional generators for mixed
case, numbers, symbols, etc. Would you like me to show you how to extend this
for your next password generator types?

# === USER ===
