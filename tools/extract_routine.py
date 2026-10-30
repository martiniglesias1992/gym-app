"""
Builds docs/data/exercises.json and docs/img/ from the guide that Claude made
("Rutina de Martin.html") plus the coach's spreadsheet values, which are typed
in by hand below in ROUTINE.

You normally run this only once. After that, docs/data/exercises.json is the
file to edit when the coach changes something (or edit ROUTINE here and run
the script again: it overwrites the JSON).

Run it from the project folder:
    python tools/extract_routine.py
"""

import base64
import html
import json
import re
from pathlib import Path

# Path(__file__) is this script. .parent is tools/, .parent again is the project.
PROJECT = Path(__file__).resolve().parent.parent
SOURCE_HTML = PROJECT / "Rutina de Martin.html"
OUT_DIR = PROJECT / "docs"
IMG_DIR = OUT_DIR / "img"
DATA_FILE = OUT_DIR / "data" / "exercises.json"

# ---------------------------------------------------------------------------
# The coach's spreadsheet, row by row.
#
# Notes on reading the spreadsheet:
# - Cells that share a merged "SERIES" cell are done together (superset).
#   They get the same "pair" letter, e.g. "1B" = Day 1, block B.
# - Excel turned some reps into dates: "10-10" (10 per side), "1-1" and "8/10".
#
# "slot" is the role the exercise plays in a full-body session. The app uses
# it to build a balanced workout: 1 cardio, 2 legs, 1 push, 1 pull, ...
# "groups" are the muscle groups used by the filter chips.
# "log" says what you write down: "weight" (kg x reps), "distance" (meters +
# time) or "time" (seconds).
# ---------------------------------------------------------------------------
ROUTINE = [
    # ---- DAY 1 ----
    dict(id="ski", day=1, pair="1A", sets=3, reps="250 m", log="distance",
         slot="cardio", groups=["Cardio", "Espalda", "Brazos"]),
    dict(id="lumbares", day=1, pair="1B", sets=3, reps="10", log="weight",
         slot="core", groups=["Core", "Espalda", "Glúteos"]),
    dict(id="pallof", day=1, pair="1B", sets=3, reps="10 por lado", log="weight",
         slot="core", groups=["Core"]),
    dict(id="sentadilla", day=1, pair="1C", sets=3, reps="15", log="weight",
         slot="piernas", groups=["Piernas", "Glúteos"]),
    dict(id="prensa", day=1, pair="1D", sets=3, reps="12-10-8", log="weight",
         slot="piernas", groups=["Piernas", "Glúteos"]),
    dict(id="militar", day=1, pair="1E", sets=3, reps="10", log="weight",
         slot="hombros", groups=["Hombros", "Brazos"]),
    dict(id="vuelos-laterales", day=1, pair="1E", sets=3, reps="10", log="weight",
         slot="hombros", groups=["Hombros"]),
    dict(id="trineo", day=1, pair="1F", sets=4, reps="1 tracción + 1 empuje",
         log="weight", slot="metabolico", groups=["Piernas", "Cardio", "Espalda"],
         note="La planilla dice «1-1». Confirma la distancia con el profe."),
    dict(id="granjero", day=1, pair="1F", sets=4, reps="4 recorridos", log="weight",
         slot="metabolico", groups=["Core", "Brazos", "Piernas"],
         note="La planilla dice «4» sin unidad: probablemente recorridos."),
    # ---- DAY 2 ----
    dict(id="remo", day=2, pair="2A", sets=3, reps="250 m", log="distance",
         slot="cardio", groups=["Cardio", "Espalda", "Piernas"]),
    dict(id="anillas", day=2, pair="2B", sets=4, reps="12", log="weight",
         slot="traccion", groups=["Espalda", "Brazos"]),
    dict(id="pecho-plano", day=2, pair="2B", sets=4, reps="10", log="weight",
         slot="empuje", groups=["Pecho", "Brazos"]),
    dict(id="empuje-maquina", day=2, pair="2C", sets=3, reps="12-10-8", log="weight",
         slot="empuje", groups=["Pecho", "Hombros", "Brazos"]),
    dict(id="traccion-maquina", day=2, pair="2C", sets=3, reps="12-10-8", log="weight",
         slot="traccion", groups=["Espalda", "Brazos"]),
    dict(id="wallballs", day=2, pair="2D", sets=4, reps="8", log="weight",
         slot="metabolico", format="emom", groups=["Piernas", "Hombros", "Cardio"]),
    dict(id="swing", day=2, pair="2D", sets=4, reps="12", log="weight",
         slot="metabolico", format="emom", groups=["Glúteos", "Piernas", "Cardio"]),
    dict(id="sdlhp", day=2, pair="2D", sets=4, reps="8-10", log="weight",
         slot="metabolico", format="emom", groups=["Piernas", "Espalda", "Hombros", "Cardio"],
         note="La planilla dice «8/10»."),
    # ---- DAY 3 ----
    dict(id="plancha", day=3, pair="3A", sets=3, reps="40″ / 20″ descanso", log="time",
         slot="core", format="tabata", groups=["Core"]),
    dict(id="plancha-lateral", day=3, pair="3A", sets=3, reps="40″ por lado", log="time",
         slot="core", format="tabata", groups=["Core"]),
    dict(id="hollow", day=3, pair="3A", sets=3, reps="40″ / 20″ descanso", log="time",
         slot="core", format="tabata", groups=["Core"]),
    dict(id="superman", day=3, pair="3A", sets=3, reps="40″ / 20″ descanso", log="time",
         slot="core", format="tabata", groups=["Core", "Espalda", "Glúteos"]),
    dict(id="dorsales", day=3, pair="3B", sets=3, reps="12-10-8", log="weight",
         slot="traccion", groups=["Espalda", "Brazos"]),
    dict(id="cruce-polea", day=3, pair="3C", sets=3, reps="10", log="weight",
         slot="empuje", groups=["Pecho"]),
    dict(id="vuelos-posteriores", day=3, pair="3C", sets=3, reps="10", log="weight",
         slot="hombros", groups=["Hombros", "Espalda"]),
    dict(id="cuadriceps", day=3, pair="3D", sets=3, reps="12", log="weight",
         slot="piernas", groups=["Piernas"]),
    dict(id="isquios", day=3, pair="3D", sets=3, reps="12", log="weight",
         slot="piernas", groups=["Piernas"]),
    dict(id="aductores", day=3, pair="3D", sets=3, reps="10 + 10", log="weight",
         slot="piernas", groups=["Piernas", "Glúteos"],
         note="La planilla dice «10-10»: 10 aductores + 10 abductores."),
    dict(id="biceps", day=3, pair="3E", sets=3, reps="10", log="weight",
         slot="brazos", groups=["Brazos"]),
    dict(id="triceps", day=3, pair="3E", sets=3, reps="10", log="weight",
         slot="brazos", groups=["Brazos"]),
    dict(id="remo-ski", day=3, pair="3F", sets=1, reps="1000 m", log="distance",
         slot="cardio", groups=["Cardio"]),
]

