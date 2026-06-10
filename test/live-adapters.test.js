import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";

import { createLiveAdapters } from "../src/adapters/live-adapters.js";
import { validateConfig } from "../src/config.js";

const liveAutomation = {
  miaoshou: {
    ordersUrl: "https://example.test/orders",
    orderRow: ".order-row",
    fields: {
      orderId: ".order-id",
      productId: ".product-id",
      productName: ".product-name",
      category: ".category",
      mainImage: ".main-image"
    }
  },
  gemini: {
    gemUrl: "https://example.test/gem",
    imageInput: "input[type=file]",
    promptInput: "textarea",
    submitButton: "button.submit",
    outputSelector: ".answer"
  },
  tiktokCreativeStudio: {
    imageToVideoUrl: "https://example.test/image-to-video",
    imageInput: "input[type=file]",
    promptInput: "textarea",
    modelName: "Dreamina Seedance 2.0",
    durationSeconds: 15,
    generateButton: "button.generate",
    downloadButton: "button.download"
  },
  neobund: {
    managementUrl: "https://example.test/neobund",
    accountSearchInput: "input.account",
    accountOption: ".account-option",
    uploadInput: "input[type=file]",
    captionInput: "textarea.caption",
    publishButton: "button.publish"
  }
};

test("validateConfig requires live selector mappings when liveAutomation is present", () => {
  assert.throws(
    () =>
      validateConfig({
        videoCountPerProduct: 10,
        categoryAccounts: {
          Beauty: {
            neobundAccount: "beauty",
            tiktokAccount: "@beauty",
            captionTemplate: "{productName}"
          }
        },
        liveAutomation: {
          miaoshou: {
            ordersUrl: "https://example.test/orders"
          }
        }
      }),
    /liveAutomation\.miaoshou\.orderRow is required/
  );

  assert.doesNotThrow(() =>
    validateConfig({
      videoCountPerProduct: 10,
      categoryAccounts: {
        Beauty: {
          neobundAccount: "beauty",
          tiktokAccount: "@beauty",
          captionTemplate: "{productName}"
        }
      },
      liveAutomation
    })
  );
});

test("Miaoshou live adapter reads orders from configured row selectors", async () => {
  const page = new FakePage({
    rows: [
      {
        ".order-id": "order-1",
        ".product-id": "p-1",
        ".product-name": "LED Mirror",
        ".category": "Home Decor",
        ".main-image": "https://example.test/mirror.jpg"
      }
    ]
  });
  const adapters = createLiveAdapters({
    config: { liveAutomation },
    browserFactory: fakeBrowserFactory(page),
    credentialsReader: () => ({ username: "u", password: "p" })
  });

  const orders = await adapters.miaoshou.listOrdersSinceLastRun();

  assert.deepEqual(orders, [
    {
      orderId: "order-1",
      productId: "p-1",
      productName: "LED Mirror",
      category: "Home Decor",
      mainImage: "https://example.test/mirror.jpg"
    }
  ]);
  assert.deepEqual(page.gotos, ["https://example.test/orders"]);
});

test("Miaoshou live adapter reads sold products from the order API", async () => {
  const page = new FakePage({
    apiResponse: {
      packageList: [
        {
          platformOrderSn: "576907319659305314",
          productCode: "TikTok_Online_Other",
          site: "DE",
          consigneeInfo: { country: "DE" },
          items: {
            "1860850012": {
              platformItemId: "1729804418818808371",
              title: "Shockproof phone case for iPhone",
              picUrl: "https://example.test/swimsuit.jpg"
            }
          }
        }
      ]
    }
  });
  const adapters = createLiveAdapters({
    config: {
      liveAutomation: {
        ...liveAutomation,
        miaoshou: {
          ordersUrl: "https://example.test/order/package/index",
          orderApiUrl: "https://example.test/api/order/package/render_list/searchOrderPackageList"
        }
      }
    },
    browserFactory: fakeBrowserFactory(page),
    credentialsReader: () => ({ username: "u", password: "p" })
  });

  const orders = await adapters.miaoshou.listOrdersSinceLastRun();

  assert.deepEqual(orders, [
    {
      orderId: "576907319659305314",
      productId: "1729804418818808371",
      productName: "Shockproof phone case for iPhone",
      category: "Phone Case",
      mainImage: "https://example.test/swimsuit.jpg",
      site: "DE",
      country: "DE"
    }
  ]);
  assert.equal(page.apiCalls[0].orderApiUrl, "https://example.test/api/order/package/render_list/searchOrderPackageList");
});

