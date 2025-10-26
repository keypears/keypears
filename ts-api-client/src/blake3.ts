import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf } from "@webbuf/fixedbuf";
import { Blake3ResponseSchema } from "./schemas.js";

export async function blake3Hash(
  data: WebBuf,
  baseUrl: string,
): Promise<FixedBuf<32>> {
  const base64Data = data.toBase64();

  const response = await fetch(`${baseUrl}/api/blake3`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: base64Data }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();
  const parsed = Blake3ResponseSchema.parse(json);

  return FixedBuf.fromHex(32, parsed.hash);
}
