# Mi Rutina: gym app

A small app to see your coach's routine, learn how each exercise is done, and log
your kilos and reps. It runs on the iPhone (installed from Safari to the home
screen, works without internet at the gym) and on the computer in any browser.
It costs nothing to host.

## How it is built (and why)

| Part | Language | What it does |
|---|---|---|
| `docs/` | HTML, CSS, JavaScript | The app itself. Browsers (and the iPhone) only run JavaScript, so this part has to be JS. |
| `tools/` | **Python** | Helper scripts: build the exercise data, draw the icons, run a test server, analyse your progress. |

Your logs are saved **on the device** (the browser's `localStorage`). There is no
server and no account. To move data between phone and computer, or to keep a
safe copy, use *Historial → Exportar copia* and *Importar copia*.

```
gym-app/
├── docs/                     ← the app (this is what gets published)
│   ├── index.html            page skeleton
│   ├── styles.css            look and feel (light + dark mode)
│   ├── app.js                all the logic
│   ├── sw.js                 "service worker": makes it work offline
│   ├── manifest.webmanifest  name and icon for "Add to Home Screen"
│   ├── data/exercises.json   the routine: exercises, sets, reps, how-to, videos
│   ├── img/                  exercise photos (Free Exercise DB, public domain)
│   └── icons/                app icons (made by tools/make_icons.py)
└── tools/
    ├── extract_routine.py    builds data/exercises.json + img/ from the guide
    ├── make_icons.py         draws the icon PNGs with plain Python
    ├── serve.py              test server for computer + phone on the same Wi-Fi
    └── progress_report.py    reads an exported backup and prints your progress
```

## Try it on your computer

```bash
python tools/serve.py
```

Open http://localhost:8000. To try it on the iPhone, connect it to the same
Wi-Fi and open the "Phone" address that the script prints. Offline mode and
home-screen install need the published `https://` version (below).

## Publish it for free (GitHub Pages)

1. Create a free account at https://github.com and a new **public** repository,
   for example `gym-app`.
2. Upload this folder (with GitHub Desktop, or `git push`).
3. In the repository: **Settings → Pages → Build and deployment**:
   Source *Deploy from a branch*, Branch `main`, folder **`/docs`** → Save.
4. After a minute your app is at `https://<your-user>.github.io/gym-app/`.

The folder is called `docs` only because GitHub Pages can publish from it.

## Install it on the iPhone

1. Open the address above in **Safari**.
2. Tap the **Share** button → **Add to Home Screen** → Add.
3. Open it from the new icon once with internet. From then on it works offline.

Changes you publish show up the second time you open the app.

## Using the app

- **Entrenar**
  - *Crear full body* picks 8 exercises: cardio, 2 legs, push, pull, shoulders,
    core and a finisher. It chooses the ones you haven't done for the longest time.
  - *Días del profe* loads Day 1, 2 or 3 exactly as the coach wrote them.
  - *Empezar vacío* lets you pick each exercise yourself.
  - In each exercise: ↑ ↓ change the order, ⇄ swaps it for another of the same
    type, 🗑 removes it.
  - Grey numbers are last time's values (or the coach's target). Tap ✓ and they
    are saved as they are, so a repeated set takes one tap.
  - Tapping ✓ also starts the 90″ rest timer.
- **Ejercicios**: every exercise sorted by day, by muscle group or A–Z, with a
  filter by muscle. Tap one to see photos, how to do it, key points, videos, and
  your own history with a progress chart.
- **Historial**: your past workouts, *Repetir este entreno*, and backups.

> iPhone note: Safari can delete a website's saved data if you don't use it for
> weeks. Installing to the home screen avoids most of this, but export a backup
> now and then (e.g. to iCloud Drive) so you never lose your history.

## Changing the routine

When the coach gives you something new, edit `docs/data/exercises.json`:
`sets`, `reps`, `slot` (role in the full body) and `groups` (muscle filters).
The `ROUTINE` list in `tools/extract_routine.py` holds the same values. If you
edit it there instead, run `python tools/extract_routine.py` to regenerate the
JSON. Running the script overwrites the JSON, including any edits you made to
the JSON by hand.

What I read from the spreadsheet that the earlier guide had missing or wrong:

- Merged "SERIES" cells mean those exercises share the same number of sets.
  So *Vuelos laterales*, *Pecho plano*, *Tracción en máquina*, *Isquios* and
  *Tríceps* do have sets (3 or 4).
- *SDLHP* says «8/10», not «8/8».

Confirm with your coach:
- the sled distance («1-1»)
- what «4» means for the farmer's walk

## Python practice ideas

- `python tools/progress_report.py my-backup.json`: read it line by line and
  change what it prints.
- Make it save a CSV you can open in Excel (`import csv`).
- Draw a progress chart with matplotlib (`pip install matplotlib`).
- Change the colours or the drawing in `tools/make_icons.py` and re-run it.
- Change the sets or reps of an exercise in `ROUTINE` (`tools/extract_routine.py`) and re-run it.
