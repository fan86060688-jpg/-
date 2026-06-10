export async function captureNetworkActivity({
  url,
  patterns,
  browserFactory,
  pauseMs = 10000,
  maxBodyChars = 20000
}) {
  const browser = await browserFactory();
  const entries = [];
  try {
    const page = await browser.newPage();
    page.on("request", (request) => {
      const requestUrl = request.url();
      if (!matchesAny(requestUrl, patterns)) {
        return;
      }
      entries.push({
        type: "request",
        method: request.method(),
        url: requestUrl,
        postData: truncate(request.postData() ?? "", maxBodyChars)
      });
    });
    page.on("response", async (response) => {
      const responseUrl = response.url();
      if (!matchesAny(responseUrl, patterns)) {
        return;
      }
      const entry = {
        type: "response",
        status: response.status(),
        url: responseUrl,
        body: ""
      };
      try {
        const contentType = response.headers()["content-type"] ?? "";
        if (contentType.includes("json") || contentType.includes("text")) {
          entry.body = truncate(await response.text(), maxBodyChars);
        }
      } catch (error) {
        entry.error = error.message;
      }
      entries.push(entry);
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(pauseMs);
    return {
      url,
      currentUrl: page.url(),
      title: await page.title(),
      entries
    };
  } finally {
    await browser.close();
  }
}

function matchesAny(value, patterns) {
  const normalized = value.toLowerCase();
  return patterns.some((pattern) => pattern && normalized.includes(pattern.toLowerCase()));
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...<truncated>`;
}
