import { collectTableCandidates, summarizeTableCandidates } from "./table-inspect.js";

export const LIVE_SELECTOR_PATHS = [
  "liveAutomation.tiktokCreativeStudio.imageToVideoUrl",
  "liveAutomation.tiktokCreativeStudio.imageInput",
  "liveAutomation.tiktokCreativeStudio.promptInput",
  "liveAutomation.tiktokCreativeStudio.generateButton",
  "liveAutomation.tiktokCreativeStudio.downloadButton",
  "liveAutomation.neobund.managementUrl",
  "liveAutomation.neobund.accountSearchInput",
  "liveAutomation.neobund.accountOption",
  "liveAutomation.neobund.uploadInput",
  "liveAutomation.neobund.captionInput",
  "liveAutomation.neobund.publishButton"
];

export function buildLiveConfigStatus(config) {
  if (!config.liveAutomation) {
    return {
      ready: false,
      missing: ["liveAutomation"],
      placeholders: []
    };
  }

  const paths = [...miaoshouSelectorPaths(config.liveAutomation.miaoshou), ...LIVE_SELECTOR_PATHS];
  const missing = paths.filter((path) => !readPath(config, path));
  const placeholders = paths.filter((path) => isPlaceholder(path, readPath(config, path)));
  return {
    ready: missing.length === 0 && placeholders.length === 0,
    missing,
    placeholders
  };
}

function miaoshouSelectorPaths(miaoshou = {}) {
  if (miaoshou.orderApiUrl) {
    return ["liveAutomation.miaoshou.ordersUrl", "liveAutomation.miaoshou.orderApiUrl"];
  }
  return [
    "liveAutomation.miaoshou.ordersUrl",
    "liveAutomation.miaoshou.orderRow",
    "liveAutomation.miaoshou.fields.orderId",
    "liveAutomation.miaoshou.fields.productId",
    "liveAutomation.miaoshou.fields.productName",
    "liveAutomation.miaoshou.fields.category",
    "liveAutomation.miaoshou.fields.mainImage"
  ];
}

export async function collectSelectorReport({ config, browserFactory }) {
  const pages = livePages(config);
  const browser = await browserFactory();
  try {
    const page = await browser.newPage();
    const report = [];
    for (const target of pages) {
      report.push(await inspectPage(page, target));
    }
    return report;
  } finally {
    await browser.close();
  }
}

export async function collectPageSelectorReport({
  section,
  url,
  browserFactory,
  pauseMs = 0,
  screenshotPath
}) {
  const browser = await browserFactory();
  try {
    const page = await browser.newPage();
    return await inspectPage(page, { section, url, pauseMs, screenshotPath, browser });
  } finally {
    await browser.close();
  }
}

export function summarizeSelectorCandidates(elements) {
  return {
    fileInputs: unique(
      elements
        .filter((element) => element.tag === "input" && element.type === "file")
        .map(cssSelectorFor)
    ),
    passwordInputs: unique(
      elements
        .filter((element) => element.tag === "input" && element.type === "password")
        .map(cssSelectorFor)
    ),
    textInputs: unique(
      elements
        .filter((element) => element.tag === "textarea" || isTextInput(element))
        .map(cssSelectorFor)
    ),
    buttons: unique(
      elements
        .filter((element) => element.tag === "button" || element.tag === "a")
        .map(cssSelectorFor)
    )
  };
}

function livePages(config) {
  const live = config.liveAutomation ?? {};
  return [
    ["miaoshou", live.miaoshou?.ordersUrl],
    ["gemini", live.gemini?.gemUrl],
    ["tiktokCreativeStudio", live.tiktokCreativeStudio?.imageToVideoUrl],
    ["neobund", live.neobund?.managementUrl]
  ]
    .filter(([, url]) => url)
    .map(([section, url]) => ({ section, url }));
}

async function inspectPage(page, target) {
  try {
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (target.pauseMs > 0) {
      try {
        await page.waitForTimeout(target.pauseMs);
      } catch (error) {
        const fallbackPage = await findFallbackPage(target.browser, page);
        if (!fallbackPage) {
          throw error;
        }
        page = fallbackPage;
      }
    }
    const elements = await collectElements(page);
    const tableRows = await collectTableCandidates(page);
    const report = {
      ok: true,
      section: target.section,
      url: target.url,
      currentUrl: page.url(),
      title: await page.title(),
      candidates: summarizeSelectorCandidates(elements),
      tables: summarizeTableCandidates(tableRows)
    };
    if (target.screenshotPath) {
      try {
        await page.screenshot({ path: target.screenshotPath, fullPage: true, timeout: 10000 });
        report.screenshotPath = target.screenshotPath;
      } catch (error) {
        report.screenshotError = error.message;
      }
    }
    if (target.screenshotPath && report.screenshotPath) {
      report.screenshotPath = target.screenshotPath;
    }
    return report;
  } catch (error) {
    return {
      ok: false,
      section: target.section,
      url: target.url,
      error: error.message
    };
  }
}

async function collectElements(page) {
  const selector = "input, textarea, button, [role=button], a";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.$$eval(selector, (nodes) =>
        nodes.map((node) => ({
          tag: node.tagName.toLowerCase(),
          type: node.getAttribute("type") ?? "",
          id: node.id ?? "",
          name: node.getAttribute("name") ?? "",
          text: (node.textContent ?? "").trim().slice(0, 80),
          placeholder: node.getAttribute("placeholder") ?? ""
        }))
      );
    } catch (error) {
      if (!/Execution context was destroyed|navigation/i.test(error.message) || attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(1000);
    }
  }
  return [];
}

async function findFallbackPage(browser, originalPage) {
  if (!browser?.pages) {
    return null;
  }
  const pages = browser.pages();
  for (const candidate of pages) {
    if (candidate === originalPage) {
      continue;
    }
    try {
      await candidate.title();
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function isTextInput(element) {
  return element.tag === "input" && ["", "text", "search"].includes(element.type);
}

function cssSelectorFor(element) {
  if (element.id) {
    return `${element.tag}#${cssEscape(element.id)}`;
  }
  if (element.name) {
    return `${element.tag}[name="${element.name.replaceAll('"', '\\"')}"]`;
  }
  if (element.placeholder) {
    return `${element.tag}[placeholder="${element.placeholder.replaceAll('"', '\\"')}"]`;
  }
  if (element.text) {
    return `${element.tag}:has-text("${element.text.replaceAll('"', '\\"')}")`;
  }
  if (element.type) {
    return `${element.tag}[type="${element.type}"]`;
  }
  return element.tag;
}

function cssEscape(value) {
  return String(value).replaceAll(" ", "\\ ");
}

function readPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function isPlaceholder(path, value) {
  if (!value || typeof value !== "string") {
    return false;
  }
  const normalized = value.toLowerCase();
  if (normalized.includes("example.com") || normalized.includes("example.test")) {
    return true;
  }
  if (path.endsWith("gemUrl") && normalized.endsWith("/example")) {
    return true;
  }
  const placeholderSelectors = new Set([
    ".order-row",
    ".order-id",
    ".product-id",
    ".product-name",
    ".category",
    ".main-image",
    ".response",
    "button.generate",
    "button.download",
    ".account-option",
    "textarea.caption",
    "button.publish"
  ]);
  return placeholderSelectors.has(value);
}

function unique(values) {
  return [...new Set(values)];
}
