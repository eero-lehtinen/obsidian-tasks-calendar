import { rm } from "node:fs/promises";

await Promise.all([
  rm("main.js", { force: true }),
  rm("styles.css", { force: true }),
  rm("dist", { force: true, recursive: true }),
]);
