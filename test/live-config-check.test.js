import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildLiveConfigStatus,
  collectPageSelectorReport,
  summarizeSelectorCandidates
} from "../src/live-config-check.js";

test("buildLiveConfigStatus reports missing liveAutomation section", () => {
  const status = buildLiveConfigStatus({});

  assert.equal(status.ready, false);
  assert.deepEqual(status.missing, ["liveAutomation"]);
});

test("buildLiveConfigStatus reports missing nested selector paths", () => {
  const status = buildLiveConfigStatus({
    liveAutomation: {
      miaoshou: {
        ordersUrl: "https://example.test/orders"
      }
    }
  });

  assert.equal(status.ready, false);
  assert.ok(status.missing.includes("liveAutomation.miaoshou.orderRow"));
  assert.ok(status.missing.includes("liveAutomation.neobund.publishButton"));
});

test("buildLiveConfigStatus marks complete live selector mapping ready", () => {
  const status = buildLiveConfigStatus({
    liveAutomation: completeLiveAutomation({
      miaoshouUrl: "https://miaoshou.example-real.test/orders",
      orderRow: '[data-testid="order-row"]',
      orderId: '[data-testid="order-id"]',
      productId: '[data-testid="product-id"]',
      productName: '[data-testid="product-name"]',
      category: '[data-testid="product-category"]',
      mainImage: '[data-testid="main-image"]',
      geminiUrl: "https://gemini.google.com/gem/real-product-video-gem",
      geminiOutput: '[data-testid="gemini-answer"]',
      tiktokUrl: "https://ads.tiktok.com/creative/creativestudio/image-to-video",
      tiktokGenerateButton: 'button:has-text("Generate")',
      tiktokDownloadButton: 'button:has-text("Download")',
      neobundUrl: "https://www.neobund.ai/zh/tiktok-management",
      neobundAccountOption: '[data-testid="account-option"]',
      neobundCaptionInput: '[data-testid="caption-input"]',
      neobundPublishButton: 'button:has-text("Publish")'
    })
  });

  assert.equal(status.ready, true);
  assert.deepEqual(status.missing, []);
  assert.deepEqual(status.placeholders, []);
});

test("buildLiveConfigStatus reports template placeholder values as not ready", () => {
  const status = buildLiveConfigStatus({
    liveAutomation: completeLiveAutomation()
  });

  assert.equal(status.ready, false);
  assert.ok(status.placeholders.includes("liveAutomation.miaoshou.ordersUrl"));
  assert.ok(status.placeholders.includes("liveAutomation.neobund.publishButton"));
});

test("summarizeSelectorCandidates groups common page elements", () => {
  const candidates = summarizeSelectorCandidates([
    { tag: "input", type: "file", id: "image", name: "", text: "", placeholder: "" },
    { tag: "input", type: "password", id: "password", name: "", text: "", placeholder: "" },
    { tag: "textarea", type: "", id: "", name: "prompt", text: "", placeholder: "Prompt" },
    { tag: "button", type: "", id: "", name: "", text: "Generate", placeholder: "" }
  ]);

  assert.deepEqual(candidates.fileInputs, ["input#image"]);
  assert.deepEqual(candidates.passwordInputs, ["input#password"]);
  assert.deepEqual(candidates.textInputs, ['textarea[name="prompt"]']);
  assert.deepEqual(candidates.buttons, ['button:has-text("Generate")']);
});

test("collectPageSelectorReport opens one page and returns candidate selectors", async () => {
  const page = new FakePage([
    { tag: "input", type: "file", id: "upload", name: "", text: "", placeholder: "" },
    { tag: "button", type: "", id: "", name: "", text: "Publish", placeholder: "" }
  ]);

  const report = await collectPageSelectorReport({
    section: "neobund",
    url: "https://www.neobund.ai/zh/tiktok-management",
    pauseMs: 100,
    screenshotPath: "data/page-inspections/neobund.png",
    browserFactory: async () => ({
      newPage: async () => page,
      close: async () => {
        page.closed = true;
      }
    })
  });

  assert.equal(report.section, "neobund");
  assert.equal(report.url, "https://www.neobund.ai/zh/tiktok-management");
  assert.equal(report.currentUrl, "https://www.neobund.ai/zh/tiktok-management");
  assert.equal(report.title, "Test Page");
  assert.deepEqual(page.gotos, ["https://www.neobund.ai/zh/tiktok-management"]);
  assert.deepEqual(page.waits, [100]);
  assert.deepEqual(page.screenshots, ["data/page-inspections/neobund.png"]);
  assert.equal(report.screenshotPath, "data/page-inspections/neobund.png");
  assert.deepEqual(report.candidates.fileInputs, ["input#upload"]);
  assert.deepEqual(report.candidates.buttons, ['button:has-text("Publish")']);
  assert.equal(page.closed, true);
});

