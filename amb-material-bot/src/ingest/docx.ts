// Plain text out of a Word document, so intake notes saved as .docx need no
// conversion by hand. A .docx is a zip whose word/document.xml holds the
// text; this reads that one entry with node:zlib and drops the markup.
// Paragraphs become lines, tabs stay tabs, tables read row by row. Nothing
// else (images, headers, tracked changes) is needed for intake notes.

import fs from "node:fs";
import zlib from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Read one file out of a zip archive, or undefined when it is not there. */
export function readZipEntry(archive: Buffer, name: string): Buffer | undefined {
  // The end-of-central-directory record sits in the last 64 KiB (comment included).
  let eocd = -1;
  for (let i = archive.length - 22; i >= Math.max(0, archive.length - 65_557); i--) {
    if (archive.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip archive (no end-of-central-directory record)");
  const entries = archive.readUInt16LE(eocd + 10);
  let offset = archive.readUInt32LE(eocd + 16);

  for (let n = 0; n < entries; n++) {
    if (archive.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new Error("Corrupt zip central directory");
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const entryName = archive.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (entryName !== name) continue;

    if (archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new Error("Corrupt zip local header");
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = archive.subarray(start, start + compressedSize);
    if (method === 0) return Buffer.from(data);
    if (method === 8) return zlib.inflateRawSync(data);
    throw new Error(`Unsupported zip compression method ${method} for ${name}`);
  }
  return undefined;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Text of word/document.xml: one line per paragraph, table cells separated by tabs. */
export function docxXmlToText(xml: string): string {
  // Only a bare <w:tab/> is a tab character; <w:tab w:val=.../> inside <w:tabs> is a tab stop.
  const body = xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>|<w:cr\/>/g, "\n")
    // A cell's last paragraph ends with the cell, not a line; a table row ends with a line.
    .replace(/<\/w:p>(\s*<\/w:tc>)/g, "$1")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(body)
    .split("\n")
    .map((line) => line.replace(/\t+$/, "").replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function readDocxText(file: string): string {
  const xml = readZipEntry(fs.readFileSync(file), "word/document.xml");
  if (!xml) throw new Error(`${file} has no word/document.xml; is it a Word document?`);
  return docxXmlToText(xml.toString("utf8"));
}
