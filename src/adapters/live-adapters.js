import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";

import { readCredentials } from "../credentials.js";
import { createOpenAIPromptAdapter } from "./openai-prompts.js";

const URLS = {
  tiktokImageToVideo: "https://ads.tiktok.com/creative/creativestudio/image-to-video",
  neobund: "https://www.neobund.ai/zh/tiktok-management"
};

export function createLiveAdapters({ browserFactory, config = {}, credentialsReader = readCredentials }) {
  const selectors = config.liveAutomation ?? {};
  return {
    miaoshou: new MiaoshouAdapter({ browserFactory, selectors: selectors.miaoshou, credentialsReader }),
    promptGenerator: createOpenAIPromptAdapter({ model: config.openai?.model }),
    gemini: new GeminiGemAdapter({ browserFactory, selectors: selectors.gemini, credentialsReader }),
    tiktokCreativeStudio: new TiktokCreativeStudioAdapter({
      browserFactory,
      selectors: selectors.tiktokCreativeStudio,
      credentialsReader
    }),
    videoCreator: new TiktokCreativeStudioAdapter({
      browserFactory,
      selectors: selectors.tiktokCreativeStudio,
      credentialsReader
    }),
    neobund: new NeobundAdapter({ browserFactory, selectors: selectors.neobund, credentialsReader })
  };
}

class MiaoshouAdapter {
  constructor({ browserFactory, selectors, credentialsReader }) {
    this.browserFactory = browserFactory;
    this.selectors = selectors;
    this.credentialsReader = credentialsReader;
  }

  async listOrdersSinceLastRun() {
    ensureSelectors("miaoshou", this.selectors);
    return withPage(this.browserFactory, async (page) => {
      if (this.selectors.orderApiUrl) {
        return this.listOrdersFromApi(page);
      }
      await page.goto(this.selectors.ordersUrl);
      await page.waitForSelector(this.selectors.orderRow);
      return page.$$eval(
        this.selectors.orderRow,
        (rows, fields) =>
          rows.map((row) => {
            const value = (selector) => {
              const element = row.querySelector(selector);
              return (element?.getAttribute("src") || element?.textContent || "").trim();
            };
            return {
              orderId: value(fields.orderId),
              productId: value(fields.productId),
              productName: value(fields.productName),
              category: value(fields.category),
              mainImage: value(fields.mainImage)
            };
          }),
        this.selectors.fields
      );
    });
  }

  async listOrdersFromApi(page) {
    await page.goto(this.selectors.ordersUrl);
    const data = await page.evaluate(
      async ({ orderApiUrl, requestBody }) => {
        const body = new URLSearchParams(requestBody);
        const response = await fetch(orderApiUrl, {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
          },
          body
        });
        if (!response.ok) {
          throw new Error(`Miaoshou order API returned HTTP ${response.status}`);
        }
        return response.json();
      },
      {
        orderApiUrl: this.selectors.orderApiUrl,
        requestBody: this.orderApiRequestBody()
      }
    );
    return normalizeMiaoshouPackages(data.packageList ?? [], this.selectors.defaultCategory);
  }

  orderApiRequestBody() {
    return {
      pageSize: this.selectors.pageSize ?? 50,
      page: 1,
      source: "orderProcess",
      purchaseTab: "waitPurchase",
      appPackageTab: this.selectors.appPackageTab ?? "waitProcess",
      sortField: "gmtOrderStart",
      sortType: "desc",
      waitProcessTab: "all",
      supplierProcessStatus: "all",
      isLogisticsCompanyGroupMode: 1,
      priceType: "profit"
    };
  }
}

class GeminiGemAdapter {
  constructor({ browserFactory, selectors, credentialsReader }) {
    this.browserFactory = browserFactory;
    this.selectors = selectors;
    this.credentialsReader = credentialsReader;
  }

  async createPrompts({ product, count }) {
    this.credentialsReader("gemini");
    ensureSelectors("gemini", this.selectors);
    return withPage(this.browserFactory, async (page) => {
      await page.goto(this.selectors.gemUrl);
      await setInputFiles(page, this.selectors.imageInput, product.mainImage);
      await fill(page, this.selectors.promptInput, geminiInstruction(product, count));
      await click(page, this.selectors.submitButton);
      await page.waitForSelector(this.selectors.outputSelector);
      const text = await textContent(page, this.selectors.outputSelector);
      const prompts = parsePromptList(text).slice(0, count);
      if (prompts.length < count) {
        throw new Error(`Gemini returned ${prompts.length} prompts, expected ${count}`);
      }
      return prompts;
    });
  }
}

class TiktokCreativeStudioAdapter {
  constructor({ browserFactory, selectors, credentialsReader }) {
    this.browserFactory = browserFactory;
    this.selectors = selectors;
    this.credentialsReader = credentialsReader;
  }

