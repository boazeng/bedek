"""Business-logic services.

This layer holds the orchestration that doesn't belong in any single endpoint:
- ingest a bedek PDF: call agent → persist defects → notify users
- create a defect from WhatsApp: parse text → resolve unit → write Malfunction
- close a defect: update row → notify resident → archive attachments

Services MUST:
- Receive a DB session as a parameter (don't open new sessions).
- Be the only place that calls `agents/` and `integrations/` together with
  `models/` writes — endpoints stay thin, agents stay pure.
- Return plain data (not ORM rows owned by another session).
"""
