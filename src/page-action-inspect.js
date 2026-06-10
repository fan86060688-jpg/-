import { summarizeSelectorCandidates } from "./live-config-check.js";

export async function inspectPageAfterAction({
  section,
  url,
  clickSelector,
  pauseMs,
  screenshotPath,
  browserFactory
}) {
  const browser = await browserFactory();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator(clickSelector).click();
    await page.waitForTimeout(pauseMs);
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
      ok: true,
      section,
      url,
      currentUrl: page.url(),
      title: await page.title(),
      candidates: summarizeSelectorCandidates(elements)
    };
    if (screenshotPath) {
      report.screenshotPath = screenshotPath;
    }
    return report;
  } finally {
    await browser.close();
  }
}
