"""
Reads a backup exported from the app (Historial > Exportar copia) and prints
your progress for each exercise.

    python tools/progress_report.py rutina-copia-2026-10-26.json

Good practice for Python: reading JSON, loops, dictionaries, sorting, and
formatting text. Ideas to try next: save a CSV for Excel, or draw a chart
with matplotlib (pip install matplotlib).
"""

import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROUTINE_FILE = Path(__file__).resolve().parent.parent / "docs" / "data" / "exercises.json"


def to_number(text):
    """'42,5' -> 42.5, '' -> None. People type commas on a Spanish keyboard."""
    try:
        return float(str(text).replace(",", "."))
    except ValueError:
        return None


def estimated_1rm(kg, reps):
    """Epley formula: a rough guess of the most you could lift once."""
    return kg * (1 + reps / 30)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    sys.stdout.reconfigure(encoding="utf-8")  # so accents print well on Windows
    backup = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    routine = json.loads(ROUTINE_FILE.read_text(encoding="utf-8"))
    names = {ex["id"]: ex["name"] for ex in routine["exercises"]}
    kinds = {ex["id"]: ex["log"] for ex in routine["exercises"]}

    sessions = sorted(backup["sessions"], key=lambda s: s["startedAt"])
    print(f"{len(sessions)} entrenos, del {sessions[0]['startedAt'][:10]} al {sessions[-1]['startedAt'][:10]}\n")

    # history["sentadilla"] = [(date, best_kg, best_1rm), ...]
    history = defaultdict(list)
    for session in sessions:
        day = datetime.fromisoformat(session["startedAt"].replace("Z", "+00:00")).date()
        for item in session["items"]:
            if kinds.get(item["exId"]) != "weight":
                continue
            best_kg = best_1rm = 0
            for s in item["sets"]:
                kg, reps = to_number(s.get("kg", "")), to_number(s.get("reps", ""))
                if s.get("done") and kg and reps:
                    best_kg = max(best_kg, kg)
                    best_1rm = max(best_1rm, estimated_1rm(kg, reps))
            if best_kg:
                history[item["exId"]].append((day, best_kg, best_1rm))

    print(f"{'Ejercicio':32} {'Veces':>5} {'Primero':>8} {'Último':>8} {'Cambio':>8} {'1RM est.':>9}")
    print("-" * 75)
    for ex_id, rows in sorted(history.items(), key=lambda kv: names.get(kv[0], kv[0])):
        first, last = rows[0][1], rows[-1][1]
        change = last - first
        print(f"{names.get(ex_id, ex_id)[:32]:32} {len(rows):>5} {first:>7g}k {last:>7g}k "
              f"{change:>+7g}k {max(r[2] for r in rows):>8.1f}k")


if __name__ == "__main__":
    main()
