import { readFile } from "node:fs/promises";

export function createFileInputAdapters({ ordersPath = "data/input/orders.json" } = {}) {
  return {
    miaoshou: {
      async listOrdersSinceLastRun() {
        const raw = await readFile(ordersPath, "utf8");
        return JSON.parse(raw);
      }
    },
    promptGenerator: {
      async createPrompts({ product, count }) {
        return Array.from({ length: count }, (_, index) =>
          [
            `Create a high-converting TikTok product video for ${product.productName}.`,
            `Show the product from the main image clearly, focus on category ${product.category}.`,
            `Variation ${index + 1}: use a distinct hook, scene rhythm, and benefit angle.`,
            "Keep it natural, mobile-first, visually dynamic, and suitable for ecommerce conversion."
          ].join(" ")
        );
      }
    },
    neobund: {
      async enqueueForConfirmation(item) {
        return { confirmationId: `local-review-${item.videoId}` };
      },
      async publishConfirmed(video) {
        return {
          platform: "neobund",
          status: "published",
          publishedAt: new Date().toISOString(),
          videoId: video.videoId
        };
      }
    }
  };
}
