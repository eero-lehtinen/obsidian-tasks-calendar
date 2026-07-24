import { rm } from "node:fs/promises";

await Promise.all([rm("main.js", { force: true }), rm("dist", { force: true, recursive: true })]);
