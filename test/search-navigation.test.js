import assert from "node:assert/strict";
import { test } from "node:test";

import { inspectAfterClickAndKeyboardSearch, inspectAfterSearch } from "../src/search-navigation.js";

test("inspectAfterSearch fills search text, presses Enter, waits, and reports selectors", async () => {
  const page = new FakePage();

  const report = await inspectAfterSearch({
    url: "https://erp.91miaoshou.com/welcome",
    section: "miaoshou-search",
    searchSelector: "input#search",
    query: "订单",
    pauseMs: 100,
    browserFactory: async () => ({
      newPage: async () => page,
      close: async () => {
        page.closed = true;
      }
    })
  });

  assert.deepEqual(page.fills, [{ selector: "input#search", value: "订单" }]);
  assert.deepEqual(page.keys, ["Enter"]);
  assert.equal(report.section, "miaoshou-search");
  assert.equal(page.closed, true);
});

test("inspectAfterClickAndKeyboardSearch clicks opener then types query with keyboard", async () => {
  const page = new FakePage();

  const report = await inspectAfterClickAndKeyboardSearch({
    url: "https://erp.91miaoshou.com/welcome",
    section: "miaoshou-keyboard-search",
    clickSelector: "button.search",
    query: "订单",
    pauseMs: 100,
    browserFactory: async () => ({
      newPage: async () => page,
      close: async () => {
        page.closed = true;
      }
    })
  });

  assert.deepEqual(page.clicks, ["button.search"]);
  assert.deepEqual(page.typed, ["订单"]);
  assert.deepEqual(page.keys, ["Enter"]);
  assert.equal(report.section, "miaoshou-keyboard-search");
  assert.equal(page.closed, true);
});

class FakePage {
  constructor() {
    this.fills = [];
    this.clicks = [];
    this.typed = [];
    this.keys = [];
    this.closed = false;
    this.keyboard = {
      type: async (value) => this.typed.push(value),
      press: async (key) => this.keys.push(key)
    };
  }

  async goto() {}

  locator(selector) {
    return {
      fill: async (value) => this.fills.push({ selector, value }),
      press: async (key) => this.keys.push(key),
      click: async () => this.clicks.push(selector)
    };
  }

  async waitForTimeout() {}

  async $$eval() {
    return [];
  }

  url() {
    return "https://erp.91miaoshou.com/welcome";
  }

  async title() {
    return "Miaoshou";
  }

  async screenshot() {}
}