test("collectPageSelectorReport returns an error report when navigation fails", async () => {
  const report = await collectPageSelectorReport({
    section: "neobund",
    url: "https://www.neobund.ai/zh/tiktok-management",
    browserFactory: async () => ({
      newPage: async () => ({
        async goto() {
          throw new Error("Target page, context or browser has been closed");
        }
      }),
      close: async () => {}
    })
  });

  assert.equal(report.section, "neobund");
  assert.equal(report.url, "https://www.neobund.ai/zh/tiktok-management");
  assert.equal(report.ok, false);
  assert.match(report.error, /Target page/);
});

test("collectPageSelectorReport falls back to another open page when the first page closes during wait", async () => {
  const closedPage = {
    async goto() {},
    async waitForTimeout() {
      throw new Error("Target page, context or browser has been closed");
    }
  };
  const activePage = new FakePage([
    { tag: "button", type: "", id: "", name: "", text: "Create Post", placeholder: "" }
  ]);
  activePage.urlValue = "https://www.neobund.ai/zh/tiktok-management";

  const report = await collectPageSelectorReport({
    section: "neobund",
    url: "https://www.neobund.ai/zh/tiktok-management",
    pauseMs: 100,
    browserFactory: async () => ({
      newPage: async () => closedPage,
      pages: () => [closedPage, activePage],
      close: async () => {}
    })
  });

  assert.equal(report.ok, true);
  assert.equal(report.currentUrl, "https://www.neobund.ai/zh/tiktok-management");
  assert.deepEqual(report.candidates.buttons, ['button:has-text("Create Post")']);
});

test("collectPageSelectorReport uses domcontentloaded navigation", async () => {
  const page = new FakePage([]);

  await collectPageSelectorReport({
    section: "example",
    url: "https://example.com",
    browserFactory: async () => ({
      newPage: async () => page,
      close: async () => {}
    })
  });

  assert.deepEqual(page.gotoOptions, [{ waitUntil: "domcontentloaded", timeout: 60000 }]);
});

test("collectPageSelectorReport retries element collection after navigation destroys context", async () => {
  const page = new FakePage([
    { tag: "button", type: "", id: "", name: "", text: "Publish", placeholder: "" }
  ]);
  page.failFirstEval = true;

  const report = await collectPageSelectorReport({
    section: "neobund",
    url: "https://www.neobund.ai/zh/tiktok-management",
    browserFactory: async () => ({
      newPage: async () => page,
      close: async () => {}
    })
  });

  assert.equal(report.ok, true);
  assert.equal(page.evalAttempts, 3);
  assert.deepEqual(report.candidates.buttons, ['button:has-text("Publish")']);
});

function completeLiveAutomation(overrides = {}) {
  return {
    miaoshou: {
      ordersUrl: overrides.miaoshouUrl ?? "https://example.test/orders",
      orderRow: overrides.orderRow ?? ".order-row",
      fields: {
        orderId: overrides.orderId ?? ".order-id",
        productId: overrides.productId ?? ".product-id",
        productName: overrides.productName ?? ".product-name",
        category: overrides.category ?? ".category",
        mainImage: overrides.mainImage ?? ".main-image"
      }
    },
    gemini: {
      gemUrl: overrides.geminiUrl ?? "https://example.test/gem",
      imageInput: "input[type=file]",
      promptInput: "textarea",
      submitButton: "button.submit",
      outputSelector: overrides.geminiOutput ?? ".answer"
    },
    tiktokCreativeStudio: {
      imageToVideoUrl: overrides.tiktokUrl ?? "https://example.test/image-to-video",
      imageInput: "input[type=file]",
      promptInput: "textarea",
      generateButton: overrides.tiktokGenerateButton ?? "button.generate",
      downloadButton: overrides.tiktokDownloadButton ?? "button.download"
    },
    neobund: {
      managementUrl: overrides.neobundUrl ?? "https://example.test/neobund",
      accountSearchInput: "input.account",
      accountOption: overrides.neobundAccountOption ?? ".account-option",
      uploadInput: "input[type=file]",
      captionInput: overrides.neobundCaptionInput ?? "textarea.caption",
      publishButton: overrides.neobundPublishButton ?? "button.publish"
    }
  };
}

class FakePage {
  constructor(elements) {
    this.elements = elements;
    this.gotos = [];
    this.waits = [];
    this.screenshots = [];
    this.gotoOptions = [];
    this.evalAttempts = 0;
    this.failFirstEval = false;
    this.closed = false;
  }

  async goto(url, options) {
    this.gotos.push(url);
    this.gotoOptions.push(options);
    this.urlValue = url;
  }

  url() {
    return this.urlValue;
  }

  async title() {
    return "Test Page";
  }

  async waitForTimeout(ms) {
    this.waits.push(ms);
  }

  async screenshot({ path }) {
    this.screenshots.push(path);
  }

  async $$eval(selector, callback) {
    this.evalAttempts += 1;
    if (this.failFirstEval && this.evalAttempts === 1) {
      throw new Error("Execution context was destroyed, most likely because of a navigation");
    }
    assert.equal(selector, "input, textarea, button, [role=button], a");
    const nodes = this.elements.map((element) => ({
      tagName: element.tag.toUpperCase(),
      id: element.id,
      textContent: element.text,
      getAttribute: (name) => element[name] ?? ""
    }));
    return callback(nodes);
  }
}