  async createVideo({ product, prompt, index }) {
    this.credentialsReader("tiktok");
    ensureSelectors("tiktokCreativeStudio", this.selectors);
    return withPage(this.browserFactory, async (page) => {
      await page.goto(this.selectors.imageToVideoUrl ?? URLS.tiktokImageToVideo);
      await page.waitForLoadState?.("domcontentloaded");
      const imagePath = await downloadToFile(
        product.mainImage,
        `data/tiktok-inputs/${safeFileName(product.productId)}/source-${index + 1}${extensionForUrl(product.mainImage)}`
      );
      await setInputFiles(page, this.selectors.imageInput, imagePath);
      await chooseByText(page, this.selectors.modelName ?? "Dreamina Seedance 2.0", this.selectors.modelButton);
      await chooseDuration(page, this.selectors.durationSeconds ?? 15, this.selectors.durationButton);
      await fill(page, this.selectors.promptInput, prompt);
      await click(page, this.selectors.generateButton);
      if (this.selectors.resultReadySelector) {
        await page.waitForSelector(this.selectors.resultReadySelector, {
          timeout: Number(this.selectors.generationTimeoutMs ?? 600000)
        });
      }
      const downloadPromise = page.waitForEvent("download", {
        timeout: Number(this.selectors.downloadTimeoutMs ?? 180000)
      });
      await click(page, this.selectors.downloadButton);
      const download = await downloadPromise;
      const temporaryPath = await download.path();
      const filePath = `data/generated-videos/${safeFileName(product.productId)}/tiktok-video-${index + 1}.mp4`;
      await mkdir(dirname(filePath), { recursive: true });
      await rename(temporaryPath, filePath);
      return { filePath };
    });
  }
}

class NeobundAdapter {
  constructor({ browserFactory, selectors, credentialsReader }) {
    this.browserFactory = browserFactory;
    this.selectors = selectors;
    this.credentialsReader = credentialsReader;
  }

  async enqueueForConfirmation(item) {
    return {
      confirmationId: `local-${item.videoId}`,
      reviewUrl: URLS.neobund
    };
  }

  async publishConfirmed(video) {
    this.credentialsReader("neobund");
    ensureSelectors("neobund", this.selectors);
    return withPage(this.browserFactory, async (page) => {
      await page.goto(this.selectors.managementUrl ?? URLS.neobund);
      await fill(page, this.selectors.accountSearchInput, video.targetAccount.neobundAccount);
      await click(page, this.selectors.accountOption);
      await setInputFiles(page, this.selectors.uploadInput, video.filePath);
      await fill(page, this.selectors.captionInput, video.caption);
      await click(page, this.selectors.publishButton);
      return {
        platform: "neobund",
        status: "published",
        publishedAt: new Date().toISOString(),
        videoId: video.videoId
      };
    });
  }
}

async function withPage(browserFactory, callback) {
  const browser = await browserFactory();
  try {
    const page = await browser.newPage();
    return await callback(page);
  } finally {
    await browser.close();
  }
}

function ensureSelectors(name, selectors) {
  if (!selectors) {
    throw new Error(`liveAutomation.${name} selector mapping is required`);
  }
}

function geminiInstruction(product, count) {
  return [
    `Based on this product image, write ${count} distinct TikTok image-to-video prompts.`,
    `Product: ${product.productName}. Category: ${product.category}.`,
    "Each prompt must use a different hook, scene rhythm, and selling angle.",
    "Return only a numbered list."
  ].join(" ");
}

function parsePromptList(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[\).]|[-*])\s*/, "").trim())
    .filter(Boolean);
}

function normalizeMiaoshouPackages(packages, defaultCategory = "TikTok_Online_Other") {
  return packages.flatMap((orderPackage) =>
    Object.values(orderPackage.items ?? {}).map((item) => ({
      orderId: orderPackage.platformOrderSn ?? orderPackage.appPackageNo ?? orderPackage.opOrderPackageId,
      productId: item.platformItemId ?? item.platformSkuId ?? item.platformOuterSkuId ?? item.opOrderItemId,
      productName: item.title,
      category: inferProductCategory(item.title, item.categoryName ?? item.category ?? orderPackage.productCode ?? orderPackage.platformName ?? defaultCategory),
      mainImage: item.picUrl ?? item.originalPicUrl ?? item.picUrlThumb,
      site: orderPackage.site ?? orderPackage.orderInfo?.site ?? orderPackage.consigneeInfo?.country ?? "",
      country: orderPackage.consigneeInfo?.country ?? orderPackage.orderInfo?.buyerCountry ?? orderPackage.site ?? ""
    }))
  );
}

