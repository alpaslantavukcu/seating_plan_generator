# Seating Plan Generator

Automatically assign students from a class list to physical seats using per-room Excel templates, then export **Excel** and **PDF** outputs (including merged PDFs) for sharing on learning platforms or printing.

The project includes:

- **`docs/`** — **Static web app (GitHub Pages)**: the full generator running entirely in the browser — no server, no installation. Paste a Ninova student list (or upload .txt / .xlsx / .csv), pick classrooms, generate, then rearrange seats by drag-and-drop, edit students inline, and download PDFs / Excel files. Bilingual (TR/EN). See [Web app](#web-app-github-pages).
- **`seating_plan_generator.py`** — CLI pipeline: load `configuration.json` and an input JSON, shuffle students into seat mappings, fill templates, convert to PDF (LibreOffice on Linux, Microsoft Office on Windows).

## Web app (GitHub Pages)

The `docs/` folder is a self-contained static site. To publish it:

1. Push this repository to GitHub.
2. In the repository: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**, then select branch **`main`** and folder **`/docs`**. Save.
3. The site appears at `https://<user>.github.io/<repo>/` within a minute or two.

Everything (parsing, seat assignment, PDF and Excel generation) runs client-side; student data never leaves the browser. Classroom layouts are pre-generated into `docs/data/classrooms.json`, and the Excel templates (plus `tutanak.pdf`) copied to `docs/templates/`, by [`tools/convert_templates.py`](tools/README.md) — re-run it after changing `configuration.json`, the Excel templates or the tutanak, and commit the result.

### Output parity with the CLI

The web app produces the same set of files as the CLI's output folder, with the same names and the same look:

- **Excel per room** (`{exam}_{room}.xlsx`, sheets `{room}_id_only` and `{room}_full`): the real template workbook, opened as a zip and filled cell by cell the way openpyxl does it. Styles, borders, the template's default font, column widths, row heights, print areas and printer settings are untouched.
- **PDF per room** (`{exam}_{room}.pdf`, 2 pages): drawn from the template geometry the way LibreOffice prints the CLI's workbook — same paper (A4, or Letter for templates that name no paper size, as LibreOffice defaults), margins, centring, fit-to-width scale, borders, Arial metrics (Liberation Sans), wrapping.
- **Merged PDFs** `…_All_Seating_Plans_Only_ID.pdf`, `…_All_Seating_Plans_Full.pdf` and `…_All_Seating_Plans_with_Tutanak_Printable.pdf` (tutanak page before every room), rooms in the CLI's sorted file-name order, assembled from the per-room PDFs with pdf-lib exactly as `merge_pdfs` does with pypdf.
- **Single-sheet room list** (`…_SingleSheetRoomList.xlsx` / `.pdf`): same workbook as the CLI's; the PDF is drawn as LibreOffice prints it — Letter landscape, 100 % scale flowing onto further pages, and the Caladea face LibreOffice uses for the CLI's unnamed font.
- **All outputs (ZIP)**: everything above in one archive, mirroring the CLI's output directory.
- The seat-cell fields keep their **tick order**, which is the CLI's `cell_params` order (e.g. seat number first, then ID, then name).

What is not shared: the random number generator. The same seed gives a different plan in the CLI (Python's `random.shuffle`) and in the browser (mulberry32); reproducibility holds within each tool.

To preview locally: `python3 -m http.server 8000 --directory docs` and open http://localhost:8000.

### Templates and session auto-save

**Templates** make a setup reusable. A template holds settings only — classroom selection *and fill order*, custom capacities, seed and the seat-cell fields *with their order* — so the same one serves different exams and different student lists. It can be moved three ways:

- **Download template (.json)** → a readable file to keep, email or drop back onto the Template box on any machine. This is the only form that also carries the **exam name**.
- **Copy code** → a short single-line string such as `SP1-ARYCBge5YDU` to paste into a message; **Paste code** applies it.
- **Copy link** → the same code in a URL hash (`…/#t=ARYCBge5YDU`); opening the link applies the settings.

The code and link leave the exam name out deliberately — it is the bulk of the bytes, and a template is meant to be reused under a different exam anyway. That keeps a typical code around 11 characters and the whole link under 60. The encoding is a packed binary layout, so it is deterministic (identical settings always give an identical code, and any difference — including room order — changes it) and self-checking: a truncated or mistyped code is rejected rather than silently misread.

A template **never contains the student list or the generated plan**. Applying one replaces the settings and clears the plan (it no longer matches); the student list already loaded is kept, and a code or link also leaves the exam name you typed alone. Templates are checked against the local `docs/data/classrooms.json`: classrooms that do not exist on the receiving machine are skipped and capacities are clamped to the real room capacity, with a warning.

> Maintainer note: `ROOM_TABLE` in [`docs/js/template.js`](docs/js/template.js) maps classrooms to the one-byte ids used inside codes. It is **append-only** — reordering or removing entries would decode already-shared codes into the wrong classrooms. A room missing from the list still works; it just makes the code slightly longer.

**Session auto-save** writes the working session — settings, parsed students and the plan including drag-drop swaps and inline edits — to the browser's `localStorage`, so a refresh or an accidental tab close loses nothing. On return a banner reports the restore. Nothing is uploaded; the data stays on that machine, and **Start Fresh** in the Template & Session box erases it. The saved plan is discarded automatically if the classroom layouts changed underneath it.

## Prerequisites

- **Python 3.8+** for the CLI (the web app needs nothing but a browser).
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

### Command line

Edit `input.json` (or pass paths explicitly), then run:

```bash
python seating_plan_generator.py -c configuration.json -i input.json
```

Useful flags:

- `--overwrite-output` — Replace the output directory if it already exists (non-interactive).
- See `python seating_plan_generator.py --help` for all options.

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
| `Templates/tutanak.pdf` | Exam report page prepended to every room in the printable merged PDF |
| `docs/` | Static web app (GitHub Pages); `docs/data/classrooms.json` and `docs/templates/` are generated by `tools/convert_templates.py` |
| `tools/convert_templates.py` | Builds the web app's classroom data from the templates |

## License

See the license section in `Readme.md`.
