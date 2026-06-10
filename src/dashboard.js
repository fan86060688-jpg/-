import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { spawn } from "node:child_process";

import { loadConfig } from "./config.js";
import { loadStore, saveStore } from "./file-store.js";
import { cleanupDemoData, refreshPendingAccountMappings } from "./workflow.js";

const DEFAULT_STATE_PATH = "data/state.json";
const DEFAULT_CONFIG_PATH = "config/config.json";

export async function startDashboardServer({
  port = 8787,
  statePath = DEFAULT_STATE_PATH,
  configPath = DEFAULT_CONFIG_PATH,
  cwd = process.cwd()
} = {}) {
  const tasks = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (request.method === "GET" && url.pathname === "/") {
        const config = await loadConfig(configPath);
        const store = await loadStore(statePath);
        return sendHtml(response, renderDashboard({ config, store, tasks }));
      }
      if (request.method === "GET" && url.pathname === "/media") {
        return streamMedia(response, url.searchParams.get("path"), cwd);
      }
      if (request.method === "POST" && url.pathname === "/approve") {
        const videoId = url.searchParams.get("video");
        const config = await loadConfig(configPath);
        const store = await loadStore(statePath);
        refreshPendingAccountMappings(store, config);
        if (store.videos[videoId]?.status === "pending_confirmation") {
          store.markVideoConfirmed(videoId);
        }
        await saveStore(statePath, store);
        return redirect(response, "/");
      }
      if (request.method === "POST" && url.pathname === "/approve-all") {
        const config = await loadConfig(configPath);
        const store = await loadStore(statePath);
        refreshPendingAccountMappings(store, config);
        for (const video of store.pendingVideos()) {
          store.markVideoConfirmed(video.videoId);
        }
        await saveStore(statePath, store);
        return redirect(response, "/");
      }
      if (request.method === "POST" && url.pathname === "/run") {
        startTask(tasks, "生成待确认视频", "npm", ["run", "run", "--", "--live=true"], cwd, [
          ["npm", ["run", "render-missing-videos"]]
        ]);
        return redirect(response, "/");
      }
      if (request.method === "POST" && url.pathname === "/render") {
        startTask(tasks, "补齐视频文件", "npm", ["run", "render-missing-videos"], cwd);
        return redirect(response, "/");
      }
      if (request.method === "POST" && url.pathname === "/publish") {
        startTask(tasks, "发布已确认视频", "npm", ["run", "publish", "--", "--live=true"], cwd);
        return redirect(response, "/");
      }
      if (request.method === "POST" && url.pathname === "/cleanup-demo") {
        const store = await loadStore(statePath);
        cleanupDemoData(store);
        await saveStore(statePath, store);
        return redirect(response, "/");
      }
      if (request.method === "POST" && url.pathname === "/refresh-accounts") {
        const config = await loadConfig(configPath);
        const store = await loadStore(statePath);
        refreshPendingAccountMappings(store, config);
        await saveStore(statePath, store);
        return redirect(response, "/");
      }
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error.stack ?? error.message);
    }
  });

  await new Promise((resolvePromise) => server.listen(port, resolvePromise));
  return { server, url: `http://localhost:${port}` };
}

