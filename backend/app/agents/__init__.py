"""AI agents.

This layer holds anything that calls an LLM or runs a non-trivial inference:
- bedek report PDF parser (extract defects from a PDF into Malfunction rows)
- defect-group classifier (label "סדק בקיר" → electricity/finishes/...)
- end-customer chat assistant (later)

Agents MUST:
- Be called from `services/` or `api/`, never from `models/`.
- Receive plain data (paths, strings, ids) — not DB session objects.
- Return plain data (Pydantic models or dicts), and let the caller persist it.
- Live in their own subfolder if they need >1 file (e.g. `agents/bedek_parser/`).
"""
