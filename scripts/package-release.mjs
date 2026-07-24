import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const releaseDirectory = join("dist", `${manifest.id}-${manifest.version}`);

await mkdir(releaseDirectory, { recursive: true });
await Promise.all(
  ["main.js", "manifest.json", "styles.css"].map((file) => copyFile(file, join(releaseDirectory, file))),
);

await writeFile(
  join("dist", "release.json"),
  `${JSON.stringify(
    {
      id: manifest.id,
      version: manifest.version,
      directory: releaseDirectory,
      files: ["main.js", "manifest.json", "styles.css"],
    },
    null,
    2,
  )}\n`,
);

console.log(`Release files written to ${releaseDirectory}`);
