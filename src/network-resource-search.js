export async function searchNetworkResources({ url, patterns, browserFactory }) {
  const browser = await browserFactory();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page);

    const resources = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter(Boolean)
    );

    return {
      url,
      matches: [...new Set(resources.filter((resource) => matchesAny(resource, patterns)))]
    };
  } finally {
    await browser.close();
  }
}

async function settle(page) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    // Some dashboards keep long-lived requests open; collected resources are still useful.
  }
}

function matchesAny(value, patterns) {
  const normalized = value.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}
