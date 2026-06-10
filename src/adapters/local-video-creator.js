import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

import ffmpeg from "@ffmpeg-installer/ffmpeg";

export function createLocalVideoCreator({ browserFactory, outputDir = "data/generated-videos" }) {
  return {
    async createVideo({ product, prompt, index }) {
      void browserFactory;
      void prompt;
      const dir = `${outputDir}/${safeFileName(product.productId)}`;
      const imagePath = `${dir}/source-${index + 1}.jpg`;
      const filePath = `${dir}/video-${index + 1}.mp4`;
      await downloadImage(product.mainImage, imagePath);
      await renderMp4({ imagePath, filePath, index });
      return { filePath };
    }
  };
}

async function downloadImage(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download product image: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
}

async function renderMp4({ imagePath, filePath, index }) {
  const zoomSpeed = (0.0012 + (index % 4) * 0.00025).toFixed(5);
  const filter = [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    `zoompan=z='min(zoom+${zoomSpeed},1.08)':d=150:s=1080x1920:fps=25`,
    "format=yuv420p"
  ].join(",");
  await runFfmpeg([
    "-y",
    "-loop",
    "1",
    "-i",
    imagePath,
    "-t",
    "6",
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    filePath
  ]);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg.path, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg failed with exit code ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

async function renderVideoInBrowser({ imageDataUrl, title, category, prompt, index }) {
  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load product image"));
      image.src = src;
    });
  const wrapText = (textContext, text, maxWidth, maxLines) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (textContext.measureText(next).width <= maxWidth) {
        line = next;
      } else {
        if (line) lines.push(line);
        line = word;
      }
      if (lines.length === maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    return lines;
  };
  const drawText = (textContext, text, x, y, size, maxLines, color) => {
    textContext.fillStyle = color;
    textContext.font = `700 ${size}px Arial, sans-serif`;
    const lines = wrapText(textContext, String(text), 880, maxLines);
    lines.forEach((line, lineIndex) => textContext.fillText(line, x, y + lineIndex * size * 1.22));
  };
  const drawFrame = (textContext, targetCanvas, sourceImage, frame) => {
    const width = targetCanvas.width;
    const height = targetCanvas.height;
    const hue = (frame.index * 37) % 360;
    const background = textContext.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, `hsl(${hue}, 58%, 18%)`);
    background.addColorStop(0.55, "#111827");
    background.addColorStop(1, `hsl(${(hue + 120) % 360}, 52%, 24%)`);
    textContext.fillStyle = background;
    textContext.fillRect(0, 0, width, height);

    const zoom = 1.05 + frame.progress * 0.08;
    const imageX = 90;
    const imageY = 210;
    const imageWidth = 900;
    const imageHeight = 1180;
    textContext.save();
    textContext.beginPath();
    textContext.roundRect(imageX, imageY, imageWidth, imageHeight, 34);
    textContext.clip();
    const scale = Math.max(imageWidth / sourceImage.width, imageHeight / sourceImage.height) * zoom;
    const drawWidth = sourceImage.width * scale;
    const drawHeight = sourceImage.height * scale;
    textContext.drawImage(sourceImage, imageX + (imageWidth - drawWidth) / 2, imageY + (imageHeight - drawHeight) / 2, drawWidth, drawHeight);
    textContext.restore();

    const panel = textContext.createLinearGradient(0, 1240, 0, height);
    panel.addColorStop(0, "rgba(17, 24, 39, 0)");
    panel.addColorStop(0.22, "rgba(17, 24, 39, 0.88)");
    panel.addColorStop(1, "rgba(17, 24, 39, 0.98)");
    textContext.fillStyle = panel;
    textContext.fillRect(0, 1180, width, height - 1180);
    textContext.fillStyle = `hsl(${(hue + 70) % 360}, 92%, 64%)`;
    textContext.roundRect(100, 1760, 320, 86, 43);
    textContext.fill();

    drawText(textContext, frame.title, 100, 1340, 58, 3, "#ffffff");
    drawText(textContext, frame.category.replaceAll("_", " "), 100, 1525, 38, 1, "#d9fff5");
    drawText(textContext, String(frame.prompt).replace(/\s+/g, " ").slice(0, 150), 100, 1600, 34, 3, "#f6f7fb");
    drawText(textContext, "Shop now", 100, 1780, 52, 1, "#111827");
  };
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  const image = await loadImage(imageDataUrl);
  const stream = canvas.captureStream(24);
  const mimeType = ["video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const done = new Promise((resolve) => {
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const buffer = await blob.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      resolve(btoa(binary));
    };
  });

  recorder.start(200);
  const durationMs = 5200;
  const startedAt = performance.now();
  await new Promise((resolve) => {
    const draw = () => {
    const elapsed = performance.now() - startedAt;
    const progress = Math.min(elapsed / durationMs, 1);
    drawFrame(ctx, canvas, image, { title, category, prompt, index, progress });
    if (progress < 1) {
      requestAnimationFrame(draw);
    } else {
      recorder.requestData();
      setTimeout(() => {
        recorder.stop();
        resolve();
      }, 250);
    }
    };
    draw();
  });
  return done;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load product image"));
    image.src = src;
  });
}

function drawFrame(ctx, canvas, image, { title, category, prompt, index, progress }) {
  const width = canvas.width;
  const height = canvas.height;
  const hue = (index * 37) % 360;
  const zoom = 1.05 + progress * 0.08;
  drawBackground(ctx, width, height, hue);
  drawImageCover(ctx, image, 90, 210, 900, 1180, zoom);
  drawPanel(ctx, width, height, hue);
  drawText(ctx, title, 100, 1340, 58, 3, "#ffffff");
  drawText(ctx, category.replaceAll("_", " "), 100, 1525, 38, 1, "#d9fff5");
  drawText(ctx, shortPrompt(prompt), 100, 1600, 34, 3, "#f6f7fb");
  drawText(ctx, "Shop now", 100, 1780, 52, 1, "#111827");
}

function drawBackground(ctx, width, height, hue) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${hue}, 58%, 18%)`);
  gradient.addColorStop(0.55, "#111827");
  gradient.addColorStop(1, `hsl(${(hue + 120) % 360}, 52%, 24%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawImageCover(ctx, image, x, y, width, height, zoom) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 34);
  ctx.clip();
  const scale = Math.max(width / image.width, height / image.height) * zoom;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}

function drawPanel(ctx, width, height, hue) {
  const gradient = ctx.createLinearGradient(0, 1240, 0, height);
  gradient.addColorStop(0, "rgba(17, 24, 39, 0)");
  gradient.addColorStop(0.22, "rgba(17, 24, 39, 0.88)");
  gradient.addColorStop(1, "rgba(17, 24, 39, 0.98)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 1180, width, height - 1180);
  ctx.fillStyle = `hsl(${(hue + 70) % 360}, 92%, 64%)`;
  ctx.roundRect(100, 1760, 320, 86, 43);
  ctx.fill();
}

function drawText(ctx, text, x, y, size, maxLines, color) {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px Arial, sans-serif`;
  const lines = wrapText(ctx, String(text), 880, maxLines);
  lines.forEach((line, lineIndex) => ctx.fillText(line, x, y + lineIndex * size * 1.22));
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function shortPrompt(prompt) {
  return String(prompt).replace(/\s+/g, " ").slice(0, 150);
}

function safeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "product";
}