function inferProductCategory(title, fallback) {
  const normalized = String(title ?? "").toLowerCase();
  const phoneCaseWords = [
    "phone case",
    "mobile phone case",
    "iphone case",
    "samsung case",
    "handyhülle",
    "hülle",
    "coque",
    "cover telefono",
    "custodia",
    "funda"
  ];
  if (phoneCaseWords.some((word) => normalized.includes(word))) {
    return "Phone Case";
  }
  const digitalWords = [
    "charger",
    "charging cable",
    "usb cable",
    "data cable",
    "power bank",
    "earbuds",
    "earphones",
    "headphones",
    "bluetooth",
    "smart watch",
    "smartwatch",
    "phone holder",
    "tablet stand",
    "screen protector",
    "keyboard",
    "mouse",
    "camera",
    "laptop",
    "car charger",
    "cargador",
    "câble",
    "cable",
    "ladegerät",
    "ladekabel",
    "kopfhörer",
    "écouteurs",
    "protector de pantalla",
    "protezione schermo"
  ];
  if (digitalWords.some((word) => normalized.includes(word))) {
    return "Digital";
  }
  const wornProductWords = [
    "dress",
    "shirt",
    "t-shirt",
    "top",
    "blouse",
    "hoodie",
    "jacket",
    "coat",
    "pants",
    "trousers",
    "jeans",
    "leggings",
    "skirt",
    "shorts",
    "swimsuit",
    "bikini",
    "swimwear",
    "rash guard",
    "shoes",
    "sneakers",
    "sandals",
    "boots",
    "slippers",
    "hat",
    "cap",
    "scarf",
    "robe",
    "clothing",
    "apparel",
    "maillot",
    "vetements",
    "chaussures",
    "scarpe",
    "costume da bagno",
    "vestito",
    "kleid",
    "hemd",
    "hose",
    "schuhe",
    "sandalen",
    "badeanzug"
  ];
  if (hasAnyKeyword(normalized, wornProductWords)) {
    return "Apparel";
  }
  const accessoryWords = [
    "jewelry",
    "jewellery",
    "necklace",
    "bracelet",
    "earrings",
    "earring",
    "ring",
    "pendant",
    "anklet",
    "brooch",
    "hair clip",
    "hairpin",
    "watch band",
    "charm",
    "bag",
    "handbag",
    "shoulder bag",
    "crossbody bag",
    "tote bag",
    "purse",
    "wallet",
    "backpack",
    "bijoux",
    "collier",
    "boucles d'oreilles",
    "anello",
    "collana",
    "bracciale",
    "ohrringe",
    "halskette",
    "armband",
    "tasche",
    "handtasche",
    "rucksack",
    "sac"
  ];
  if (hasAnyKeyword(normalized, accessoryWords)) {
    return "Accessories";
  }
  const apparelWords = [
    "dress",
    "shirt",
    "t-shirt",
    "top",
    "blouse",
    "hoodie",
    "jacket",
    "coat",
    "pants",
    "trousers",
    "jeans",
    "leggings",
    "skirt",
    "shorts",
    "swimsuit",
    "bikini",
    "swimwear",
    "shoes",
    "sneakers",
    "sandals",
    "boots",
    "slippers",
    "hat",
    "cap",
    "scarf",
    "robe",
    "clothing",
    "apparel",
    "maillot",
    "vetements",
    "vêtements",
    "chaussures",
    "scarpe",
    "costume da bagno",
    "vestito",
    "kleid",
    "hemd",
    "hose",
    "schuhe",
    "sandalen",
    "badeanzug",
    "bikini"
  ];
  if (apparelWords.some((word) => normalized.includes(word))) {
    return "Apparel";
  }
  return fallback;
}

function hasAnyKeyword(text, keywords) {
  return keywords.some((keyword) => hasKeyword(text, keyword));
}

function hasKeyword(text, keyword) {
  const normalizedKeyword = String(keyword).trim().toLowerCase();
  if (!normalizedKeyword) {
    return false;
  }
  if (/\s|['-]/.test(normalizedKeyword)) {
    return text.includes(normalizedKeyword);
  }
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedKeyword)}($|[^a-z0-9])`, "i").test(text);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fill(page, selector, value) {
  if (page.locator) {
    return page.locator(selector).fill(value);
  }
  return page.fill(selector, value);
}

async function click(page, selector) {
  if (page.locator) {
    return page.locator(selector).click();
  }
  return page.click(selector);
}

async function setInputFiles(page, selector, value) {
  if (page.locator) {
    return page.locator(selector).setInputFiles(value);
  }
  return page.setInputFiles(selector, value);
}

async function textContent(page, selector) {
  if (page.locator) {
    return page.locator(selector).textContent();
  }
  return page.textContent(selector);
}

async function chooseByText(page, text, openerSelector) {
  if (!text) {
    return;
  }
  if (openerSelector) {
    await click(page, openerSelector);
  }
  const locator = page.getByText?.(text, { exact: false });
  if (locator) {
    await locator.first().click({ timeout: 10000 });
  }
}

async function chooseDuration(page, seconds, openerSelector) {
  const labels = [`${seconds}s`, `${seconds} s`, `${seconds}秒`, `${seconds} seconds`];
  if (openerSelector) {
    await click(page, openerSelector);
  }
  for (const label of labels) {
    const locator = page.getByText?.(label, { exact: false });
    if (!locator) {
      continue;
    }
    try {
      await locator.first().click({ timeout: 3000 });
      return;
    } catch {
      continue;
    }
  }
}

async function downloadToFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download product image: HTTP ${response.status}`);
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  return filePath;
}

function extensionForUrl(url) {
  const pathname = new URL(url).pathname;
  const extension = extname(pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(extension) ? extension : ".jpg";
}

function safeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "product";
}
