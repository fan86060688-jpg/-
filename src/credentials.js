import { readFile } from "node:fs/promises";

export function readCredentials(platform, env = process.env) {
  const prefix = platform.toUpperCase().replaceAll("-", "_");
  const username = env[`${prefix}_USERNAME`];
  const password = env[`${prefix}_PASSWORD`];
  if (!username || !password) {
    throw new Error(
      `Missing ${prefix}_USERNAME or ${prefix}_PASSWORD. Store credentials as environment variables or inject them from your local secret manager.`
    );
  }
  return { username, password };
}

export async function loadLocalEnv(path = ".env.local", env = process.env) {
  try {
    const raw = await readFile(path, "utf8");
    Object.assign(env, parseEnvFile(raw));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

export function parseEnvFile(raw) {
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^"|"$/g, "");
    values[key] = value;
  }
  return values;
}
