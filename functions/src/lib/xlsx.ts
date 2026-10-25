/**
 * Minimal XLSX writer with zero dependencies (runs on Cloudflare Workers and Node alike).
 *
 * An .xlsx file is a ZIP of XML parts; entries stored *uncompressed* (method 0) are perfectly
 * valid, so the whole writer is: build the sheet XML, wrap the parts in a stored ZIP with
 * CRC-32 checksums. Cells use inline strings (no shared-string table to keep in sync) and the
 * first row gets a bold header style. Sheets can be marked right-to-left for Persian reports.
 */

export interface XlsxSheet {
  /** Sheet tab name (max 31 chars per the Excel spec). */
  name: string;
  rows: Array<Array<string | number | null | undefined>>;
  /** Render the sheet right-to-left (Persian). Default true. */
  rtl?: boolean;
  /** Optional column widths (Excel character units), by column index. */
  colWidths?: number[];
  /** Bold the first row. Default true. */
  headerRow?: boolean;
}

const encoder = new TextEncoder();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 1 → A, 26 → Z, 27 → AA … */
export function columnName(index1: number): string {
  let n = index1;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(sheet: XlsxSheet): string {
  const rtl = sheet.rtl !== false;
  const headerRow = sheet.headerRow !== false;
  const cols = (sheet.colWidths ?? [])
    .map((width, i) =>
      width > 0 ? `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>` : '',
    )
    .join('');
  const rows = sheet.rows
    .map((cells, r) => {
      const rowNum = r + 1;
      const rendered = cells
        .map((cell, c) => {
          if (cell === null || cell === undefined || cell === '') return '';
          const ref = `${columnName(c + 1)}${rowNum}`;
          const style = headerRow && r === 0 ? ' s="1"' : '';
          if (typeof cell === 'number' && Number.isFinite(cell))
            return `<c r="${ref}"${style}><v>${cell}</v></c>`;
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(cell))}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNum}">${rendered}</row>`;
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}/></sheetViews>` +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows}</sheetData></worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border/></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
  `</styleSheet>`;

// ─── Stored (uncompressed) ZIP ───────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStored(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 filename flag
    local.setUint16(8, 0, true); // method: stored
    local.setUint32(14, crc, true);
    local.setUint32(18, entry.data.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    const localOffset = offset;
    push(new Uint8Array(local.buffer));
    push(name);
    push(entry.data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); // central directory header
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, entry.data.length, true);
    dir.setUint32(24, entry.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, localOffset, true);
    central.push(new Uint8Array(dir.buffer), name);
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...chunks, ...central, new Uint8Array(end.buffer)]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Builds a complete .xlsx workbook from plain row data. */
export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  const list = sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }];
  const sheetTags = list
    .map((sheet, i) => `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  const workbookRels = list
    .map(
      (_sheet, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('');
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    list
      .map(
        (_sheet, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    `</Types>`;
  const entries = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    {
      name: '_rels/.rels',
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets>${sheetTags}</sheets></workbook>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          workbookRels +
          `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`,
      ),
    },
    { name: 'xl/styles.xml', data: encoder.encode(STYLES_XML) },
    ...list.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: encoder.encode(sheetXml(sheet)),
    })),
  ];
  return zipStored(entries);
}
