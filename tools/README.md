# Tools

Build-time helpers for the static web app in `docs/`. None of these run in
the browser — they generate assets that are committed to the repo.

## convert_templates.py

Converts the classroom Excel templates into the JSON the web app renders from.

```bash
pip install openpyxl
python3 tools/convert_templates.py
```

Reads `Templates/Template_<ROOM>.xlsx` + `configuration.json`, writes
`docs/data/classrooms.json` and copies the templates to `docs/templates/`
(GitHub Pages only serves `docs/`). Re-run whenever a template or the seat
mappings change.

- The Excel exporter fills the copied templates directly, exactly like the
  Python generator does with openpyxl, so the web Excel files keep the
  template's fonts, borders, A4 paper, margins, print area and fit-to-page.
- The PDF exporter draws each page from the `sheet` model in classrooms.json
  (column widths, row heights, merges, every bordered/labelled cell with its
  font and alignment, page setup), the way Excel/LibreOffice prints the
  template. Templates without a paper size are drawn on A4. The script validates every room (seat count vs capacity, merge
structure, extents) and refuses to write the JSON if anything is off.

## PDF fonts (docs/vendor/fonts/)

The PDF exporter embeds a Liberation Sans subset: it has the same glyph
widths as Arial (the templates' font), so text wraps where the CLI's PDFs
wrap it, and it covers Turkish (ş ğ İ ı ç ö ü). To regenerate:

```bash
pip install fonttools

# 1. Liberation Sans 2.x (OFL 1.1): https://github.com/liberationfonts/liberation-fonts
#    (or /usr/share/fonts/truetype/liberation/ on Debian/Ubuntu)

# 2. Subset to Latin + Latin Extended-A (covers Turkish), drop hinting
for s in Regular Bold; do
  pyftsubset LiberationSans-$s.ttf --unicodes="U+0020-017F,U+2019,U+2013,U+2014" \
      --no-hinting --output-file=LiberationSans-$s.sub.ttf
done

# 3. Wrap as jsPDF font modules (base64 in a JS registration wrapper)
python3 - <<'PY'
import base64
from pathlib import Path
TEMPLATE = """(function (jsPDFAPI) {
  var font = '%(b64)s';
  jsPDFAPI.events.push(['addFonts', function () {
    this.addFileToVFS('LiberationSans-%(style)s.ttf', font);
    this.addFont('LiberationSans-%(style)s.ttf', 'LiberationSans', '%(style)s');
  }]);
})(jspdf.jsPDF.API);
"""
for src, style in [("Regular", "normal"), ("Bold", "bold")]:
    b64 = base64.b64encode(Path(f"LiberationSans-{src}.sub.ttf").read_bytes()).decode()
    Path(f"docs/vendor/fonts/LiberationSans-{style}.js").write_text(TEMPLATE % {"style": style, "b64": b64})
PY
```

## Vendored libraries (docs/vendor/)

| File | Source | License |
|---|---|---|
| `jspdf.umd.min.js` | https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js | MIT |
| `exceljs.min.js` | https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js | MIT |
| `fonts/LiberationSans-*.js` | Liberation Sans 2.1.5 (subset, see above) | OFL 1.1 |
