import assert from "node:assert/strict";
import { test } from "node:test";

import { loginMiaoshou } from "../src/miaoshou-login.js";

test("loginMiaoshou fills mobile and password then clicks login", async () => {
  const page = new FakePage();

  const result = await loginMiaoshou({
    credentials: { username: "13800000000", password: "secret" },
    browserFactory: async () => ({
      newPage: async () => page,
      close: async () => {
        page.closed = true;
      }
    })
  });

  assert.deepEqual(page.gotos, [
    {
      url: "https://erp.91miaoshou.com",
      options: { waitUntil: "domcontentloaded", timeout: 60000 }
    }
  ]);
  assert.deepEqual(page.fills, [
    { selector: 'input[name="mobile"]', value: "13800000000" },
    { selector: 'input[name="password"]', value: "secret" }
  ]);
  assert.deepEqual(page.clicks, ["button#J_loginBtn"]);
  assert.equal(result.currentUrl, "https://erp.91miaoshou.com/welcome");
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
    return "https://erp.91miaoshou.com/welcome";
  }

  async title() {
    return "妙手-欢迎使用";
  }
}
