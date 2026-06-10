import assert from "node:assert/strict";
import { test } from "node:test";

import { holdLoginSession } from "../src/login-session.js";

test("holdLoginSession opens the target url and waits before returning page state", async () => {
  const page = new FakePage();

  const result = await holdLoginSession({
    url: "https://www.neobund.ai/zh/tiktok-management",
    pauseMs: 500,
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
  assert.deepEqual(page.waits, [500]);
  assert.equal(result.currentUrl, "https://www.neobund.ai/zh/tiktok-management");
  assert.equal(result.title, "Management");
  assert.equal(page.closed, true);
});

test("holdLoginSession falls back to another open page when the first page closes", async () => {
  const closedPage = {
    async goto() {},
    async waitForTimeout() {
      throw new Error("Target page, context or browser has been closed");
    }
  };
  const activePage = new FakePage();
  activePage.urlValue = "https://www.neobund.ai/zh/tiktok-management";

  const result = await holdLoginSession({
    url: "https://www.neobund.ai/zh/tiktok-management",
    pauseMs: 500,
    browserFactory: async () => ({
      newPage: async () => closedPage,
      pages: () => [closedPage, activePage],
      close: async () => {
        activePage.closed = true;
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.currentUrl, "https://www.neobund.ai/zh/tiktok-management");
  assert.equal(activePage.closed, true);
});

class FakePage {
  constructor() {
    this.gotos = [];
    this.waits = [];
    this.closed = false;
    this.urlValue = "";
  }

  async goto(url, options) {
    this.gotos.push({ url, options });
    this.urlValue = url;
  }

  async waitForTimeout(ms) {
    this.waits.push(ms);
  }

  url() {
    return this.urlValue;
  }

  async title() {
    return "Management";
  }
}
