import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { ManagementReport } from './document';
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
/** Native chart bound to the dashboard's six visible trend cells. */
export function addTrendChart(bytes: Uint8Array, report: ManagementReport): Uint8Array {
  const files = unzipSync(bytes);
  const cats = report.snapshot.trend
    .map((b, i) => `<c:pt idx="${i}"><c:v>${xml(b.label)}</c:v></c:pt>`)
    .join('');
  const values = report.snapshot.trend
    .map((b, i) => `<c:pt idx="${i}"><c:v>${b.completed}</c:v></c:pt>`)
    .join('');
  files['xl/charts/chart1.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:lang val="fa-IR"/><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>تکمیل آموزش</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="047857"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:cat><c:strRef><c:f>'خلاصه مدیریتی'!$A$17:$A$22</c:f><c:strCache><c:ptCount val="6"/>${cats}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>'خلاصه مدیریتی'!$B$17:$B$22</c:f><c:numCache><c:formatCode>0</c:formatCode><c:ptCount val="6"/>${values}</c:numCache></c:numRef></c:val></c:ser><c:gapWidth val="70"/><c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:scaling><c:orientation val="maxMin"/></c:scaling><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="2"/><c:crosses val="autoZero"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="0" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="1"/><c:crosses val="autoZero"/><c:majorUnit val="1"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000"><a:latin typeface="Vazirmatn"/><a:ea typeface="Vazirmatn"/><a:cs typeface="Vazirmatn"/></a:defRPr></a:pPr><a:endParaRPr lang="fa-IR"/></a:p></c:txPr></c:chartSpace>`,
  );
  files['xl/drawings/drawing1.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>15</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>12</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>23</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="1" name="روند تکمیل"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`,
  );
  const rel = (type: string, target: string, id = 'rId1') =>
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  const wrap = (s: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${s}</Relationships>`;
  files['xl/drawings/_rels/drawing1.xml.rels'] = strToU8(
    wrap(rel('chart', '../charts/chart1.xml')),
  );
  const path = 'xl/worksheets/_rels/sheet1.xml.rels';
  const previous = files[path];
  files[path] = strToU8(
    previous
      ? strFromU8(previous).replace(
          '</Relationships>',
          rel('drawing', '../drawings/drawing1.xml', 'rIdReportChart') + '</Relationships>',
        )
      : wrap(rel('drawing', '../drawings/drawing1.xml', 'rIdReportChart')),
  );
  const worksheet = files['xl/worksheets/sheet1.xml'];
  if (!worksheet) throw new Error('Missing dashboard worksheet');
  files['xl/worksheets/sheet1.xml'] = strToU8(
    strFromU8(worksheet).replace(
      '</worksheet>',
      '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdReportChart"/></worksheet>',
    ),
  );
  const types = files['[Content_Types].xml'];
  if (!types) throw new Error('Missing workbook content types');
  files['[Content_Types].xml'] = strToU8(
    strFromU8(types).replace(
      '</Types>',
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>',
    ),
  );
  return zipSync(files, { level: 6 });
}
