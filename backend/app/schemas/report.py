"""Pydantic schemas for the reports module.

A report is a flat list of malfunctions matching a set of (optional) filters,
plus the resolved context needed to render a printable document (project header
and human-readable labels for the filters that were applied).
"""
from datetime import date

from pydantic import BaseModel


class ReportRow(BaseModel):
    """One malfunction line in a generated report."""

    id: int
    number: str | None = None
    building_name: str | None = None
    entrance_name: str | None = None
    floor_name: str | None = None
    unit_name: str | None = None
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