export function renderDashboard({ config, store, tasks = [] }) {
  const videos = Object.values(store.videos ?? {});
  const pending = videos.filter((video) => video.status === "pending_confirmation");
  const blocked = videos.filter((video) => video.status === "blocked_account_mapping");
  const confirmed = videos.filter((video) => video.status === "confirmed");
  const published = videos.filter((video) => video.status === "published");
  const latestRuns = [...(store.runs ?? [])].reverse().slice(0, 8);
  const rules = renderRules(config);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>自动短视频系统</title>
  <style>
    :root { color-scheme: light; --bg: #f7f8fb; --text: #172033; --muted: #667085; --line: #d9deea; --panel: #ffffff; --accent: #1769aa; --ok: #0f8f63; --warn: #b15c00; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, "Microsoft YaHei", sans-serif; background: var(--bg); color: var(--text); }
    header { padding: 22px 28px; background: #111827; color: #fff; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    h1 { margin: 0; font-size: 24px; }
    main { padding: 22px; max-width: 1440px; margin: 0 auto; }
    section { margin-bottom: 22px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .stat, .panel, .video-card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
    .stat strong { display: block; font-size: 28px; margin-top: 6px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    button { border: 1px solid #14548a; background: var(--accent); color: #fff; border-radius: 6px; padding: 10px 14px; cursor: pointer; font-weight: 700; }
    button.secondary { background: #fff; color: var(--accent); }
    button.danger { background: #9f2a2a; border-color: #9f2a2a; }
    table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    th, td { border-bottom: 1px solid var(--line); padding: 10px; text-align: left; vertical-align: top; font-size: 14px; }
    th { background: #eef2f7; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
    .video-card video { width: 100%; aspect-ratio: 9 / 16; background: #0b1020; border-radius: 6px; display: block; }
    .meta { color: var(--muted); font-size: 13px; line-height: 1.45; }
    .caption { font-size: 14px; line-height: 1.45; }
    .tag { display: inline-block; padding: 2px 7px; border-radius: 999px; background: #edf4ff; color: #174c7c; font-size: 12px; margin-right: 4px; }
    .ok { color: var(--ok); } .warn { color: var(--warn); }
    form { margin: 0; display: inline; }
    @media (max-width: 900px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } header { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>自动短视频制作发布系统</h1>
      <div class="meta">每天 10:00 自动检查妙手订单；视频进入待确认队列，确认后才发布到 Neobund TikTok Publish。</div>
    </div>
    <div class="actions">
      <form method="post" action="/run"><button>立即生成</button></form>
      <form method="post" action="/render"><button class="secondary">补齐视频</button></form>
      <form method="post" action="/cleanup-demo"><button class="secondary">清理测试样例</button></form>
      <form method="post" action="/refresh-accounts"><button class="secondary">刷新账号规则</button></form>
      <form method="post" action="/publish"><button class="danger">发布已确认</button></form>
    </div>
  </header>
  <main>
    <section class="stats">
      <div class="stat"><span>待确认</span><strong>${pending.length}</strong></div>
      <div class="stat"><span>已确认待发布</span><strong>${confirmed.length}</strong></div>
      <div class="stat"><span>已发布</span><strong>${published.length}</strong></div>
      <div class="stat"><span>缺账号规则</span><strong>${blocked.length}</strong></div>
    </section>

    <section class="panel">
      <h2>账号规则</h2>
      ${rules}
    </section>

    <section class="panel">
      <h2>运行状态</h2>
      ${renderTasks(tasks)}
      ${renderRuns(latestRuns)}
    </section>

    <section>
      <h2>待确认视频</h2>
      <div class="actions" style="margin-bottom: 12px;">
        <form method="post" action="/approve-all"><button class="secondary">全部确认</button></form>
      </div>
      ${renderPendingVideos(pending)}
    </section>
    <section>
      <h2>缺账号规则</h2>
      ${renderBlockedVideos(blocked)}
    </section>
  </main>
</body>
</html>`;
}

function renderRules(config) {
  const siteRows = Object.entries(config.siteAccounts ?? {}).map(([site, account]) =>
    `<tr><td>${escapeHtml(site)}</td><td>其它产品默认</td><td>${escapeHtml(account.neobundAccount)}</td><td>${escapeHtml(account.captionTemplate)}</td></tr>`
  );
  const categorySiteRows = Object.entries(config.categorySiteAccounts ?? {}).map(([key, account]) => {
    const [category, site] = key.split(":");
    return `<tr><td>${escapeHtml(site)}</td><td>${escapeHtml(category)}</td><td>${escapeHtml(account.neobundAccount)}</td><td>${escapeHtml(account.captionTemplate)}</td></tr>`;
  });
  const categoryRows = Object.entries(config.categoryAccounts ?? {}).map(([category, account]) =>
    `<tr><td>全部</td><td>${escapeHtml(category)}</td><td>${escapeHtml(account.neobundAccount)}</td><td>${escapeHtml(account.captionTemplate)}</td></tr>`
  );
  return `<table><thead><tr><th>区域</th><th>类目</th><th>账号</th><th>文案模板</th></tr></thead><tbody>${[...categorySiteRows, ...siteRows, ...categoryRows].join("")}</tbody></table>`;
}

function renderTasks(tasks) {
  if (!tasks.length) {
    return `<p class="meta">当前没有正在运行的任务。</p>`;
  }
  return `<table><thead><tr><th>任务</th><th>状态</th><th>最后输出</th></tr></thead><tbody>${tasks
    .slice(-5)
    .reverse()
    .map((task) => `<tr><td>${escapeHtml(task.name)}</td><td>${escapeHtml(task.status)}</td><td><pre>${escapeHtml(task.output.slice(-1200))}</pre></td></tr>`)
    .join("")}</tbody></table>`;
}

function renderRuns(runs) {
  if (!runs.length) {
    return "";
  }
  return `<h2 style="margin-top:18px;">最近运行</h2><table><thead><tr><th>开始</th><th>状态</th><th>产品</th><th>视频</th><th>错误</th></tr></thead><tbody>${runs
    .map((run) => `<tr><td>${escapeHtml(run.startedAt)}</td><td>${escapeHtml(run.status)}</td><td>${run.productsProcessed ?? 0}</td><td>${run.videosCreated ?? 0}</td><td>${escapeHtml(run.error ?? "")}</td></tr>`)
    .join("")}</tbody></table>`;
}

function renderPendingVideos(videos) {
  if (!videos.length) {
    return `<div class="panel"><span class="ok">没有待确认视频。</span></div>`;
  }
  return `<div class="grid">${videos.map(renderVideoCard).join("")}</div>`;
}

function renderBlockedVideos(videos) {
  if (!videos.length) {
    return `<div class="panel"><span class="ok">没有缺账号规则的视频。</span></div>`;
  }
  return `<table><thead><tr><th>产品</th><th>类目</th><th>区域</th><th>原因</th></tr></thead><tbody>${videos
    .map((video) => `<tr><td>${escapeHtml(video.productName)}</td><td>${escapeHtml(video.category)}</td><td>${escapeHtml(video.site ?? video.country ?? "")}</td><td>${escapeHtml(video.accountError)}</td></tr>`)
    .join("")}</tbody></table>`;
}

function renderVideoCard(video) {
  const mediaUrl = video.filePath ? `/media?path=${encodeURIComponent(video.filePath)}` : "";
  return `<article class="video-card">
    ${mediaUrl ? `<video src="${mediaUrl}" controls preload="metadata"></video>` : `<div class="panel warn">缺少视频文件</div>`}
    <p class="caption">${escapeHtml(video.productName)}</p>
    <p class="meta">
      <span class="tag">${escapeHtml(video.category)}</span>
      <span class="tag">${escapeHtml(video.site ?? video.country ?? "")}</span>
      <span class="tag">${escapeHtml(video.targetAccount?.neobundAccount ?? "")}</span>
    </p>
    <p class="meta">${escapeHtml(video.caption)}</p>
    <form method="post" action="/approve?video=${encodeURIComponent(video.videoId)}"><button>确认这个视频</button></form>
  </article>`;
}

async function streamMedia(response, filePath, cwd) {
  if (!filePath) {
    response.writeHead(400);
    response.end("Missing path");
    return;
  }
  const absolute = resolve(cwd, filePath);
  const allowedRoot = resolve(cwd, "data");
  if (!absolute.startsWith(allowedRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  await access(absolute);
  response.writeHead(200, { "content-type": contentTypeFor(absolute) });
  createReadStream(absolute).pipe(response);
}

function contentTypeFor(filePath) {
  if (extname(filePath).toLowerCase() === ".mp4") {
    return "video/mp4";
  }
  if (extname(filePath).toLowerCase() === ".webm") {
    return "video/webm";
  }
  return "application/octet-stream";
}

function startTask(tasks, name, command, args, cwd, nextCommands = []) {
  const task = { name, status: "running", output: "", startedAt: new Date().toISOString() };
  tasks.push(task);
  runCommand(task, command, args, cwd, nextCommands);
  return task;
}

async function runCommand(task, command, args, cwd, nextCommands = []) {
  try {
    await spawnCommand(task, command, args, cwd);
    for (const [nextCommand, nextArgs] of nextCommands) {
      await spawnCommand(task, nextCommand, nextArgs, cwd);
    }
    task.status = "success";
  } catch (error) {
    task.status = "failed";
    task.output += `\n${error.message}`;
  } finally {
    task.finishedAt = new Date().toISOString();
  }
}

function spawnCommand(task, command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, shell: true, windowsHide: true });
    child.stdout.on("data", (chunk) => {
      task.output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      task.output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function sendHtml(response, html) {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function redirect(response, location) {
  response.writeHead(303, { location });
  response.end();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
