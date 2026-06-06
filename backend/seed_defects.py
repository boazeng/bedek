"""Seed sample defects + activities for project_id=1. One-off script."""
import sqlite3
import random
from datetime import date, timedelta
from pathlib import Path

DB = Path(__file__).with_name("cmm.db")

conn = sqlite3.connect(DB)
c = conn.cursor()

# Wipe project 1 defects (legacy seed referenced sale_units, not project_items).
c.execute(
    "DELETE FROM malfunction_activities WHERE malfunction_id IN "
    "(SELECT id FROM malfunctions WHERE project_id=1)"
)
c.execute("DELETE FROM malfunctions WHERE project_id=1")

buyer_ids = [b[0] for b in c.execute("SELECT id FROM buyers WHERE company_id=1")]

# Leaf units only (units that don't contain other units)
units = c.execute(
    """
    SELECT id, name FROM project_items
    WHERE project_id=1 AND kind='unit'
    AND id NOT IN (
        SELECT DISTINCT parent_id FROM project_items
        WHERE project_id=1 AND kind='unit' AND parent_id IS NOT NULL
    )
    """
).fetchall()
print(f"leaf units: {len(units)}")

sample_units = random.sample(units, min(10, len(units))) if units else []
descriptions = [
    'סדק בקיר הסלון', 'ברז דולף במטבח', 'תקע חשמל לא עובד',
    'אריח רצפה שבור', 'דלת חדר השינה לא נסגרת', 'סימני רטיבות בתקרה',
    'חלון שלא נסגר עד הסוף', 'מתג אור פגום', 'צבע מתקלף מהקיר',
    'מקלחת לא מתנקזת', 'דלת ארון שבורה', 'תריס פגום',
]
groups = ['electricity', 'plumbing', 'finishes', 'sealing', 'aluminum']
sources = ['manual', 'whatsapp', 'bedek_report', 'inspector_tour']
professionals = ['חשמלאי - דני', 'אינסטלטור - יוסי', 'גמרים - אבי', 'אלומיניום - שמואל', None]
actions = [
    'ביקור אבחון', 'הגיעו לתקן', 'הוחלף החלק הפגום', 'תיקון ראשוני',
    'תיאום מול הלקוח', 'צבע יד ראשונה', 'צבע יד שנייה', 'בדיקה סופית',
]

today = date.today()
defect_count, activity_count = 0, 0
for unit_id, unit_name in sample_units:
    locs = c.execute(
        "SELECT id, name FROM project_items WHERE parent_id=? AND kind='location'",
        (unit_id,),
    ).fetchall()
    if not locs:
        continue
    buyer = random.choice(buyer_ids) if buyer_ids else None
    n_defects = random.randint(1, 4)
    for _ in range(n_defects):
        loc_id, _ = random.choice(locs)
        opened = today - timedelta(days=random.randint(0, 90))
        prof = random.choice(professionals)
        c.execute(
            """
            INSERT INTO malfunctions(company_id, project_id, project_item_id, buyer_id,
                                     status, source, "group", description, professional,
                                     opened_at, created_at, updated_at)
            VALUES(1, 1, ?, ?, 'todo', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            """,
            (loc_id, buyer, random.choice(sources), random.choice(groups),
             random.choice(descriptions), prof, opened.isoformat()),
        )
        defect_id = c.lastrowid
        defect_count += 1
        for _ in range(random.randint(0, 3)):
            occ = opened + timedelta(days=random.randint(1, 30))
            c.execute(
                """
                INSERT INTO malfunction_activities(company_id, malfunction_id, occurred_on,
                                                   action, performed_by, created_at)
                VALUES(1, ?, ?, ?, ?, datetime('now'))
                """,
                (defect_id, occ.isoformat(), random.choice(actions),
                 prof or 'מנהל פרויקט'),
            )
            activity_count += 1

conn.commit()
print(f"Created {defect_count} defects with {activity_count} activities")
