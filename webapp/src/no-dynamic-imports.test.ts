import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SOURCE_ROOT = new URL(".", import.meta.url).pathname;
const DYNAMIC_IMPORT_PATTERN = /\bimport\s*\(/;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) {
      files.push(path);
    }
  }
  return files;
}

describe("dynamic imports", () => {
  it("are not used in app source", () => {
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((file) => DYNAMIC_IMPORT_PATTERN.test(readFileSync(file, "utf8")))
      .map((file) => relative(SOURCE_ROOT, file));

    expect(offenders).toEqual([]);
  });
});
