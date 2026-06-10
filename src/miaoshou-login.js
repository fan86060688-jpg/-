export async function loginMiaoshou({
  credentials,
  browserFactory,
  url = "https://erp.91miaoshou.com",
  selectors = defaultSelectors
}) {
  const browser = await browserFactory();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator(selectors.accountInput).fill(credentials.username);
    await page.locator(selectors.passwordInput).fill(credentials.password);
    await page.locator(selectors.loginButton).click();
    await page.waitForTimeout(5000);
    return {
      currentUrl: page.url(),
      title: await page.title()
    };
  } finally {
    await browser.close();
  }
}

const defaultSelectors = {
  accountInput: 'input[name="mobile"]',
  passwordInput: 'input[name="password"]',
  loginButton: "button#J_loginBtn"
};
