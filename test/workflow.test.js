import assert from "node:assert/strict";
import { test } from "node:test";

import { buildWorkflowPlan, cleanupDemoData, refreshPendingAccountMappings, runWorkflow } from "../src/workflow.js";
import { MemoryStore } from "../src/memory-store.js";

const config = {
  videoCountPerProduct: 10,
  categorySiteAccounts: {
    "Phone Case:DE": {
      neobundAccount: "hertermarwee.shop3",
      tiktokAccount: "@hertermarwee.shop3",
      captionTemplate: "{productName} phone case for {site} #phonecase #handyhulle"
    },
    "Digital:DE": {
      neobundAccount: "hertermarwee.shop3",
      tiktokAccount: "@hertermarwee.shop3",
      captionTemplate: "{productName} digital for {site} #tech"
    },
    "Accessories:DE": {
      neobundAccount: "hertermarwee.shop7",
      tiktokAccount: "@hertermarwee.shop7",
      captionTemplate: "{productName} accessory for {site} #accessories"
    },
    "Apparel:DE": {
      neobundAccount: "hertermarwee.shop4",
      tiktokAccount: "@hertermarwee.shop4",
      captionTemplate: "{productName} apparel for {site} #fashion"
    }
  },
  siteAccounts: {
    DE: {
      neobundAccount: "hertmarwee.shop",
      tiktokAccount: "@hertmarwee.shop",
      captionTemplate: "{productName} default for {site}"
    }
  },
  categoryAccounts: {
    "Home Decor": {
      neobundAccount: "home-neobund",
      tiktokAccount: "@home_shop",
      captionTemplate: "{productName} home upgrade #homedecor"
    },
    Beauty: {
      neobundAccount: "beauty-neobund",
      tiktokAccount: "@beauty_shop",
      captionTemplate: "{productName} daily routine #beauty"
    }
  }
};

test("buildWorkflowPlan creates ten pending videos for each ordered product", async () => {
  const orders = [
    {
      orderId: "order-1",
      productId: "p-1",
      productName: "LED Mirror",
      category: "Home Decor",
      mainImage: "https://example.test/mirror.jpg"
    },
    {
      orderId: "order-2",
      productId: "p-2",
      productName: "Lip Gloss",
      category: "Beauty",
      mainImage: "https://example.test/gloss.jpg"
    }
  ];

  const plan = buildWorkflowPlan({ orders, config, processedProductIds: new Set() });

  assert.equal(plan.products.length, 2);
  assert.equal(plan.videos.length, 20);
  assert.equal(plan.videos.filter((video) => video.productId === "p-1").length, 10);
  assert.equal(plan.videos.filter((video) => video.productId === "p-2").length, 10);
  assert.ok(plan.videos.every((video) => video.status === "pending_confirmation"));
  assert.ok(plan.videos.every((video) => video.targetAccount.tiktokAccount.startsWith("@")));
});

test("buildWorkflowPlan deduplicates products and skips products already processed", async () => {
  const orders = [
    {
      orderId: "order-1",
      productId: "p-1",
      productName: "LED Mirror",
      category: "Home Decor",
      mainImage: "https://example.test/mirror.jpg"
    },
    {
      orderId: "order-2",
      productId: "p-1",
      productName: "LED Mirror",
      category: "Home Decor",
      mainImage: "https://example.test/mirror.jpg"
    },
    {
      orderId: "order-3",
      productId: "p-processed",
      productName: "Old Item",
      category: "Beauty",
      mainImage: "https://example.test/old.jpg"
    }
  ];

  const plan = buildWorkflowPlan({
    orders,
    config,
    processedProductIds: new Set(["p-processed"])
  });

  assert.deepEqual(
    plan.products.map((product) => product.productId),
    ["p-1"]
  );
  assert.equal(plan.videos.length, 10);
});

