export async function launchBrowser() {
  const playwright = await importOptional("playwright");
  if (!playwright) {
    throw new Error(
      "Playwright is not installed in this project. Install it or run with custom adapters before using live browser automation."
    );
  }

  return playwright.chromium.launchPersistentContext("data/chrome-profile", {
    channel: "chrome",
    headless: false,
    downloadsPath: "data/downloads",
    args: ["--disable-blink-features=AutomationControlled"]
  });
}

async function importOptional(packageName) {
  try {
    return await import(packageName);
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}
