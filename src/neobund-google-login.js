import { summarizeSelectorCandidates } from "./live-config-check.js";

export async function startNeobundGoogleLogin({
  browserFactory,
  pauseMs,
  afterUrl,
  afterClick,
  screenshotPath,
  url = "https://www.neobund.ai/zh/tiktok-management",
  googleButton = 'button:has-text("Sign in with your Google account")'
}) {
  const browser = await browserFactory();
  try {
    let page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator(googleButton).click();
    try {
      await page.waitForTimeout(pauseMs);
    } catch (error) {
      const fallbackPage = await findFallbackPage(browser, page);
      if (!fallbackPage) {
        return {
          ok: false,
          error: error.message
        };
      }
      page = fallbackPage;
    }
    if (afterUrl) {
      await page.goto(afterUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(5000);
    }
    if (afterClick) {
      await page.locator(afterClick).click();
      await page.waitForTimeout(5000);
    }
    return {
      ok: true,
      currentUrl: page.url(),
      title: await page.title(),
      report: await buildReport(page, screenshotPath)
    };
  } finally {
    await browser.close();
  }
}

async function findFallbackPage(browser, originalPage) {
  if (!browser?.pages) {
    return null;
  }
  for (const candidate of browser.pages()) {
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

async function buildReport(page, screenshotPath) {
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
  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
  const report = {
    candidates: summarizeSelectorCandidates(elements)
  };
  if (screenshotPath) {
    report.screenshotPath = screenshotPath;
  }
  return report;
}
