import assert from "node:assert/strict";
import { test } from "node:test";

import { searchBrowserStorage } from "../src/browser-storage.js";

test("searchBrowserStorage finds matching local storage values", async () => {
  const page = {
    async goto() {},
    async evaluate() {
      return {
        localStorage: { menu: "订单管理 /order/list" },
        sessionStorage: { token: "abc" }
      };
    }
  };

  const report = await searchBrowserStorage({
    url: "https://erp.91miaoshou.com/welcome",
    patterns: ["订单", "order"],
    browserFactory: async () => ({
      newPage: async () => page,
      close: async () => {}
    })
  });

  assert.deepEqual(report.matches, [
    {
      store: "localStorage",
      key: "menu",
      value: "订单管理 /order/list"
    }
  ]);
});
