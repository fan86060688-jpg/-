import assert from "node:assert/strict";
import { test } from "node:test";

import { parseEnvFile, readCredentials } from "../src/credentials.js";

test("readCredentials reads platform credentials from provided env", () => {
  const credentials = readCredentials("neobund", {
    NEOBUND_USERNAME: "user@example.com",
    NEOBUND_PASSWORD: "secret"
  });

  assert.deepEqual(credentials, {
    username: "user@example.com",
    password: "secret"
  });
});

test("parseEnvFile supports simple KEY=value lines and ignores comments", () => {
  assert.deepEqual(
    parseEnvFile(`
# local secrets
NEOBUND_USERNAME=user@example.com
NEOBUND_PASSWORD="secret value"
`),
    {
      NEOBUND_USERNAME: "user@example.com",
      NEOBUND_PASSWORD: "secret value"
    }
  );
});
