import type { ReportRow } from './api'

/** A sale-unit bucket within a building+entrance section. */
export type ReportUnitGroup = {
  unitId: number | null
  unitName: string | null
  floorName: string | null
  rows: ReportRow[]
}

/** A building+entrance section. */
export type ReportSection = {
  key: string
  buildingName: string | null
  entranceName: string | null
  units: ReportUnitGroup[]
}

/**
 * Group already-sorted report rows into building+entrance sections, then by
 * sale unit. Relies on the server's ordering (building → entrance → unit →
 * location) so consecutive rows fall into the same bucket.
 */
export function groupReportRows(rows: ReportRow[]): ReportSection[] {
  const sections: ReportSection[] = []
  const sectionByKey = new Map<string, ReportSection>()
  const unitByKey = new Map<string, ReportUnitGroup>()

  for (const r of rows) {
    const sKey = `${r.building_id ?? 'x'}|${r.entrance_id ?? 'x'}`
    let section = sectionByKey.get(sKey)
    if (!section) {
      section = {
        key: sKey,
        buildingName: r.building_name,
        entranceName: r.entrance_name,
        units: [],
      }
      sectionByKey.set(sKey, section)
      sections.push(section)
    }

    const uKey = `${sKey}|${r.unit_id ?? 'none'}`
    let unit = unitByKey.get(uKey)
    if (!unit) {
      unit = {
        unitId: r.unit_id,
        unitName: r.unit_name,
        floorName: r.floor_name,
        rows: [],
      }
      unitByKey.set(uKey, unit)
      section.units.push(unit)
    }
    unit.rows.push(r)
  }

  return sections
}