test("buildWorkflowPlan blocks products without category account mapping", async () => {
  const orders = [
    {
      orderId: "order-1",
      productId: "p-1",
      productName: "Unknown Item",
      category: "Unknown",
      mainImage: "https://example.test/item.jpg"
    }
  ];

  assert.throws(
    () => buildWorkflowPlan({ orders, config, processedProductIds: new Set() }),
    /No account mapping configured for category "Unknown" and site ""/
  );
});

test("buildWorkflowPlan prefers category and region account mapping", async () => {
  const orders = [
    {
      orderId: "order-de-1",
      productId: "case-de-1",
      productName: "Shockproof phone case",
      category: "Phone Case",
      site: "DE",
      country: "DE",
      mainImage: "https://example.test/case.jpg"
    }
  ];

  const plan = buildWorkflowPlan({ orders, config, processedProductIds: new Set() });

  assert.equal(plan.videos.length, 10);
  assert.equal(plan.videos[0].targetAccount.neobundAccount, "hertermarwee.shop3");
  assert.match(plan.videos[0].caption, /phone case for DE/);
});

test("buildWorkflowPlan maps German digital products to hertermarwee.shop3", async () => {
  const orders = [
    {
      orderId: "order-de-digital-1",
      productId: "digital-de-1",
      productName: "Fast USB charging cable",
      category: "Digital",
      site: "DE",
      country: "DE",
      mainImage: "https://example.test/cable.jpg"
    }
  ];

  const plan = buildWorkflowPlan({ orders, config, processedProductIds: new Set() });

  assert.equal(plan.videos[0].targetAccount.neobundAccount, "hertermarwee.shop3");
  assert.match(plan.videos[0].caption, /digital for DE/);
});

test("buildWorkflowPlan maps wearable apparel and shoes to hertermarwee.shop4", async () => {
  const orders = [
    {
      orderId: "order-apparel-1",
      productId: "apparel-1",
      productName: "Women summer dress",
      category: "Apparel",
      site: "DE",
      country: "DE",
      mainImage: "https://example.test/dress.jpg"
    }
  ];

  const plan = buildWorkflowPlan({ orders, config, processedProductIds: new Set() });

  assert.equal(plan.videos[0].targetAccount.neobundAccount, "hertermarwee.shop4");
});

test("buildWorkflowPlan does not apply German apparel shop to non-German stores", async () => {
  const orders = [
    {
      orderId: "order-apparel-fr-1",
      productId: "apparel-fr-1",
      productName: "Women summer dress",
      category: "Apparel",
      site: "FR",
      country: "FR",
      mainImage: "https://example.test/dress.jpg"
    }
  ];

  assert.throws(
    () => buildWorkflowPlan({ orders, config, processedProductIds: new Set() }),
    /No account mapping configured for category "Apparel" and site "FR"/
  );
});

test("buildWorkflowPlan maps German accessories and bags to hertermarwee.shop7", async () => {
  const orders = [
    {
      orderId: "order-accessory-1",
      productId: "accessory-1",
      productName: "Gold necklace shoulder bag",
      category: "Accessories",
      site: "DE",
      country: "DE",
      mainImage: "https://example.test/accessory.jpg"
    }
  ];

  const plan = buildWorkflowPlan({ orders, config, processedProductIds: new Set() });

  assert.equal(plan.videos[0].targetAccount.neobundAccount, "hertermarwee.shop7");
});

test("buildWorkflowPlan maps other German products to hertmarwee.shop", async () => {
  const orders = [
    {
      orderId: "order-de-other-1",
      productId: "other-de-1",
      productName: "Kitchen storage box",
      category: "Unmapped",
      site: "DE",
      country: "DE",
      mainImage: "https://example.test/box.jpg"
    }
  ];

  const plan = buildWorkflowPlan({ orders, config, processedProductIds: new Set() });

  assert.equal(plan.videos[0].targetAccount.neobundAccount, "hertmarwee.shop");
  assert.match(plan.videos[0].caption, /default for DE/);
});

