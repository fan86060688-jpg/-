# Live automation setup

This project can run in two modes:

- File mode: reads `data/input/orders.json`, generates local review items, and never touches real websites.
- Live mode: opens the real sites with Playwright and uses selectors from `config/config.json`.

Live mode is intentionally selector-driven. Do not hard-code private account details or passwords in source files.

## Credentials

Set these values from your local secret manager or temporary shell environment:

```powershell
$env:MIAOSHOU_USERNAME="..."
$env:MIAOSHOU_PASSWORD="..."
$env:GEMINI_USERNAME="..."
$env:GEMINI_PASSWORD="..."
$env:TIKTOK_USERNAME="..."
$env:TIKTOK_PASSWORD="..."
$env:NEOBUND_USERNAME="..."
$env:NEOBUND_PASSWORD="..."
```

The current adapters verify credentials are present, then rely on the browser session. If a site asks for a captcha or second factor, finish it manually in the opened browser.

## Selector mapping

Copy `config/config.example.json` to `config/config.json`, then replace the `liveAutomation` selectors with the real logged-in page selectors.

Required sections:

- `miaoshou`: order list URL, order row selector, and per-row field selectors for order ID, product ID, name, category, and main image.
- `gemini`: Gem URL, image upload input, prompt input, submit button, and response text selector.
- `tiktokCreativeStudio`: image-to-video URL, image upload input, prompt input, generate button, and download button.
- `neobund`: management URL, account search input, account option, video upload input, caption input, and publish button.

## Dry run first

Use file mode until the review queue looks correct:

```powershell
npm run run
```

Then use live mode only after selectors are filled:

```powershell
npm run run -- --live=true
```

Publishing is still gated. Only videos approved with `npm run approve -- --video=<videoId>` are eligible for:

```powershell
npm run publish -- --live=true
```
