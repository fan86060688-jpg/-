import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { MemoryStore } from "./memory-store.js";

export async function loadStore(path) {
  try {
    const raw = await readFile(path, "utf8");
    return new MemoryStore(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") {
      return new MemoryStore();
    }
    throw error;
  }
}

export async function saveStore(path, store) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store.toJSON(), null, 2)}\n`, "utf8");
}
