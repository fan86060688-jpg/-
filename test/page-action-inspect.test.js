import assert from "node:assert/strict";
import { test } from "node:test";

import { inspectPageAfterAction } from "../src/page-action-inspect.js";

test("inspectPageAfterAction opens a page, clicks an element, waits, and reports selectors", async () => {
  const page = new FakePage([
    { tag: "input", type: "file", id: "video", name: "", text: "", placeholder: "" },
    { tag: "button", type: "", id: "", name: "", text: "Publish", placeholder: "" }
  ]);

  const report = await inspectPageAfterAction({
    section: "neobund-create",
    url: "https://www.neobund.ai/en/tiktok-management",
    clickSelector: 'button:has-text("publishCreate Publish Task")',
    pauseMs: 100,
    browserFactory: async () => ({
      newPage: async () => page,
      close: async () => {
        page.closed = true;
      }
    })
  });

  assert.deepEqual(page.clicks, ['button:has-text("publishCreate Publish Task")']);
  assert.deepEqual(page.waits, [100]);
  assert.equal(report.section, "neobund-create");
  assert.deepEqual(report.candidates.fileInputs, ["input#video"]);
  assert.deepEqual(report.candidates.buttons, ['button:has-text("Publish")']);
  assert.equal(page.closed, true);
});

class FakePage {
  constructor(elements) {
    this.elements = elements;
    this.clicks = [];
    this.waits = [];
    this.closed = false;
  }

  async goto() {}

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
    const nodes = this.elements.map((element) => ({
      tagName: element.tag.toUpperCase(),
      id: element.id,
      textContent: element.text,
      getAttribute: (name) => element[name] ?? ""
    }));
    return callback(nodes);
  }

  url() {
    return "https://www.neobund.ai/en/tiktok-management";
  }

  async title() {
    return "TikTok Publish";
  }

  async screenshot() {}
}
