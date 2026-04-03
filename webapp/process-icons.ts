import fs from "fs";
import path from "path";
import sharp from "sharp";

const SOURCE_DIR = "raw-icons";
const OUTPUT_DIR = "public/images";
const FAVICON_DIR = "public";
const TYPES_FILE = "src/lib/icons.ts";
const ICON_WEB_PATH = "/images";

const WEBP_SIZES = [32, 64, 96, 128, 180, 200, 300, 400];
const FAVICON_SIZE = 64;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const outputPaths: string[] = [];

async function processFile(file: string) {
  const baseName = path.basename(file, ".png");
  const sourcePath = path.join(SOURCE_DIR, file);

  for (const size of WEBP_SIZES) {
    const outputFileName = `${baseName}-${size}.webp`;
    const outputPath = path.join(OUTPUT_DIR, outputFileName);
    const webPath = `${ICON_WEB_PATH}/${outputFileName}`;

    await sharp(sourcePath).resize(size, size).webp().toFile(outputPath);
    outputPaths.push(webPath);
    console.log(`Processed ${outputFileName}`);
  }

  // Generate favicon as PNG named favicon.ico
  const faviconPath = path.join(FAVICON_DIR, "favicon.ico");
  await sharp(sourcePath)
    .resize(FAVICON_SIZE, FAVICON_SIZE)
    .png()
    .toFile(faviconPath);
  console.log(`Processed favicon.ico (${FAVICON_SIZE}px PNG)`);
}

async function main() {
  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((f) => path.extname(f).toLowerCase() === ".png");

  for (const file of files) {
    await processFile(file);
  }

  const typeContent = `export type Icon =\n  ${outputPaths
    .sort()
    .map((p) => `| "${p}"`)
    .join("\n  ")};\n\nexport const $icon = (icon: Icon) => icon;\n`;

  fs.mkdirSync(path.dirname(TYPES_FILE), { recursive: true });
  fs.writeFileSync(TYPES_FILE, typeContent);
  console.log(`Generated types at ${TYPES_FILE}`);
}

main().catch(console.error);
