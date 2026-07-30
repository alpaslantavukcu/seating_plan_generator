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
`docs/data/classrooms.json`. Re-run whenever a template or the seat mappings
change. The script validates every room (seat count vs capacity, merge
structure, extents) and refuses to write the JSON if anything is off.

## PDF fonts (docs/vendor/fonts/)

The PDF exporter embeds a Noto Sans subset so Turkish glyphs (ş ğ İ ı ç ö ü)
render correctly. To regenerate:

```bash
pip install fonttools brotli

# 1. Get static TTFs (NotoSans-Regular.ttf, NotoSans-Bold.ttf) from
#    https://github.com/notofonts/latin-greek-cyrillic/releases

# 2. Subset to Latin + Latin Extended-A (covers Turkish)
pyftsubset NotoSans-Regular.ttf --unicodes="U+0020-017F,U+2019,U+2013,U+2014" \
    --output-file=NotoSans-Regular.sub.ttf
pyftsubset NotoSans-Bold.ttf --unicodes="U+0020-017F,U+2019,U+2013,U+2014" \
    --output-file=NotoSans-Bold.sub.ttf

# 3. Wrap as jsPDF font modules (base64 in a JS registration wrapper)
python3 - <<'EOF'
import base64
from pathlib import Path
TEMPLATE = """(function (jsPDFAPI) {
  var font = '%(b64)s';
  jsPDFAPI.events.push(['addFonts', function () {
    this.addFileToVFS('NotoSans-%(style)s.ttf', font);
    this.addFont('NotoSans-%(style)s.ttf', 'NotoSans', '%(style)s');
  }]);
})(jspdf.jsPDF.API);
"""
for src, style in [("Regular", "normal"), ("Bold", "bold")]:
    b64 = base64.b64encode(Path(f"NotoSans-{src}.sub.ttf").read_bytes()).decode()
    Path(f"docs/vendor/fonts/NotoSans-{style}.js").write_text(TEMPLATE % {"style": style, "b64": b64})
EOF
```

## Vendored libraries (docs/vendor/)

| File | Source | License |
|---|---|---|
| `jspdf.umd.min.js` | https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js | MIT |
| `exceljs.min.js` | https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js | MIT |
| `fonts/NotoSans-*.js` | Noto Sans (subset, see above) | OFL 1.1 |
