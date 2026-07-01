"""Pydantic schemas for the reports module.

A report is a list of malfunctions matching a set of (optional) filters, sorted
for grouping by building → entrance → sale-unit and, within a unit, by location.
Each row carries its activity timeline so the document can render activities
beneath their defect.
"""
from datetime import date

from pydantic import BaseModel


class ReportActivity(BaseModel):
    """One activity (touch-point) shown beneath its defect."""

    number: str | None = None   # short, composed: {short defect number}.{seq}
    occurred_on: date
    action: str
    notes: str | None = None
    performed_by: str | None = None


class ReportRow(BaseModel):
    """One malfunction line in a generated report, with its activities."""

    id: int
    number: str | None = None         # full hierarchical number (kept for reference)
    short_number: str | None = None   # display number, e.g. "F01-7-1"
    # Grouping keys + display names.
    building_id: int | None = None
    building_name: str | None = None
    entrance_id: int | None = None
    entrance_name: str | None = None
    unit_id: int | None = None
    unit_name: str | None = None
    floor_name: str | None = None
    location_name: str | None = None
    professional: str | None = None
    status: str
    status_label: str
    source: str
    source_label: str
    group: str
    group_label: str
    description: str
    opened_at: date
    closed_at: date | None = None
    activities: list[ReportActivity] = []


class ReportAppliedFilter(BaseModel):
    """A single filter that was applied, for the report header."""

    label: str   # e.g. "בניין"
    value: str   # e.g. "בניין A"


class ReportResponse(BaseModel):
    project_id: int
    project_name: str
    project_address: str | None = None
    filters: list[ReportAppliedFilter] = []
    total: int
    rows: list[ReportRow] = []
