# Seating Plan Generator

Automatically assign students from a class list to physical seats using per-room Excel templates, then export **Excel** and **PDF** outputs (including merged PDFs) for sharing on learning platforms or printing.

The project includes:

- **`docs/`** — **Static web app (GitHub Pages)**: the full generator running entirely in the browser — no server, no installation. Paste a Ninova student list (or upload .txt / .xlsx / .csv), pick classrooms, generate, then rearrange seats by drag-and-drop, edit students inline, and download PDFs / Excel files. Bilingual (TR/EN). See [Web app](#web-app-github-pages).
- **`seating_plan_generator.py`** — CLI pipeline: load `configuration.json` and an input JSON, shuffle students into seat mappings, fill templates, convert to PDF (LibreOffice on Linux, Microsoft Office on Windows).
- **`app.py`** — Streamlit web UI for the same pipeline with file upload, optional per-room capacities, ZIP download of results.

## Web app (GitHub Pages)

The `docs/` folder is a self-contained static site. To publish it:

1. Push this repository to GitHub.
2. In the repository: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**, then select branch **`main`** and folder **`/docs`**. Save.
3. The site appears at `https://<user>.github.io/<repo>/` within a minute or two.

Everything (parsing, seat assignment, PDF and Excel generation) runs client-side; student data never leaves the browser. Classroom layouts are pre-generated into `docs/data/classrooms.json` by [`tools/convert_templates.py`](tools/README.md) — re-run it after changing `configuration.json` or the Excel templates, and commit the result.

To preview locally: `python3 -m http.server 8000 --directory docs` and open http://localhost:8000.

### Templates and session auto-save

**Templates** make a setup reusable. A template holds settings only — classroom selection *and fill order*, custom capacities, seed and the seat-cell fields — so the same one serves different exams and different student lists. It can be moved three ways:

- **Download template (.json)** → a readable file to keep, email or drop back onto the Template box on any machine. This is the only form that also carries the **exam name**.
- **Copy code** → a short single-line string such as `SP1-ARYCBge5YDU` to paste into a message; **Paste code** applies it.
- **Copy link** → the same code in a URL hash (`…/#t=ARYCBge5YDU`); opening the link applies the settings.

The code and link leave the exam name out deliberately — it is the bulk of the bytes, and a template is meant to be reused under a different exam anyway. That keeps a typical code around 11 characters and the whole link under 60. The encoding is a packed binary layout, so it is deterministic (identical settings always give an identical code, and any difference — including room order — changes it) and self-checking: a truncated or mistyped code is rejected rather than silently misread.

A template **never contains the student list or the generated plan**. Applying one replaces the settings and clears the plan (it no longer matches); the student list already loaded is kept, and a code or link also leaves the exam name you typed alone. Templates are checked against the local `docs/data/classrooms.json`: classrooms that do not exist on the receiving machine are skipped and capacities are clamped to the real room capacity, with a warning.

> Maintainer note: `ROOM_TABLE` in [`docs/js/template.js`](docs/js/template.js) maps classrooms to the one-byte ids used inside codes. It is **append-only** — reordering or removing entries would decode already-shared codes into the wrong classrooms. A room missing from the list still works; it just makes the code slightly longer.

**Session auto-save** writes the working session — settings, parsed students and the plan including drag-drop swaps and inline edits — to the browser's `localStorage`, so a refresh or an accidental tab close loses nothing. On return a banner reports the restore. Nothing is uploaded; the data stays on that machine, and **Start Fresh** in the Template & Session box erases it. The saved plan is discarded automatically if the classroom layouts changed underneath it.

## Prerequisites

- **Python 3.10+** (3.12 works; Docker image uses 3.12).
- **Excel templates** — For each room name used in `configuration.json`, a file `Templates/Template_<ROOM>.xlsx` must exist (for example `Templates/Template_Z-16.xlsx`).
- **PDF conversion**
  - **Linux:** [LibreOffice](https://www.libreoffice.org/) (`soffice` on `PATH`).
  - **Windows:** Microsoft Excel (automation via `pywin32`; install with `pip install -r requirements.txt` on Windows).

## Setup

1. Clone the repository and enter the project directory.

2. Create a virtual environment (recommended):

   ```bash
   python -m venv .venv
   source .venv/bin/activate   # Linux / macOS
   # .venv\Scripts\activate    # Windows
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Ensure `configuration.json` describes your rooms (capacities and seat-to-cell mappings) and that matching template workbooks exist under `Templates/`.

5. Prepare a student list text file (see [Student list format](#student-list-format)). The default `input.json` may reference a file such as `ogrenci-listesi.txt` — create that file next to the project or adjust paths.

## Usage

### Streamlit (GUI)

```bash
streamlit run app.py
```

Open the URL shown in the terminal (default `http://localhost:8501`). Configure exam name, output folder, classrooms, optional random seed, student file (path or upload), and which fields appear in seat cells (`student_id`, `name`, `seat_number`). After generation, a ZIP of the output folder is offered for download.

Optional environment variables:

| Variable | Purpose |
| -------- | ------- |
| `STREAMLIT_UPLOAD_DIR` | Where uploaded `.txt` files are stored (default: project `/.streamlit_uploads`). |
| `STREAMLIT_OUTPUT_BASE_DIR` | Base directory for relative output paths (default: project `/generated_outputs`). |

### Command line

Edit `input.json` (or pass paths explicitly), then run:

```bash
python seating_plan_generator.py -c configuration.json -i input.json
```

Useful flags:

- `--overwrite-output` — Replace the output directory if it already exists (non-interactive).
- See `python seating_plan_generator.py --help` for all options.

### Docker Compose

Build and run the Streamlit app with LibreOffice inside the container:

```bash
mkdir -p runtime/uploads runtime/output
docker compose up -d --build
```

Browse to `http://localhost:8501`. Host folders `./runtime/uploads` and `./runtime/output` are mounted for persistence; `./Templates` is mounted so you can edit templates on the host.

### SSH tunnel (remote server)

```bash
ssh -L 8501:localhost:8501 user@server
```

Then open `http://localhost:8501` in your browser.

## Configuration overview

- **`configuration.json`** — `classroom-capacities` (max seats per room) and `seat-mappings` (seat index → Excel cell, e.g. `"1": "C4"`).
- **`input.json`** — `exam_name`, `available_classrooms` (list of room names or a map of room → capacity), `student_ids_file`, `output_directory`, `cell_params`.

Details and JSON examples are also documented in `Readme.md` (Turkish).

## Student list format

Plain text, one student per line: student ID first, then name; a nickname in parentheses at the end is ignored for parsing. Example:

```text
150220722   Ahmet Yılmaz (yilmaza22)
150220724   Ayşe Kaya (kayaa22)
```

## Project layout (important paths)

| Path | Role |
| ---- | ---- |
| `configuration.json` | Room capacities and seat layouts |
| `input.json` | Default CLI / reference input |
| `Templates/Template_<room>.xlsx` | Per-room seating layout templates |
| `generated_outputs/` | Default base for Streamlit relative outputs (when using defaults) |

## License

See the license section in `Readme.md`.
