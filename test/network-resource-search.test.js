import assert from "node:assert/strict";
import { test } from "node:test";

import { searchNetworkResources } from "../src/network-resource-search.js";

test("searchNetworkResources returns resource URLs matching patterns", async () => {
  const page = {
    async goto() {},
    async evaluate() {
      return [
        "https://cdn.example.test/order-list.js",
        "https://cdn.example.test/product.js"
      ];
    }
  };

  const report = await searchNetworkResources({
    url: "https://erp.91miaoshou.com/welcome",
    patterns: ["order"],
    browserFactory: async () => ({
      newPage: async () => page,
      close: async () => {}
    })
  });

  assert.deepEqual(report.matches, ["https://cdn.example.test/order-list.js"]);
});
