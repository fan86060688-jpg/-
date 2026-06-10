import { readFile } from "node:fs/promises";

export async function loadConfig(path = "config/config.json") {
  const raw = await readFile(path, "utf8");
  const config = JSON.parse(raw);
  validateConfig(config);
  return config;
}

export function validateConfig(config) {
  if (!Number.isInteger(config.videoCountPerProduct) || config.videoCountPerProduct < 1) {
    throw new Error("config.videoCountPerProduct must be a positive integer");
  }
  if (!config.categoryAccounts || typeof config.categoryAccounts !== "object") {
    throw new Error("config.categoryAccounts is required");
  }
  for (const [category, account] of Object.entries(config.categoryAccounts)) {
    for (const field of ["neobundAccount", "tiktokAccount", "captionTemplate"]) {
      if (!account[field]) {
        throw new Error(`categoryAccounts["${category}"].${field} is required`);
      }
    }
  }
  if (config.liveAutomation) {
    validateLiveAutomation(config.liveAutomation);
  }
  return config;
}

function validateLiveAutomation(liveAutomation) {
  const required = {
    miaoshou: miaoshouRequiredPaths(liveAutomation.miaoshou),
    tiktokCreativeStudio: [
      "imageToVideoUrl",
      "imageInput",
      "promptInput",
      "generateButton",
      "downloadButton"
    ],
    neobund: [
      "managementUrl",
      "accountSearchInput",
      "accountOption",
      "uploadInput",
      "captionInput",
      "publishButton"
    ]
  };

  for (const [section, paths] of Object.entries(required)) {
    for (const path of paths) {
      if (!readPath(liveAutomation[section], path)) {
        throw new Error(`liveAutomation.${section}.${path} is required`);
      }
    }
  }
}

function miaoshouRequiredPaths(miaoshou = {}) {
  if (miaoshou.orderApiUrl) {
    return ["ordersUrl", "orderApiUrl"];
  }
  return [
    "ordersUrl",
    "orderRow",
    "fields.orderId",
    "fields.productId",
    "fields.productName",
    "fields.category",
    "fields.mainImage"
  ];
}

function readPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}