test("Miaoshou live adapter classifies digital products", async () => {
  const page = new FakePage({
    apiResponse: {
      packageList: [
        {
          platformOrderSn: "order-digital",
          productCode: "TikTok_Online_Other",
          site: "DE",
          consigneeInfo: { country: "DE" },
          items: {
            "item-1": {
              platformItemId: "digital-1",
              title: "Fast USB charging cable",
              picUrl: "https://example.test/cable.jpg"
            }
          }
        }
      ]
    }
  });
  const adapters = createLiveAdapters({
    config: {
      liveAutomation: {
        ...liveAutomation,
        miaoshou: {
          ordersUrl: "https://example.test/order/package/index",
          orderApiUrl: "https://example.test/api/order/package/render_list/searchOrderPackageList"
        }
      }
    },
    browserFactory: fakeBrowserFactory(page),
    credentialsReader: () => ({ username: "u", password: "p" })
  });

  const orders = await adapters.miaoshou.listOrdersSinceLastRun();

  assert.equal(orders[0].category, "Digital");
  assert.equal(orders[0].site, "DE");
});

test("Miaoshou live adapter classifies wearable apparel products", async () => {
  const page = new FakePage({
    apiResponse: {
      packageList: [
        {
          platformOrderSn: "order-apparel",
          productCode: "TikTok_Online_Other",
          site: "FR",
          consigneeInfo: { country: "FR" },
          items: {
            "item-1": {
              platformItemId: "apparel-1",
              title: "Women summer dress with scarf",
              picUrl: "https://example.test/dress.jpg"
            }
          }
        }
      ]
    }
  });
  const adapters = createLiveAdapters({
    config: {
      liveAutomation: {
        ...liveAutomation,
        miaoshou: {
          ordersUrl: "https://example.test/order/package/index",
          orderApiUrl: "https://example.test/api/order/package/render_list/searchOrderPackageList"
        }
      }
    },
    browserFactory: fakeBrowserFactory(page),
    credentialsReader: () => ({ username: "u", password: "p" })
  });

  const orders = await adapters.miaoshou.listOrdersSinceLastRun();

  assert.equal(orders[0].category, "Apparel");
  assert.equal(orders[0].site, "FR");
});

test("Miaoshou live adapter classifies rash guard swimwear as apparel", async () => {
  const page = new FakePage({
    apiResponse: {
      packageList: [
        {
          platformOrderSn: "order-swimwear",
          productCode: "TikTok_Online_Other",
          site: "DE",
          consigneeInfo: { country: "DE" },
          items: {
            "item-1": {
              platformItemId: "swimwear-1",
              title: "Slimming Sporty One-Piece Rash Guard Swimsuit for surfing",
              picUrl: "https://example.test/swimwear.jpg"
            }
          }
        }
      ]
    }
  });
  const adapters = createLiveAdapters({
    config: {
      liveAutomation: {
        ...liveAutomation,
        miaoshou: {
          ordersUrl: "https://example.test/order/package/index",
          orderApiUrl: "https://example.test/api/order/package/render_list/searchOrderPackageList"
        }
      }
    },
    browserFactory: fakeBrowserFactory(page),
    credentialsReader: () => ({ username: "u", password: "p" })
  });

  const orders = await adapters.miaoshou.listOrdersSinceLastRun();

  assert.equal(orders[0].category, "Apparel");
  assert.equal(orders[0].site, "DE");
});

test("Miaoshou live adapter classifies accessories and bags", async () => {
  const page = new FakePage({
    apiResponse: {
      packageList: [
        {
          platformOrderSn: "order-accessory",
          productCode: "TikTok_Online_Other",
          site: "DE",
          consigneeInfo: { country: "DE" },
          items: {
            "item-1": {
              platformItemId: "accessory-1",
              title: "Gold necklace shoulder bag",
              picUrl: "https://example.test/accessory.jpg"
            }
          }
        }
      ]
    }
  });
  const adapters = createLiveAdapters({
    config: {
      liveAutomation: {
        ...liveAutomation,
        miaoshou: {
          ordersUrl: "https://example.test/order/package/index",
          orderApiUrl: "https://example.test/api/order/package/render_list/searchOrderPackageList"
        }
      }
    },
    browserFactory: fakeBrowserFactory(page),
    credentialsReader: () => ({ username: "u", password: "p" })
  });

  const orders = await adapters.miaoshou.listOrdersSinceLastRun();

  assert.equal(orders[0].category, "Accessories");
  assert.equal(orders[0].site, "DE");
});

test("Gemini live adapter extracts exactly the requested prompt count", async () => {
  const page = new FakePage({
    text: [
      "1. Hook with room makeover",
      "2. Show before and after",
      "3. Focus on mirror light",
      "4. Gift angle",
      "5. Night routine angle"
    ].join("\n")
  });
  const adapters = createLiveAdapters({
    config: { liveAutomation },
    browserFactory: fakeBrowserFactory(page),
    credentialsReader: () => ({ username: "u", password: "p" })
  });

  const prompts = await adapters.gemini.createPrompts({
    product: {
      productName: "LED Mirror",
      category: "Home Decor",
      mainImage: "C:/tmp/mirror.jpg"
    },
    count: 5
  });

  assert.equal(prompts.length, 5);
  assert.equal(prompts[0], "Hook with room makeover");
  assert.ok(page.fills.some((entry) => entry.selector === "textarea"));
});

