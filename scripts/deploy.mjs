import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const vaultArgument = process.argv[2];
if (!vaultArgument) {
  console.error("Usage: npm run deploy -- <path-to-obsidian-vault>");
  process.exit(1);
}

const vaultPath = resolve(vaultArgument);
const obsidianDirectory = join(vaultPath, ".obsidian");

try {
  const metadata = await stat(obsidianDirectory);
  if (!metadata.isDirectory()) throw new Error("not a directory");
} catch {
  console.error(`Not an Obsidian vault: ${vaultPath}`);
  console.error(`Expected to find a .obsidian directory at ${obsidianDirectory}`);
  process.exit(1);
}

await runBuild();

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const pluginDirectory = join(obsidianDirectory, "plugins", manifest.id);
const pluginFiles = ["main.js", "manifest.json", "styles.css"];

await mkdir(pluginDirectory, { recursive: true });
await Promise.all(pluginFiles.map((file) => copyFile(file, join(pluginDirectory, file))));

console.log(`Installed ${manifest.name} ${manifest.version} to ${pluginDirectory}`);
console.log("Reload Obsidian to load the updated plugin.");

async function runBuild() {
  const child = spawn("npm run build", {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: true,
  });

  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code));
  });

  if (exitCode !== 0) {
    throw new Error(`Build failed with exit code ${exitCode ?? "unknown"}.`);
  }
}