# Work formats: not exercises, but explanations shown when you tap the badge.
FORMAT_IDS = {"emom": "emom", "tabata": "tabata"}

DAY_NOTES = {
    1: "Piernas, hombros y empuje · trineo y carga",
    2: "Espalda, pecho y circuito EMOM",
    3: "Core, espalda y piernas en máquinas",
}

GENERAL = {
    "rest": "90″",
    "rir": 2,
    "legend": [
        ["Descanso 90″", "Entre series descansa un minuto y medio."],
        ["RIR 2", "Termina cada serie con 2 repeticiones «en reserva». Podrías hacer 2 más, pero paras."],
        ["12-10-8", "Pirámide: 12 reps en la 1ª serie, 10 en la 2ª y 8 en la 3ª, subiendo el peso."],
        ["Superserie", "Ejercicios con la misma letra se hacen seguidos, alternando, antes de descansar."],
    ],
}


# ---------------------------------------------------------------------------
# Small helpers to pull text out of the HTML guide.
# ---------------------------------------------------------------------------
def strip_tags(fragment):
    """'<b>Hola</b> mundo' -> 'Hola mundo' (and decode &amp; etc.)."""
    text = re.sub(r"<[^>]+>", "", fragment)
    return html.unescape(text).strip()


def list_items(fragment):
    """Return the text of every <li> inside an HTML fragment."""
    return [strip_tags(li) for li in re.findall(r"<li>(.*?)</li>", fragment, re.S)]


