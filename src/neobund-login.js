export async function loginNeobund({
  credentials,
  browserFactory,
  url = "https://www.neobund.ai/zh/tiktok-management",
  selectors = defaultSelectors
}) {
  const browser = await browserFactory();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator(selectors.passwordLoginButton).click();
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
  passwordLoginButton: 'button:has-text("Log in with password")',
  accountInput: "input#form_item_account",
  passwordInput: "input#form_item_password",
  loginButton: 'button:has-text("Log In")'
};