test("runWorkflow generates GPT prompts and queues them in Neobund without TikTok Creative Studio", async () => {
  const store = new MemoryStore();
  const orders = [
    {
      orderId: "order-1",
      productId: "p-1",
      productName: "LED Mirror",
      category: "Home Decor",
      mainImage: "https://example.test/mirror.jpg"
    }
  ];

  const result = await runWorkflow({
    config,
    store,
    adapters: {
      miaoshou: {
        listOrdersSinceLastRun: async () => orders
      },
      promptGenerator: {
        createPrompts: async ({ product, count }) =>
          Array.from({ length: count }, (_, index) => `Prompt ${index + 1} for ${product.productName}`),
        createCaptions: async ({ product, count }) =>
          Array.from({ length: count }, (_, index) => `German caption ${index + 1} for ${product.productName}\n#TikTokDeutschland #Produkttest`)
      },
      neobund: {
        enqueueForConfirmation: async (item) => ({
          confirmationId: `confirm-${item.productId}-${item.index + 1}`
        }),
        publishConfirmed: async () => {
          throw new Error("publish should not run during generation workflow");
        }
      }
    }
  });

  assert.equal(result.videos.length, 10);
  assert.ok(result.videos.every((video) => video.prompt.startsWith("Prompt")));
  assert.ok(result.videos.every((video) => video.caption.startsWith("German caption")));
  assert.ok(result.videos.every((video) => video.captionSource === "gpt"));
  assert.ok(result.videos.every((video) => video.filePath === undefined));
  assert.ok(result.videos.every((video) => video.confirmationId.startsWith("confirm-p-1")));
  assert.deepEqual(store.processedProductIds(), ["p-1"]);
  assert.equal(store.publishEvents.length, 0);
});

test("cleanupDemoData removes sample products and videos only", () => {
  const store = new MemoryStore({
    products: {
      "product-led-mirror": { productId: "product-led-mirror", productName: "LED Mirror" },
      real: { productId: "real", productName: "Real Product" }
    },
    videos: {
      "product-led-mirror-1": { productId: "product-led-mirror", productName: "LED Mirror" },
      "real-1": { productId: "real", productName: "Real Product" }
    }
  });

  const removed = cleanupDemoData(store);

  assert.equal(removed, 1);
  assert.deepEqual(Object.keys(store.products), ["real"]);
  assert.deepEqual(Object.keys(store.videos), ["real-1"]);
});

test("refreshPendingAccountMappings blocks videos without current account rules", () => {
  const store = new MemoryStore({
    videos: {
      "v-1": {
        videoId: "v-1",
        productId: "v-1",
        productName: "Women summer dress",
        category: "Apparel",
        site: "FR",
        status: "pending_confirmation"
      },
      "v-2": {
        videoId: "v-2",
        productId: "v-2",
        productName: "Fast USB charging cable",
        category: "Digital",
        site: "DE",
        status: "pending_confirmation"
      }
    }
  });

  const refreshed = refreshPendingAccountMappings(store, config);

  assert.deepEqual(refreshed, { updated: 1, blocked: 1 });
  assert.equal(store.videos["v-1"].status, "blocked_account_mapping");
  assert.equal(store.videos["v-2"].targetAccount.neobundAccount, "hertermarwee.shop3");
});

test("refreshPendingAccountMappings keeps GPT captions", () => {
  const store = new MemoryStore({
    videos: {
      "v-1": {
        videoId: "v-1",
        productId: "v-1",
        productName: "Fast USB charging cable",
        category: "Digital",
        site: "DE",
        status: "pending_confirmation",
        caption: "Sachlicher deutscher Titel\n#TikTokDeutschland #Technik",
        captionSource: "gpt"
      }
    }
  });

  refreshPendingAccountMappings(store, config);

  assert.equal(store.videos["v-1"].targetAccount.neobundAccount, "hertermarwee.shop3");
  assert.equal(store.videos["v-1"].caption, "Sachlicher deutscher Titel\n#TikTokDeutschland #Technik");
});
