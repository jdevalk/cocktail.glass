import { mkdir, readdir, stat } from 'node:fs/promises';
import { join, parse } from 'node:path';

import sharp from 'sharp';

const sourceDir = join(process.cwd(), 'public', 'images');
const outputDir = join(sourceDir, 'responsive');
const targetWidths = [320, 640];

async function isUpToDate(sourcePath, outputPath) {
  try {
    const [sourceStats, outputStats] = await Promise.all([stat(sourcePath), stat(outputPath)]);
    return outputStats.mtimeMs >= sourceStats.mtimeMs;
  } catch {
    return false;
  }
}

async function generateVariant(sourcePath, slug, width) {
  const targetDir = join(outputDir, String(width));
  const outputPath = join(targetDir, `${slug}.webp`);

  if (await isUpToDate(sourcePath, outputPath)) {
    return false;
  }

  await mkdir(targetDir, { recursive: true });
  await sharp(sourcePath)
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(outputPath);

  return true;
}

async function main() {
  const files = (await readdir(sourceDir))
    .filter((file) => file.endsWith('.webp'));

  let generatedCount = 0;

  for (const file of files) {
    const sourcePath = join(sourceDir, file);
    const { name: slug } = parse(file);

    for (const width of targetWidths) {
      if (await generateVariant(sourcePath, slug, width)) {
        generatedCount += 1;
      }
    }
  }

  console.log(`Generated ${generatedCount} responsive image variants.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
