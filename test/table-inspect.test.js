import assert from "node:assert/strict";
import { test } from "node:test";

import { summarizeTableCandidates } from "../src/table-inspect.js";

test("summarizeTableCandidates extracts rows with images and cell text", () => {
  const summary = summarizeTableCandidates([
    {
      selector: "table tbody tr",
      cells: ["order-1", "LED Mirror", "Home Decor"],
      images: ["https://example.test/mirror.jpg"],
      links: ["https://example.test/order-1"]
    }
  ]);

  assert.deepEqual(summary, {
    rowSelectors: ["table tbody tr"],
    sampleRows: [
      {
        selector: "table tbody tr",
        cells: ["order-1", "LED Mirror", "Home Decor"],
        images: ["https://example.test/mirror.jpg"],
        links: ["https://example.test/order-1"]
      }
    ]
  });
});
