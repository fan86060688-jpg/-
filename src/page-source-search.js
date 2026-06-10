export async function searchPageSource({ url, patterns, browserFactory }) {
  const browser = await browserFactory();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const source = await page.evaluate(() => ({
      hrefs: [...document.querySelectorAll("a[href]")]
        .map((anchor) => anchor.getAttribute("href") ?? "")
        .filter(Boolean),
      text: document.body?.innerText ?? ""
    }));
    return {
      url,
      hrefs: source.hrefs.filter((href) => matchesAny(href, patterns)),
      textMatches: source.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && matchesAny(line, patterns))
        .slice(0, 50)
    };
  } finally {
    await browser.close();
  }
}

function matchesAny(value, patterns) {
  const normalized = value.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}
