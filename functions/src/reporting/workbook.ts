import { strToU8, strFromU8, zipSync } from 'fflate';
import template from './workbook-template.json';
import { addTrendChart } from './xlsx-chart';
import { type ManagementReport, reportDate } from './document';
const escape = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const column = (n: number): string =>
  n > 26
    ? column(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26))
    : String.fromCharCode(64 + n);
type Value = string | number | null | undefined;
function pageSetup(xml: string, dashboard: boolean) {
  if (xml.includes('</sheetPr>'))
    xml = xml.replace('</sheetPr>', '<pageSetUpPr fitToPage="1"/></sheetPr>');
  else
    xml = xml.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
  xml = xml.replace(/<pageMargins\b[^>]*\/>/, '').replace(/<pageSetup\b[^>]*\/>/, '');
  return xml.replace(
    '</worksheet>',
    `<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="${dashboard ? 1 : 0}"/></worksheet>`,
  );
}
function layout(xml: string) {
  const cells = new Map<string, string>();
  const heights = new Map<number, string>();
  for (const row of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const attrs = row[1] ?? '';
    const r = Number(attrs.match(/\br="(\d+)"/)?.[1]);
    heights.set(r, attrs.replace(/\br="\d+"/, '').trim());
    for (const c of (row[2] ?? '').matchAll(/<c\b([^>]*)(?:\/>|>[\s\S]*?<\/c>)/g)) {
      const ref = c[1]?.match(/\br="([A-Z]+\d+)"/)?.[1];
      if (ref) cells.set(ref, c[1]?.match(/\bs="(\d+)"/)?.[1] ?? '0');
    }
  }
  return { cells, heights };
}
function cell(ref: string, value: Value, style: string) {
  const tag = `<c r="${ref}" s="${style}"`;
  if (value === null || value === undefined || value === '') return tag + '/>';
  if (typeof value === 'number' && Number.isFinite(value)) return `${tag}><v>${value}</v></c>`;
  return `${tag} t="inlineStr"><is><t xml:space="preserve">${escape(String(value))}</t></is></c>`;
}
/** Populate the designed template; no spreadsheet engine or Node APIs run in the Worker. */
export async function renderManagementWorkbook(report: ManagementReport): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const [name, source] of Object.entries(template)) files[name] = strToU8(source);
  const source = template['xl/worksheets/sheet1.xml'];
  const frame = layout(source);
  const values = new Map<string, Value>();
  const set = (r: number, c: number, v: Value) => values.set(`${column(c)}${r}`, v);
  set(1, 1, 'آکادمی سیلانه · گزارش مدیریتی آموزش');
  set(2, 1, `مدیر: ${report.managerName} · محدوده: ${report.scopeName}`);
  set(3, 1, report.period);
  report.kpis.forEach((k, i) => {
    const r = 5 + Math.floor(i / 4) * 5,
      c = 1 + (i % 4) * 3;
    set(r, c, k.label);
    set(r + 1, c, k.value ?? '—');
    set(r + 2, c, `${k.unit} · ${k.context}`);
  });
  set(15, 1, 'روند تکمیل آموزش در بازه');
  set(16, 1, 'بخش بازه');
  set(16, 2, 'تکمیل');
  report.snapshot.trend.forEach((b, i) => {
    set(i + 17, 1, b.label);
    set(i + 17, 2, b.completed);
  });
  set(25, 1, 'اولویت پیگیری · شش مورد نخست');
  ['نام بازاریاب', 'آموزش', 'علت', 'پیشرفت (٪)'].forEach((v, i) => set(26, i * 3 + 1, v));
  report.priorities.forEach((p, i) =>
    [p.name, p.training, p.reason, p.progress].forEach((v, j) => set(i + 27, j * 3 + 1, v)),
  );
  if (!report.priorities.length) set(27, 1, 'موردی برای پیگیری ثبت نشده است.');
  set(35, 1, 'معیارهای تکمیلی');
  [
    ['آموزش تخصیص‌یافته فعلی', report.snapshot.assignments],
    ['تکمیل‌شده فعلی', report.snapshot.completed],
    ['در حال انجام', report.snapshot.inProgress],
    ['شروع‌نشده', report.snapshot.notStarted],
    ['تکمیل در دوره قبل', report.snapshot.previousPeriodCompleted ?? '—'],
    ['نرخ تکمیل به‌موقع (٪)', report.snapshot.onTimeRate ?? '—'],
    ['آزمون دارای نتیجه در بازه', report.snapshot.quizScoredAttempts],
    ['قبولی آزمون در بازه', report.snapshot.quizPassed],
    ['اعضای محدوده گزارش', report.snapshot.teamMembers],
    ['میانگین پیشرفت فعلی (٪)', report.snapshot.averageProgress ?? '—'],
  ].forEach((m, i) => {
    const r = 36 + Math.floor(i / 2),
      c = 1 + (i % 2) * 6;
    set(r, c, m[0]);
    set(r, c + 4, m[1]);
  });
  set(
    41,
    1,
    'شاخص‌های بازه بر اساس زمان ثبت تکمیل و ارسال آزمون محاسبه شده‌اند. وضعیت فعلی، تخصیص‌ها و دیرکرد، تصویر زمان تولید گزارش هستند.',
  );
  set(44, 1, `تولید: ${reportDate(report.generatedAt)} · منبع: سامانه آکادمی سیلانه · زمان: تهران`);
  let data = '';
  for (let r = 1; r <= 44; r++) {
    const height = [4, 8, 9, 13, 14, 24, 33, 34, 43].includes(r)
      ? 4
      : [1, 6, 11].includes(r)
        ? 30
        : [15, 25, 35].includes(r)
          ? 25
          : r >= 27 && r <= 32
            ? 25
            : 18;
    data += `<row r="${r}" ht="${height}" customHeight="1">`;
    for (let c = 1; c <= 12; c++) {
      const ref = `${column(c)}${r}`;
      const kpiRow = [5, 6, 7, 10, 11, 12].includes(r);
      const styleRef = kpiRow ? `A${r}` : r === 39 || r === 40 ? `${column(c)}36` : ref;
      data += cell(ref, values.get(ref), frame.cells.get(styleRef) ?? '0');
    }
    data += '</row>';
  }
  files['xl/worksheets/sheet1.xml'] = strToU8(
    pageSetup(
      source
        .replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${data}</sheetData>`)
        .replace(
          /<mergeCells count="(\d+)">/,
          (_, count: string) => `<mergeCells count="${Number(count) + 8}">`,
        )
        .replace(
          '</mergeCells>',
          [39, 40]
            .map((r) =>
              [
                ['A', 'D'],
                ['E', 'F'],
                ['G', 'J'],
                ['K', 'L'],
              ]
                .map(([a, b]) => `<mergeCell ref="${a}${r}:${b}${r}"/>`)
                .join(''),
            )
            .join('') + '</mergeCells>',
        ),
      true,
    ),
  );
  report.tables.forEach((table, i) => {
    const name = `xl/worksheets/sheet${i + 2}.xml`;
    let xml = (template as Record<string, string>)[name];
    if (!xml) throw new Error('Missing report template');
    const styles = layout(xml);
    const row = (r: number, values: Value[], styleRow: number, height = 27) =>
      `<row r="${r}" ht="${height}" customHeight="1">${values.map((v, c) => cell(`${column(c + 1)}${r}`, v, styles.cells.get(`${column(c + 1)}${styleRow}`) ?? styles.cells.get(`A${styleRow}`) ?? '0')).join('')}</row>`;
    let body =
      row(1, [`${report.title} · ${table.name}`], 1, 30) +
      row(2, [`مدیر: ${report.managerName} · ${report.scopeName} · ${report.period}`], 2, 25) +
      row(3, [table.note], 3, 22) +
      row(5, table.columns, 5, 28);
    if (table.rows.length)
      body += table.rows
        .map((v, j) => {
          const lines = Math.max(
            1,
            ...v.map((value, c) =>
              String(value ?? '')
                .split('\n')
                .reduce(
                  (sum, line) =>
                    sum +
                    Math.max(1, Math.ceil(line.length / Math.max(8, (table.widths[c] ?? 20) - 2))),
                  0,
                ),
            ),
          );
          return row(j + 6, v, j % 2 ? 7 : 6, Math.max(25, lines * 13 + 6));
        })
        .join('');
    else body += row(6, ['در این محدوده و بازه، رکوردی ثبت نشده است.'], 6);
    const end = Math.max(6, table.rows.length + 5);
    body += row(
      end + 2,
      [
        `تعداد ردیف: ${table.rows.length.toLocaleString('fa-IR')} · ${reportDate(report.generatedAt)}`,
      ],
      2,
      28,
    );
    xml = xml
      .replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${body}</sheetData>`)
      .replace(/<mergeCells\b[^>]*>[\s\S]*?<\/mergeCells>/, '')
      .replace(/<autoFilter\b[^>]*\/>/, '');
    const merge = `<autoFilter ref="A5:${column(table.columns.length)}${end}"/><mergeCells count="4">${[1, 2, 3, end + 2].map((r) => `<mergeCell ref="A${r}:${column(table.columns.length)}${r}"/>`).join('')}</mergeCells>`;
    xml = xml
      .replace('</sheetData>', '</sheetData>' + merge)
      .replace(
        /<dimension\b[^>]*\/>/,
        `<dimension ref="A1:${column(table.columns.length)}${end + 2}"/>`,
      );
    if (!xml.includes('<sheetViews>'))
      xml = xml.replace(
        '<sheetFormatPr',
        '<sheetViews><sheetView workbookViewId="0" rightToLeft="1" showGridLines="0"/></sheetViews><sheetFormatPr',
      );
    if (!xml.includes('<pane'))
      xml = xml.replace(
        /<sheetView\b([^>]*)\/>/,
        `<sheetView$1><pane xSplit="1" ySplit="5" topLeftCell="B6" activePane="bottomRight" state="frozen"/></sheetView>`,
      );
    files[name] = strToU8(pageSetup(xml, false));
  });
  const workbook = files['xl/workbook.xml'];
  if (!workbook) throw new Error('Missing workbook');
  const names = `<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'خلاصه مدیریتی'!$A$1:$L$44</definedName>${report.tables.map((t, i) => `<definedName name="_xlnm.Print_Titles" localSheetId="${i + 1}">'${escape(t.name)}'!$1:$5</definedName>`).join('')}</definedNames>`;
  files['xl/workbook.xml'] = strToU8(
    strFromU8(workbook).replace('</workbook>', names + '</workbook>'),
  );
  return addTrendChart(zipSync(files, { level: 1 }), report);
}
