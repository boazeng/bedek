import type { ReportResponse } from '../lib/api'

/** Escape a value for safe embedding in HTML text/attributes. */
function esc(v: string | null | undefined): string {
  if (v == null) return ''
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Build a standalone, print-ready HTML document for a malfunctions report.
 * Opened in a new window; it auto-invokes the browser's print dialog so the
 * user can "Save as PDF". Hebrew RTL is rendered natively by the browser.
 */
export function buildReportHtml(report: ReportResponse): string {
  const now = new Date().toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const filterChips = report.filters.length
    ? report.filters
        .map((f) => `<span class="chip"><b>${esc(f.label)}:</b> ${esc(f.value)}</span>`)
        .join('')
    : '<span class="chip muted">ללא סינון — כל התקלות</span>'

  const rows = report.rows
    .map(
      (r) => `<tr>
        <td>${esc(r.number)}</td>
        <td>${esc(r.building_name)}</td>
        <td>${esc(r.entrance_name)}</td>
        <td>${esc(r.unit_name)}</td>
        <td>${esc(r.location_name)}</td>
        <td>${esc(r.professional)}</td>
        <td>${esc(r.status_label)}</td>
        <td>${esc(r.source_label)}</td>
        <td>${esc(r.group_label)}</td>
        <td class="nowrap">${esc(r.opened_at)}</td>
        <td class="desc">${esc(r.description)}</td>
      </tr>`,
    )
    .join('')

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>דוח תקלות — ${esc(report.project_name)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Heebo', 'Segoe UI', Arial, sans-serif;
    color: #1F3A5F;
    margin: 0;
    padding: 18px;
    direction: rtl;
  }
  .head { border-bottom: 2px solid #1F3A5F; padding-bottom: 10px; margin-bottom: 12px; }
  .title { font-size: 20px; font-weight: 700; }
  .sub { font-size: 12px; color: #706A60; margin-top: 2px; }
  .meta { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .filters { margin: 10px 0 4px; display: flex; gap: 6px; flex-wrap: wrap; }
  .chip {
    font-size: 11px; background: #FAF9F5; border: 1px solid #E7E2D6;
    border-radius: 999px; padding: 3px 10px;
  }
  .chip.muted { color: #706A60; }
  .count { font-size: 12px; color: #706A60; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th {
    background: #1F3A5F; color: #fff; text-align: right; padding: 6px 8px;
    font-weight: 600; white-space: nowrap;
  }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #E7E2D6; vertical-align: top; }
  tbody tr:nth-child(even) { background: #FAF9F5; }
  .desc { min-width: 220px; }
  .nowrap { white-space: nowrap; }
  .foot { margin-top: 14px; font-size: 10px; color: #706A60; text-align: center; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="head">
    <div class="meta">
      <div>
        <div class="title">דוח תקלות — ${esc(report.project_name)}</div>
        ${report.project_address ? `<div class="sub">${esc(report.project_address)}</div>` : ''}
      </div>
      <div class="sub">הופק בתאריך ${esc(now)}</div>
    </div>
    <div class="filters">${filterChips}</div>
  </div>

  <div class="count">סה"כ <b>${report.total}</b> תקלות</div>

  <table>
    <thead>
      <tr>
        <th>מס'</th>
        <th>בניין</th>
        <th>כניסה</th>
        <th>דירה</th>
        <th>מיקום</th>
        <th>בעל מקצוע</th>
        <th>סטטוס</th>
        <th>מקור</th>
        <th>קבוצה</th>
        <th>נפתח</th>
        <th>תיאור</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="foot">CMM — ניהול ליקויי בנייה</div>

  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 250);
    });
  </script>
</body>
</html>`
}
