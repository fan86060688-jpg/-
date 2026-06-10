import assert from "node:assert/strict";
import { test } from "node:test";

import { renderDashboard } from "../src/dashboard.js";
import { MemoryStore } from "../src/memory-store.js";

test("renderDashboard shows account rules and pending videos", () => {
  const store = new MemoryStore({
    videos: {
      "v-1": {
        videoId: "v-1",
        productName: "Gold necklace shoulder bag",
        category: "Accessories",
        site: "DE",
        status: "pending_confirmation",
        filePath: "data/generated-videos/p/video-1.mp4",
        caption: "caption",
        targetAccount: { neobundAccount: "hertermarwee.shop7" }
      }
    }
  });
  const html = renderDashboard({
    config: {
      categorySiteAccounts: {
        "Accessories:DE": {
          neobundAccount: "hertermarwee.shop7",
          captionTemplate: "{productName}"
        }
      },
      siteAccounts: {},
      categoryAccounts: {}
    },
    store
  });

  assert.match(html, /自动短视频制作发布系统/);
  assert.match(html, /hertermarwee\.shop7/);
  assert.match(html, /Gold necklace shoulder bag/);
  assert.match(html, /确认这个视频/);
});
