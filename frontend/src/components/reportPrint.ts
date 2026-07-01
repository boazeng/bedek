import type { ReportResponse, ReportRow } from '../lib/api'
import { groupReportRows } from '../lib/reportGroup'

/** Escape a value for safe embedding in HTML text/attributes. */
function esc(v: string | null | undefined): string {
  if (v == null) return ''
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function activitiesHtml(r: ReportRow): string {
  if (!r.activities.length) return ''
  const items = r.activities
    .map((a) => {
      const meta = [a.occurred_on, a.performed_by].filter(Boolean).map(esc).join(' · ')
      const note = a.notes ? ` — ${esc(a.notes)}` : ''
      return `<li><span class="amk">${meta}</span> ${esc(a.action)}${note}</li>`
    })
    .join('')
  return `<tr class="acts"><td></td><td colspan="4">
      <div class="acts-title">פעילויות</div>
      <ul class="acts-list">${items}</ul>
    </td></tr>`
}

function unitHtml(unitName: string | null, floorName: string | null, rows: ReportRow[]): string {
  const heading = [unitName || 'ללא יחידה', floorName].filter(Boolean).map(esc).join(' · ')
  const body = rows
    .map(
      (r) => `<tr class="defect">
        <td class="nowrap">${esc(r.short_number)}</td>
        <td>${esc(r.location_name)}</td>
        <td class="desc">${esc(r.description)}</td>
        <td>${esc(r.professional)}</td>
        <td>${esc(r.status_label)}</td>
      </tr>${activitiesHtml(r)}`,
    )
    .join('')
  return `<div class="unit">
    <div class="unit-h">${heading} <span class="unit-count">(${rows.length})</span></div>
    <table>
      <thead><tr>
        <th class="nowrap">מספר</th><th>מיקום</th><th>תיאור התקלה</th><th>מקצוע</th><th>סטטוס</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`
}

/**
 * Build a standalone, print-ready HTML document for a malfunctions report.
 * Grouped by building+entrance → sale-unit, sorted by location within a unit,
 * with each defect's activities listed beneath it. Auto-opens the print dialog
 * so the user can "Save as PDF". Hebrew RTL is rendered natively by the browser.
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

  const sections = groupReportRows(report.rows)
    .map((s) => {
      const title = [s.buildingName, s.entranceName].filter(Boolean).map(esc).join(' · ') || '—'
      const units = s.units.map((u) => unitHtml(u.unitName, u.floorName, u.rows)).join('')
      return `<section class="sec">
        <div class="sec-h">${title}</div>
        ${units}
      </section>`
    })
    .join('')

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>דוח תקלות — ${esc(report.project_name)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Heebo', 'Segoe UI', Arial, sans-serif;
    color: #1F3A5F; margin: 0; padding: 18px; direction: rtl;
  }
  .head { border-bottom: 2px solid #1F3A5F; padding-bottom: 10px; margin-bottom: 12px; }
  .title { font-size: 20px; font-weight: 700; }
  .sub { font-size: 12px; color: #706A60; margin-top: 2px; }
  .meta { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .filters { margin: 10px 0 4px; display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { font-size: 11px; background: #FAF9F5; border: 1px solid #E7E2D6; border-radius: 999px; padding: 3px 10px; }
  .chip.muted { color: #706A60; }
  .count { font-size: 12px; color: #706A60; margin-bottom: 10px; }

  .sec { margin-bottom: 16px; break-inside: avoid; }
  .sec-h {
    font-size: 14px; font-weight: 700; color: #fff; background: #1F3A5F;
    padding: 6px 10px; border-radius: 6px;
  }
  .unit { margin: 8px 0 10px; break-inside: avoid; }
  .unit-h { font-size: 12.5px; font-weight: 700; color: #1F3A5F; margin: 8px 2px 4px; }
  .unit-count { color: #706A60; font-weight: 400; font-size: 11px; }

  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th {
    background: #FAF9F5; color: #1F3A5F; text-align: right; padding: 5px 8px;
    font-weight: 600; border-bottom: 1px solid #E7E2D6; white-space: nowrap;
  }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #EFEBE0; vertical-align: top; }
  tr.defect td { font-weight: 500; }
  .desc { min-width: 180px; }
  .nowrap { white-space: nowrap; }

  tr.acts td { background: #FCFBF7; padding-top: 2px; }
  .acts-title { font-size: 9.5px; color: #706A60; font-weight: 700; margin-bottom: 2px; }
  .acts-list { margin: 0 0 4px; padding-in-start: 16px; padding-inline-start: 16px; }
  .acts-list li { font-size: 10px; color: #4a4a4a; margin-bottom: 1px; }
  .acts-list .amk { color: #706A60; }

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

  ${sections}

  <div class="foot">CMM — ניהול ליקויי בנייה</div>

  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 250);
    });
  </script>
</body>
</html>`
}
