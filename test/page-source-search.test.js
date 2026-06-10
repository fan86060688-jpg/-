import assert from "node:assert/strict";
import { test } from "node:test";

import { searchPageSource } from "../src/page-source-search.js";

test("searchPageSource returns matching hrefs and text snippets", async () => {
  const page = {
    async goto() {},
    async evaluate() {
      return {
        hrefs: ["/orders", "/products"],
        text: "订单管理\n产品管理"
      };
    }
  };

  const result = await searchPageSource({
    url: "https://erp.91miaoshou.com/welcome",
    patterns: ["order", "订单"],
    browserFactory: async () => ({
      newPage: async () => page,
      close: async () => {}
    })
  });

  assert.deepEqual(result.hrefs, ["/orders"]);
  assert.deepEqual(result.textMatches, ["订单管理"]);
});
