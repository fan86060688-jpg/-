export function summarizeTableCandidates(rows) {
  return {
    rowSelectors: [...new Set(rows.map((row) => row.selector))],
    sampleRows: rows.slice(0, 10)
  };
}

export async function collectTableCandidates(page) {
  try {
    return await page.$$eval("table tbody tr, [role=row], .ant-table-row", (rows) =>
      rows.slice(0, 20).map((row) => ({
        selector: row.matches?.(".ant-table-row")
          ? ".ant-table-row"
          : row.getAttribute("role") === "row"
            ? "[role=row]"
            : "table tbody tr",
        cells: [...row.querySelectorAll("td, [role=cell], .ant-table-cell")]
          .map((cell) => (cell.textContent ?? "").trim())
          .filter(Boolean)
          .slice(0, 12),
        images: [...row.querySelectorAll("img")]
          .map((image) => image.getAttribute("src") ?? "")
          .filter(Boolean)
          .slice(0, 5),
        links: [...row.querySelectorAll("a")]
          .map((link) => link.getAttribute("href") ?? "")
          .filter(Boolean)
          .slice(0, 5)
      }))
    );
  } catch {
    return [];
  }
}