test("TikTok live adapter returns the downloaded file path", async () => {
  const downloadPath = await createFakeDownload("video-1.mp4");
  const page = new FakePage({
    downloadPath
  });
  const adapters = createLiveAdapters({
    config: { liveAutomation },
    browserFactory: fakeBrowserFactory(page),
    credentialsReader: () => ({ username: "u", password: "p" })
  });

  const video = await adapters.tiktokCreativeStudio.createVideo({
    product: {
      productId: "p-1",
      productName: "LED Mirror",
      category: "Home Decor",
      mainImage: tinyImageDataUrl()
    },
    prompt: "Make a video",
    index: 0
  });

  assert.deepEqual(video, { filePath: "data/generated-videos/p-1/tiktok-video-1.mp4" });
  assert.ok(page.uploads.some((entry) => entry.selector === "input[type=file]"));
  assert.ok(page.textClicks.includes("Dreamina Seedance 2.0"));
  assert.ok(page.textClicks.includes("15s"));
  assert.ok(page.clicks.includes("button.generate"));
  assert.ok(page.clicks.includes("button.download"));
});

test("Live adapters use TikTok Creative Studio as the video creator", async () => {
  const downloadPath = await createFakeDownload("video-2.mp4");
  const page = new FakePage({
    downloadPath
  });
  const adapters = createLiveAdapters({
    config: { liveAutomation },
    browserFactory: fakeBrowserFactory(page),
    credentialsReader: () => ({ username: "u", password: "p" })
  });

  await adapters.videoCreator.createVideo({
    product: {
      productId: "p-2",
      productName: "Beach swimsuit",
      category: "Apparel",
      mainImage: tinyImageDataUrl()
    },
    prompt: "15 second storyboard",
    index: 0
  });

  assert.equal(page.gotos[0], "https://example.test/image-to-video");
  assert.ok(page.clicks.includes("button.generate"));
});

test("Neobund live publisher only publishes confirmed videos", async () => {
  const page = new FakePage({});
  const adapters = createLiveAdapters({
    config: { liveAutomation },
    browserFactory: fakeBrowserFactory(page),
    credentialsReader: () => ({ username: "u", password: "p" })
  });

  const queued = await adapters.neobund.enqueueForConfirmation({
    videoId: "p-1-1"
  });
  assert.equal(queued.confirmationId, "local-p-1-1");
  assert.equal(page.clicks.length, 0);

  const published = await adapters.neobund.publishConfirmed({
    videoId: "p-1-1",
    filePath: "D:/downloads/video.mp4",
    caption: "caption",
    targetAccount: {
      neobundAccount: "home-neobund"
    }
  });

  assert.equal(published.status, "published");
  assert.ok(page.clicks.includes("button.publish"));
});

function fakeBrowserFactory(page) {
  return async () => ({
    newPage: async () => page,
    close: async () => {
      page.closed = true;
    }
  });
}

async function createFakeDownload(name) {
  await mkdir("data/test-downloads", { recursive: true });
  const path = `data/test-downloads/${name}`;
  await writeFile(path, "fake mp4");
  return path;
}

function tinyImageDataUrl() {
  return "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";
}

class FakePage {
  constructor({ rows = [], text = "", downloadPath = "D:/video.mp4", apiResponse = null }) {
    this.rows = rows;
    this.text = text;
    this.downloadPath = downloadPath;
    this.apiResponse = apiResponse;
    this.gotos = [];
    this.fills = [];
    this.clicks = [];
    this.textClicks = [];
    this.uploads = [];
    this.apiCalls = [];
    this.closed = false;
  }

  async goto(url) {
    this.gotos.push(url);
  }

  async waitForSelector() {}

  async waitForLoadState() {}

  async $$eval(selector, callback, fields) {
    assert.equal(selector, ".order-row");
    const rowElements = this.rows.map((row) => ({
      querySelector: (fieldSelector) => ({
        textContent: row[fieldSelector] ?? "",
        getAttribute: () => row[fieldSelector] ?? ""
      })
    }));
    return callback(rowElements, fields);
  }

  async evaluate(callback, payload) {
    this.apiCalls.push(payload);
    return this.apiResponse;
  }

  locator(selector) {
    return {
      fill: async (value) => this.fills.push({ selector, value }),
      setInputFiles: async (value) => this.uploads.push({ selector, value }),
      click: async () => this.clicks.push(selector),
      textContent: async () => this.text
    };
  }

  getByText(text) {
    return {
      first: () => ({
        click: async () => this.textClicks.push(text)
      })
    };
  }

  async fill(selector, value) {
    this.fills.push({ selector, value });
  }

  async setInputFiles(selector, value) {
    this.uploads.push({ selector, value });
  }

  async click(selector) {
    this.clicks.push(selector);
  }

  async textContent() {
    return this.text;
  }

  async waitForEvent(eventName) {
    assert.equal(eventName, "download");
    return {
      path: async () => this.downloadPath
    };
  }
}
