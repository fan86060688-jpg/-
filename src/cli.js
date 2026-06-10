import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { createFileInputAdapters } from "./adapters/file-input-adapters.js";
import { createLiveAdapters } from "./adapters/live-adapters.js";
import { launchBrowser } from "./adapters/browser.js";
import { loadConfig } from "./config.js";
import { loadStore, saveStore } from "./file-store.js";
import {
  buildLiveConfigStatus,
  collectPageSelectorReport,
  collectSelectorReport
} from "./live-config-check.js";
import { holdLoginSession } from "./login-session.js";
import { loginNeobund } from "./neobund-login.js";
import { startNeobundGoogleLogin } from "./neobund-google-login.js";
import { loginMiaoshou } from "./miaoshou-login.js";
import { inspectPageAfterAction } from "./page-action-inspect.js";
import { inspectAfterClickAndKeyboardSearch, inspectAfterSearch } from "./search-navigation.js";
import { searchPageSource } from "./page-source-search.js";
import { searchBrowserStorage } from "./browser-storage.js";
import { searchNetworkResources } from "./network-resource-search.js";
import { captureNetworkActivity } from "./network-capture.js";
import { loadLocalEnv, readCredentials } from "./credentials.js";
import { cleanupDemoData, publishConfirmedVideos, refreshPendingAccountMappings, renderMissingVideoFiles, runWorkflow } from "./workflow.js";

const command = process.argv[2] ?? "help";
const args = new Map(
  process.argv.slice(3).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  })
);

const configPath = args.get("config") ?? "config/config.json";
const statePath = args.get("state") ?? "data/state.json";

