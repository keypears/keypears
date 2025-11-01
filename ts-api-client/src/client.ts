import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf } from "@webbuf/fixedbuf";
import { Blake3ResponseSchema } from "./schemas.js";

export interface KeyPearsClientConfig {
  url?: string;
  apiKey?: string;
}

export class KeyPearsClient {
  private readonly url: string;
  private readonly apiKey: string | undefined;

  constructor(config: KeyPearsClientConfig = {}) {
    this.url = config.url ?? "";
    this.apiKey = config.apiKey;
  }

  async blake3(data: WebBuf): Promise<FixedBuf<32>> {
    const base64Data = data.toBase64();

    // Wrap request in orpc RPC format
    const response = await fetch(`${this.url}/api/blake3`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { data: base64Data } }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Unwrap response from orpc RPC format
    const responseData = (await response.json()) as { json: unknown };
    const parsed = Blake3ResponseSchema.parse(responseData.json);

    return FixedBuf.fromHex(32, parsed.hash);
  }
}
