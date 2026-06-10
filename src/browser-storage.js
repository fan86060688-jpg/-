export async function searchBrowserStorage({ url, patterns, browserFactory }) {
  const browser = await browserFactory();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const stores = await page.evaluate(() => {
      const readStore = (store) =>
        Object.fromEntries(Array.from({ length: store.length }, (_, index) => {
          const key = store.key(index);
          return [key, store.getItem(key)];
        }).filter(([key]) => key));
      return {
        localStorage: readStore(window.localStorage),
        sessionStorage: readStore(window.sessionStorage)
      };
    });
    return {
      url,
      matches: Object.entries(stores).flatMap(([store, values]) =>
        Object.entries(values)
          .filter(([key, value]) => matchesAny(`${key}\n${value}`, patterns))
          .map(([key, value]) => ({ store, key, value }))
      )
    };
  } finally {
    await browser.close();
  }
}

function matchesAny(value, patterns) {
  const normalized = value.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}