try {
  await loadLocalEnv(args.get("env") ?? ".env.local");
  if (command === "run") {
    const config = await loadConfig(configPath);
    const store = await loadStore(statePath);
    const live = args.get("live") === "true";
    assertLiveReady(live, config);
    const adapters = live
      ? createLiveAdapters({ browserFactory: launchBrowser, config })
      : createFileInputAdapters({ ordersPath: args.get("orders") ?? "data/input/orders.json" });

    const result = await runWorkflow({ config, store, adapters });
    await saveStore(statePath, store);
    await writeReviewQueue(store);
    console.log(`Created ${result.videos.length} pending videos for ${result.products.length} products.`);
    console.log("Review queue: data/review-queue.html");
  } else if (command === "review") {
    const store = await loadStore(statePath);
    await writeReviewQueue(store);
    console.log("Review queue: data/review-queue.html");
  } else if (command === "check-live") {
    const config = await loadConfig(configPath);
    const status = buildLiveConfigStatus(config);
    if (!status.ready) {
      console.log("Live configuration is incomplete.");
      if (status.missing.length) {
        console.log(`Missing: ${status.missing.join(", ")}`);
      }
      if (status.placeholders.length) {
        console.log(`Replace template values: ${status.placeholders.join(", ")}`);
      }
      process.exitCode = 1;
    } else if (args.get("open") === "true") {
      const report = await collectSelectorReport({ config, browserFactory: launchBrowser });
      await mkdir("data", { recursive: true });
      await writeFile("data/live-selector-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
      console.log("Live configuration is complete.");
      console.log("Selector report: data/live-selector-report.json");
    } else {
      console.log("Live configuration is complete.");
    }
  } else if (command === "inspect-page") {
    const url = args.get("url");
    const section = args.get("section") ?? "page";
    if (!url) {
      throw new Error("Use --url=<pageUrl> to inspect one page.");
    }
    await mkdir("data/page-inspections", { recursive: true });
    const outputPath = `data/page-inspections/${safeFileName(section)}.json`;
    const screenshotPath = `data/page-inspections/${safeFileName(section)}.png`;
    const report = await collectPageSelectorReport({
      section,
      url,
      browserFactory: launchBrowser,
      pauseMs: Number(args.get("pause-ms") ?? 0),
      screenshotPath
    });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Selector report: ${outputPath}`);
    console.log(`Screenshot: ${screenshotPath}`);
  } else if (command === "inspect-click") {
    const url = args.get("url");
    const clickSelector = args.get("click");
    const section = args.get("section") ?? "page-action";
    if (!url || !clickSelector) {
      throw new Error("Use --url=<pageUrl> and --click=<selector> to inspect after an action.");
    }
    await mkdir("data/page-inspections", { recursive: true });
    const outputPath = `data/page-inspections/${safeFileName(section)}.json`;
    const screenshotPath = `data/page-inspections/${safeFileName(section)}.png`;
    const report = await inspectPageAfterAction({
      section,
      url,
      clickSelector,
      pauseMs: Number(args.get("pause-ms") ?? 5000),
      screenshotPath,
      browserFactory: launchBrowser
    });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Selector report: ${outputPath}`);
    console.log(`Screenshot: ${screenshotPath}`);
  } else if (command === "inspect-search") {
    const url = args.get("url");
    const searchSelector = args.get("search");
    const query = args.get("query");
    const section = args.get("section") ?? "search";
    if (!url || !searchSelector || !query) {
      throw new Error("Use --url=<pageUrl>, --search=<selector>, and --query=<text>.");
    }
    await mkdir("data/page-inspections", { recursive: true });
    const outputPath = `data/page-inspections/${safeFileName(section)}.json`;
    const screenshotPath = `data/page-inspections/${safeFileName(section)}.png`;
    const report = await inspectAfterSearch({
      section,
      url,
      searchSelector,
      query,
      pauseMs: Number(args.get("pause-ms") ?? 5000),
      screenshotPath,
      browserFactory: launchBrowser
    });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Selector report: ${outputPath}`);
    console.log(`Screenshot: ${screenshotPath}`);
  } else if (command === "inspect-keyboard-search") {
    const url = args.get("url");
    const clickSelector = args.get("click");
    const query = args.get("query");
    const section = args.get("section") ?? "keyboard-search";
    if (!url || !clickSelector || !query) {
      throw new Error("Use --url=<pageUrl>, --click=<selector>, and --query=<text>.");
    }
    await mkdir("data/page-inspections", { recursive: true });
    const outputPath = `data/page-inspections/${safeFileName(section)}.json`;
    const screenshotPath = `data/page-inspections/${safeFileName(section)}.png`;
    const report = await inspectAfterClickAndKeyboardSearch({
      section,
      url,
      clickSelector,
      query,
      pauseMs: Number(args.get("pause-ms") ?? 5000),
      screenshotPath,
      browserFactory: launchBrowser
    });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Selector report: ${outputPath}`);
    console.log(`Screenshot: ${screenshotPath}`);
  } else if (command === "search-source") {
    const url = args.get("url");
    const patterns = (args.get("patterns") ?? "order,订单").split(",").map((item) => item.trim());
    const section = args.get("section") ?? "source-search";
    if (!url) {
      throw new Error("Use --url=<pageUrl> to search page source.");
    }
    await mkdir("data/page-inspections", { recursive: true });
    const outputPath = `data/page-inspections/${safeFileName(section)}.json`;
    const report = await searchPageSource({ url, patterns, browserFactory: launchBrowser });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Source search report: ${outputPath}`);
  } else if (command === "search-storage") {
    const url = args.get("url");
    const patterns = (args.get("patterns") ?? "order,订单").split(",").map((item) => item.trim());
    const section = args.get("section") ?? "storage-search";
    if (!url) {
      throw new Error("Use --url=<pageUrl> to search browser storage.");
    }
    await mkdir("data/page-inspections", { recursive: true });
    const outputPath = `data/page-inspections/${safeFileName(section)}.json`;
    const report = await searchBrowserStorage({ url, patterns, browserFactory: launchBrowser });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Storage search report: ${outputPath}`);
  } else if (command === "search-resources") {
    const url = args.get("url");
    const patterns = (args.get("patterns") ?? "order,璁㈠崟").split(",").map((item) => item.trim());
    const section = args.get("section") ?? "resource-search";
    if (!url) {
      throw new Error("Use --url=<pageUrl> to search loaded browser resources.");
    }
    await mkdir("data/page-inspections", { recursive: true });
    const outputPath = `data/page-inspections/${safeFileName(section)}.json`;
    const report = await searchNetworkResources({ url, patterns, browserFactory: launchBrowser });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Resource search report: ${outputPath}`);
  } else if (command === "capture-network") {
    const url = args.get("url");
    const patterns = (args.get("patterns") ?? "searchOrderPackageList").split(",").map((item) => item.trim());
    const section = args.get("section") ?? "network-capture";
    if (!url) {
      throw new Error("Use --url=<pageUrl> to capture matching network calls.");
    }
    await mkdir("data/page-inspections", { recursive: true });
    const outputPath = `data/page-inspections/${safeFileName(section)}.json`;
    const report = await captureNetworkActivity({
      url,
      patterns,
      pauseMs: Number(args.get("pause-ms") ?? 10000),
      browserFactory: launchBrowser
    });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Network capture report: ${outputPath}`);
  } else if (command === "login-session") {
    const url = args.get("url");
    if (!url) {
      throw new Error("Use --url=<pageUrl> to open a login session.");
    }
    const pauseMs = Number(args.get("pause-ms") ?? 300000);
    console.log(`Login window opened for ${Math.round(pauseMs / 1000)} seconds. Complete login in the browser window.`);
    const result = await holdLoginSession({ url, pauseMs, browserFactory: launchBrowser });
    if (!result.ok) {
      throw new Error(`Login session ended before a page could be inspected: ${result.error}`);
    }
    console.log(`Current URL: ${result.currentUrl}`);
    console.log(`Title: ${result.title}`);
  } else if (command === "login-neobund") {
    const result = await loginNeobund({
      credentials: readCredentials("neobund"),
      browserFactory: launchBrowser
    });
    console.log(`Current URL: ${result.currentUrl}`);
    console.log(`Title: ${result.title}`);
  } else if (command === "login-neobund-google") {
    const pauseMs = Number(args.get("pause-ms") ?? 300000);
    const afterUrl = args.get("after-url") ?? "https://www.neobund.ai/en/tiktok-management";
    const afterClick = args.get("after-click");
    console.log(`Google login window opened for ${Math.round(pauseMs / 1000)} seconds. Complete Google login in the browser window.`);
    await mkdir("data/page-inspections", { recursive: true });
    const reportPath = "data/page-inspections/neobund-google.json";
    const screenshotPath = "data/page-inspections/neobund-google.png";
    const result = await startNeobundGoogleLogin({
      browserFactory: launchBrowser,
      pauseMs,
      afterUrl,
      afterClick,
      screenshotPath
    });
    await writeFile(
      reportPath,
      `${JSON.stringify(
        {
          ok: result.ok,
          currentUrl: result.currentUrl,
          title: result.title,
          report: result.report
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    console.log(`Current URL: ${result.currentUrl}`);
    console.log(`Title: ${result.title}`);
    console.log(`Selector report: ${reportPath}`);
    console.log(`Screenshot: ${screenshotPath}`);
  } else if (command === "login-miaoshou") {
    const result = await loginMiaoshou({
      credentials: readCredentials("miaoshou"),
      browserFactory: launchBrowser
    });
    console.log(`Current URL: ${result.currentUrl}`);
    console.log(`Title: ${result.title}`);
  } else if (command === "approve") {
    const videoId = args.get("video");
    if (!videoId) {
      throw new Error("Use --video=<videoId> to approve one video.");
    }
    const store = await loadStore(statePath);
    store.markVideoConfirmed(videoId);
    await saveStore(statePath, store);
    await writeReviewQueue(store);
    console.log(`Approved ${videoId}.`);
  } else if (command === "publish") {
    const store = await loadStore(statePath);
    const config = await loadConfig(configPath);
    const live = args.get("live") === "true";
    assertLiveReady(live, config);
    const adapters = live
      ? createLiveAdapters({ browserFactory: launchBrowser, config })
      : createFileInputAdapters();
    const published = await publishConfirmedVideos({ store, adapters });
    await saveStore(statePath, store);
    console.log(`Published ${published.length} confirmed videos.`);
  } else if (command === "render-missing-videos") {
    const store = await loadStore(statePath);
    const config = await loadConfig(configPath);
    const adapters = createLiveAdapters({ browserFactory: launchBrowser, config });
    const productIds = args.get("product-ids")?.split(",").map((item) => item.trim()).filter(Boolean) ?? null;
    const rendered = await renderMissingVideoFiles({ store, adapters, productIds });
    await saveStore(statePath, store);
    await writeReviewQueue(store);
    console.log(`Rendered ${rendered.length} missing videos.`);
  } else if (command === "cleanup-demo") {
    const store = await loadStore(statePath);
    const removed = cleanupDemoData(store);
    await saveStore(statePath, store);
    await writeReviewQueue(store);
    console.log(`Removed ${removed} demo products and their videos.`);
  } else if (command === "refresh-accounts") {
    const store = await loadStore(statePath);
    const config = await loadConfig(configPath);
    const refreshed = refreshPendingAccountMappings(store, config);
    await saveStore(statePath, store);
    await writeReviewQueue(store);
    console.log(`Updated ${refreshed.updated} pending videos; blocked ${refreshed.blocked} videos without account rules.`);
  } else {
    printHelp();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

async function writeReviewQueue(store) {
  const rows = store.pendingVideos()
    .map(
      (video) => `<tr>
  <td>${escapeHtml(video.productName)}</td>
  <td>${escapeHtml(video.category)}</td>
  <td>${video.index + 1}</td>
  <td>${escapeHtml(video.targetAccount.neobundAccount)} / ${escapeHtml(video.targetAccount.tiktokAccount)}</td>
  <td>${escapeHtml(video.caption)}</td>
  <td>${escapeHtml(video.prompt ?? "")}</td>
  <td>${escapeHtml(video.filePath ?? "")}</td>
  <td><code>npm run approve -- --video=${escapeHtml(video.videoId)}</code></td>
</tr>`
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>待确认视频队列</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; }
    code { white-space: nowrap; }
  </style>
</head>
<body>
  <h1>待确认视频队列</h1>
  <p>只有执行 approve 后的视频才会进入发布步骤。</p>
  <table>
    <thead>
      <tr><th>产品</th><th>类目</th><th>序号</th><th>账号</th><th>文案</th><th>提示词</th><th>视频文件</th><th>确认命令</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>
`;
  await mkdir(dirname("data/review-queue.html"), { recursive: true });
  await writeFile("data/review-queue.html", html, "utf8");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function printHelp() {
  console.log(`Usage:
  npm run run -- --config=config/config.json --orders=data/input/orders.json
  npm run review
  npm run check-live
  npm run inspect-page -- --section=gemini --url=<pageUrl> --pause-ms=60000
  npm run inspect-click -- --section=neobund-create --url=<pageUrl> --click=<selector>
  npm run inspect-search -- --section=miaoshou-orders --url=<pageUrl> --search=<selector> --query=订单
  npm run login-session -- --url=<pageUrl> --pause-ms=300000
  npm run login-neobund-google -- --pause-ms=300000
  npm run login-neobund
  npm run login-miaoshou
  npm run approve -- --video=<videoId>
  npm run render-missing-videos
  npm run publish

Use "npm run check-live -- --open=true" after filling liveAutomation selectors to open pages and write a selector report.
`);
}

function assertLiveReady(live, config) {
  if (live && !config.liveAutomation) {
    throw new Error("config.liveAutomation is required when using --live=true. Copy the liveAutomation section from config/config.example.json and fill the real selectors.");
  }
}

function safeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "page";
}
