export async function holdLoginSession({ url, pauseMs, browserFactory }) {
  const browser = await browserFactory();
  try {
    let page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
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
    return {
      ok: true,
      currentUrl: page.url(),
      title: await page.title()
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
