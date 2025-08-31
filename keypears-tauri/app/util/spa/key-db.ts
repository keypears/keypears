import { Hash, WebBuf, FixedBuf } from "@earthbucks/ebx-lib";
import { load } from "@tauri-apps/plugin-store";

interface StorageInterface {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  listItems(): Promise<{ key: string; value: string }[]>;
  listKeys(): Promise<string[]>;
}

class LocalStorage implements StorageInterface {
  setItem(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        localStorage.setItem(key, value);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  getItem(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      try {
        const value = localStorage.getItem(key);
        resolve(value);
      } catch (error) {
        reject(error);
      }
    });
  }

  listItems(): Promise<{ key: string; value: string }[]> {
    return new Promise((resolve, reject) => {
      try {
        const items: { key: string; value: string }[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            const value = localStorage.getItem(key);
            if (value !== null) {
              items.push({ key, value });
            }
          }
        }
        resolve(items);
      } catch (error) {
        reject(error);
      }
    });
  }

  listKeys(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            keys.push(key);
          }
        }
        resolve(keys);
      } catch (error) {
        reject(error);
      }
    });
  }
}

class TauriStore implements StorageInterface {
  private store: ReturnType<typeof load>;

  constructor() {
    this.store = load("store.json");
  }

  async setItem(key: string, value: string): Promise<void> {
    const store = await this.store;
    await store.set(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    const store = await this.store;
    const res = await store.get(key);
    if (typeof res !== "string" && res !== null) {
      throw new Error(`Unexpected value for key "${key}": ${res}`);
    }
    return res;
  }

  async listItems(): Promise<{ key: string; value: string }[]> {
    const store = await this.store;
    const entries = (await store.entries()) as [string, string][];
    return entries.map(([key, value]: [string, string]) => ({ key, value }));
  }

  async listKeys(): Promise<string[]> {
    const store = await this.store;
    const keys = await store.keys();
    return keys;
  }
}

async function getStorage(): Promise<StorageInterface> {
  // @ts-ignore
  if (window.__TAURI__) {
    try {
      return new TauriStore();
    } catch (error) {
      console.error(
        "Failed to load Tauri store, falling back to localStorage:",
        error,
      );
      return new LocalStorage();
    }
  } else {
    return new LocalStorage();
  }
}

const storage = await getStorage();

class KeyDB {
  encryptionKey: FixedBuf<32> | null;

  constructor() {
    this.encryptionKey = null;
  }

  isInitialized() {
    return this.encryptionKey !== null;
  }

  async hasPasswordContext() {
    return !!(await storage.getItem("password-context"));
  }

  async createNewPasswordContext() {
    const passwordContext = FixedBuf.fromRandom(32);
    await storage.setItem("password-context", passwordContext.toHex());
  }

  async getPasswordContext() {
    const passwordContextHex = await storage.getItem("password-context");
    if (!passwordContextHex) {
      throw new Error("No password context saved.");
    }
    return FixedBuf.fromHex(32, passwordContextHex);
  }

  async setPassword(password: string) {
    const passwordBuf = Hash.blake3Hash(WebBuf.fromUtf8(password));
    const passwordContext = await this.getPasswordContext();
    const passwordHash = Hash.blake3Kdf(passwordBuf, passwordContext);
    this.encryptionKey = passwordHash;
  }

  async isEncryptionKeyCorrect() {
    const hashedEncryptionKeyHex = await storage.getItem("hashed-encryption-key");
    if (!hashedEncryptionKeyHex) {
      throw new Error("No hashed encryption key saved.");
    }
    if (!this.encryptionKey) {
      throw new Error("No encryption key set.");
    }
    const hashedEncryptionKey2 = Hash.blake3Hash(this.encryptionKey.buf);
    return hashedEncryptionKeyHex === hashedEncryptionKey2.toHex();
  }

  async saveHashedEncryptionKey() {
    if (!this.encryptionKey) {
      throw new Error("No password set.");
    }
    const hashedEncryptionKey = Hash.blake3Hash(this.encryptionKey.buf);
    await storage.setItem("hashed-encryption-key", hashedEncryptionKey.toHex());
  }
}
