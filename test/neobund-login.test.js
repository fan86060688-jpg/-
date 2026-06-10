import assert from "node:assert/strict";
import { test } from "node:test";

import { loginNeobund } from "../src/neobund-login.js";

test("loginNeobund fills account and password then clicks login", async () => {
  const page = new FakePage();

  const result = await loginNeobund({
    credentials: { username: "user@example.com", password: "secret" },
    browserFactory: async () => ({
      newPage: async () => page,
      close: async () => {
        page.closed = true;
      }
    })
  });

  assert.deepEqual(page.gotos, [
    {
      url: "https://www.neobund.ai/zh/tiktok-management",
      options: { waitUntil: "domcontentloaded", timeout: 60000 }
    }
  ]);
  assert.deepEqual(page.fills, [
    { selector: "input#form_item_account", value: "user@example.com" },
    { selector: "input#form_item_password", value: "secret" }
  ]);
  assert.deepEqual(page.clicks, [
    'button:has-text("Log in with password")',
    'button:has-text("Log In")'
  ]);
  assert.equal(result.currentUrl, "https://www.neobund.ai/zh/tiktok-management");
  assert.equal(page.closed, true);
});

class FakePage {
  constructor() {
    this.gotos = [];
    this.fills = [];
    this.clicks = [];
    this.closed = false;
  }

  async goto(url, options) {
    this.gotos.push({ url, options });
  }

  locator(selector) {
    return {
      fill: async (value) => this.fills.push({ selector, value }),
      click: async () => this.clicks.push(selector)
    };
  }

  async waitForTimeout() {}

  url() {
    return "https://www.neobund.ai/zh/tiktok-management";
  }

  async title() {
    return "TikTok Management";
  }
}
