import assert from "node:assert/strict";
import { test } from "node:test";

import { startNeobundGoogleLogin } from "../src/neobund-google-login.js";

test("startNeobundGoogleLogin clicks Google login and waits", async () => {
  const page = new FakePage();

  const result = await startNeobundGoogleLogin({
    pauseMs: 500,
    afterUrl: "https://www.neobund.ai/en/tiktok-management",
    afterClick: 'button:has-text("Create Publish Task")',
    screenshotPath: "data/page-inspections/neobund-google.png",
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
    },
    {
      url: "https://www.neobund.ai/en/tiktok-management",
      options: { waitUntil: "domcontentloaded", timeout: 60000 }
    }
  ]);
  assert.deepEqual(page.clicks, [
    'button:has-text("Sign in with your Google account")',
    'button:has-text("Create Publish Task")'
  ]);
  assert.deepEqual(page.waits, [500, 5000, 5000]);
  assert.equal(result.currentUrl, "https://accounts.google.com/");
  assert.equal(page.closed, true);
  assert.deepEqual(result.report.candidates.buttons, ['button:has-text("Create Post")']);
  assert.equal(result.report.screenshotPath, "data/page-inspections/neobund-google.png");
});

test("startNeobundGoogleLogin falls back to another open page when the first page closes", async () => {
  const closedPage = {
    async goto() {},
    locator() {
      return {
        click: async () => {}
      };
    },
    async waitForTimeout() {
      throw new Error("Target page, context or browser has been closed");
    }
  };
  const activePage = new FakePage();

  const result = await startNeobundGoogleLogin({
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
  assert.equal(result.currentUrl, "https://accounts.google.com/");
  assert.equal(activePage.closed, true);
});

class FakePage {
  constructor() {
    this.gotos = [];
    this.clicks = [];
    this.waits = [];
    this.closed = false;
  }

  async goto(url, options) {
    this.gotos.push({ url, options });
  }

  locator(selector) {
    return {
      click: async () => this.clicks.push(selector)
    };
  }

  async waitForTimeout(ms) {
    this.waits.push(ms);
  }

  async $$eval(selector, callback) {
    assert.equal(selector, "input, textarea, button, [role=button], a");
    return callback([
      {
        tagName: "BUTTON",
        id: "",
        textContent: "Create Post",
        getAttribute: () => ""
      }
    ]);
  }

  async screenshot() {}

  url() {
    return "https://accounts.google.com/";
  }

  async title() {
    return "Google Sign In";
  }
}
