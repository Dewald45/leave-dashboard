import "server-only";
import { unzipSync, strFromU8 } from "fflate";

/**
 * Minimal .xlsx reader — enough for simple tabular exports. Returns the first
 * worksheet as an array of string rows. Numbers come back as their raw string;
 * dates stored as Excel serials come back as the serial string (convert with
 * excelSerialToISO). No external spreadsheet library, no macros executed.
 */
export function parseXlsxSheet(buf: Uint8Array): string[][] {
  const files = unzipSync(buf);

  // Shared strings table.
  const shared: string[] = [];
  const ssFile = files["xl/sharedStrings.xml"];
  if (ssFile) {
    const xml = strFromU8(ssFile);
    for (const si of xml.match(/<si\b[\s\S]*?<\/si>/g) || []) {
      shared.push(textOf(si));
    }
  }

  const sheetKey = Object.keys(files).find((n) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(n)
  );
  if (!sheetKey) return [];
  const xml = strFromU8(files[sheetKey]);

  const rows: string[][] = [];
  for (const rowXml of xml.match(/<row\b[\s\S]*?<\/row>/g) || []) {
    const cells: Record<number, string> = {};
    let maxCol = -1;
    const cellMatches =
      rowXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || [];
    for (const cm of cellMatches) {
      const ref = (cm.match(/r="([A-Z]+)\d+"/) || [])[1];
      if (!ref) continue;
      const col = colToIdx(ref);
      maxCol = Math.max(maxCol, col);
      const t = (cm.match(/\bt="([^"]+)"/) || [])[1];
      const v = cm.match(/<v>([\s\S]*?)<\/v>/);
      let val = "";
      if (v) {
        val = t === "s" ? shared[parseInt(v[1], 10)] ?? "" : decodeXml(v[1]);
      } else {
        const is = cm.match(/<is\b[\s\S]*?<\/is>/);
        if (is) val = textOf(is[0]);
      }
      cells[col] = val;
    }
    const arr: string[] = [];
    for (let i = 0; i <= maxCol; i++) arr.push(cells[i] ?? "");
    rows.push(arr);
  }
  return rows;
}

function textOf(xmlFragment: string): string {
  const parts = xmlFragment.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
  return decodeXml(
    parts.map((p) => p.replace(/<t[^>]*>/, "").replace(/<\/t>/, "")).join("")
  );
}

function colToIdx(s: string): number {
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "")
    .replace(/&#x?[0-9a-fA-F]+;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Excel 1900-system serial date → "YYYY-MM-DD". */
export function excelSerialToISO(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
    .toISOString()
    .slice(0, 10);
}