def section(article, title):
    """Find '<section ...><h4>title</h4> ... </section>' and return its inside."""
    pattern = r"<section[^>]*><h4>" + re.escape(title) + r"</h4>(.*?)</section>"
    match = re.search(pattern, article, re.S)
    return match.group(1) if match else ""


def parse_article(ex_id, article):
    """Turn one <article class="ex"> into a Python dict."""
    name = strip_tags(re.search(r"<h3>(.*?)</h3>", article, re.S).group(1))
    equipment = section(article, "Máquina o equipo") or section(article, "Qué necesitas")
    muscles = section(article, "Músculos")

    # Pictures: either a JPEG embedded as base64 or a small inline SVG drawing.
    media = []
    figures = re.findall(r"<figure[^>]*>(.*?)</figure>", article, re.S)
    for number, fig in enumerate(figures, start=1):
        caption = strip_tags(re.search(r"<figcaption>(.*?)</figcaption>", fig, re.S).group(1))
        img = re.search(r'src="data:image/jpeg;base64,([^"]+)"', fig)
        if img:
            filename = f"{ex_id}-{number}.jpg"
            (IMG_DIR / filename).write_bytes(base64.b64decode(img.group(1)))
            media.append({"src": f"img/{filename}", "caption": caption})
        else:
            svg = re.search(r"<svg.*?</svg>", fig, re.S).group(0)
            media.append({"svg": svg, "caption": caption})

    videos = [
        {"url": url, "title": strip_tags(title)}
        for url, title in re.findall(
            r'<a class="vid" href="([^"]+)"[^>]*>.*?<span>(.*?)</span></a>', article, re.S
        )
    ]
    more = re.search(r'<a class="more" href="([^"]+)"', article)

    return {
        "id": ex_id,
        "name": name,
        "equipment": list_items(equipment),
        "muscles": strip_tags(muscles),
        "steps": list_items(section(article, "Cómo se hace")),
        "tips": list_items(section(article, "Claves")),
        "media": media,
        "videos": videos,
        "moreVideos": html.unescape(more.group(1)) if more else None,
    }


def main():
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)

    page = SOURCE_HTML.read_text(encoding="utf-8")
    articles = dict(re.findall(r'<article class="ex" id="([^"]+)">(.*?)</article>', page, re.S))
    print(f"Found {len(articles)} sections in the guide")

    exercises = []
    for order, row in enumerate(ROUTINE):
        info = parse_article(row["id"], articles[row["id"]])
        # Spreadsheet values (row) win over anything parsed from the guide.
        exercises.append({**info, **row, "order": order})

    formats = [parse_article(fid, articles[fid]) for fid in FORMAT_IDS.values()]

    data = {
        "general": GENERAL,
        "days": {str(day): note for day, note in DAY_NOTES.items()},
        "formats": formats,
        "exercises": exercises,
    }
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    images = len(list(IMG_DIR.glob("*.jpg")))
    print(f"Wrote {len(exercises)} exercises to {DATA_FILE.relative_to(PROJECT)}")
    print(f"Wrote {images} images to {IMG_DIR.relative_to(PROJECT)}")


# This runs main() only when you execute the file directly
# (not when another script does "import extract_routine").
if __name__ == "__main__":
    main()
