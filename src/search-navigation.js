import { summarizeSelectorCandidates } from "./live-config-check.js";
import { collectTableCandidates, summarizeTableCandidates } from "./table-inspect.js";

export async function inspectAfterSearch({
  url,
  section,
  searchSelector,
  query,
  pauseMs,
  screenshotPath,
  browserFactory
}) {
  const browser = await browserFactory();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator(searchSelector).fill(query);
    await page.locator(searchSelector).press("Enter");
    await page.waitForTimeout(pauseMs);
    return await buildSearchReport({ page, section, url, screenshotPath });
  } finally {
    await browser.close();
  }
}

export async function inspectAfterClickAndKeyboardSearch({
  url,
  section,
  clickSelector,
  query,
  pauseMs,
  screenshotPath,
  browserFactory
}) {
  const browser = await browserFactory();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator(clickSelector).click();
    await page.keyboard.type(query);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(pauseMs);
    return await buildSearchReport({ page, section, url, screenshotPath });
  } finally {
    await browser.close();
  }
}

async function buildSearchReport({ page, section, url, screenshotPath }) {
  const elements = await page.$$eval("input, textarea, button, [role=button], a", (nodes) =>
    nodes.map((node) => ({
      tag: node.tagName.toLowerCase(),
      type: node.getAttribute("type") ?? "",
      id: node.id ?? "",
      name: node.getAttribute("name") ?? "",
      text: (node.textContent ?? "").trim().slice(0, 80),
      placeholder: node.getAttribute("placeholder") ?? ""
    }))
  );
  const tableRows = await collectTableCandidates(page);
  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
  const report = {
    ok: true,
    section,
    url,
    currentUrl: page.url(),
    title: await page.title(),
    candidates: summarizeSelectorCandidates(elements),
    tables: summarizeTableCandidates(tableRows)
  };
  if (screenshotPath) {
    report.screenshotPath = screenshotPath;
  }
  return report;
}
