#!/usr/bin/env python3
"""Convert classroom Excel templates into docs/data/classrooms.json.

Reads Templates/Template_<ROOM>.xlsx and configuration.json, extracts the
physical layout of every classroom (seat cells, corridors, column widths,
page orientation) and writes a single JSON file the web app renders from.

Re-run whenever a template or configuration.json changes:

    python3 tools/convert_templates.py

The script validates each room against the template invariants and exits
non-zero on any mismatch.
"""

import json
import shutil
import sys
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.utils import column_index_from_string, get_column_letter

REPO_ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = REPO_ROOT / "Templates"
CONFIG_PATH = REPO_ROOT / "configuration.json"
OUTPUT_PATH = REPO_ROOT / "docs" / "data" / "classrooms.json"
# GitHub Pages only serves docs/, so the Excel exporter reads its copies here.
WEB_TEMPLATES_DIR = REPO_ROOT / "docs" / "templates"

SEAT_MERGE_ROWS = 3          # every seat is a 3-row-tall merged cell


def cell_ref(col_letter: str, row: int) -> str:
    return f"{col_letter}{row}"


def parse_cell(ref: str):
    letters = "".join(c for c in ref if c.isalpha())
    digits = "".join(c for c in ref if c.isdigit())
    return letters, int(digits)


def column_widths(ws, last_col_idx: int) -> dict:
    """Width (in Excel character units) of columns 1..last_col_idx.

    A worksheet stores widths as ranges — <col min="1" max="6" width="18.2"/> —
    and openpyxl keys column_dimensions by the *min* letter only, so reading
    ws.column_dimensions["B"] for that range yields nothing and the caller
    silently falls back to the sheet default. Expand every range instead.
    """
    default = round(ws.sheet_format.defaultColWidth or 8.43, 2)
    widths = {get_column_letter(i): default for i in range(1, last_col_idx + 1)}
    for dim in ws.column_dimensions.values():
        if dim.width is None:
            continue
        # dim.max is 16384 for whole-sheet ranges — clamp to the room's extent
        for idx in range(dim.min, min(dim.max, last_col_idx) + 1):
            widths[get_column_letter(idx)] = round(dim.width, 2)
    return widths


PAPER_SIZES = {1: "letter", 9: "a4"}


def _style_key(cell) -> tuple:
    f, a = cell.font, cell.alignment
    return (
        float(f.sz or 10),
        1 if f.b else 0,
        a.horizontal or "general",
        a.vertical or "bottom",
        int(a.textRotation or 0),
        1 if a.wrap_text else 0,
    )


def extract_sheet(ws, last_col_idx: int, last_row: int) -> dict:
    """Everything a printer would see on the template's page: column widths,
    row heights, merges, and every bordered or text-bearing cell with its own
    font/alignment/border — plus the page setup that decides paper, margins,
    centring and fit-to-page scaling.

    The web PDF exporter draws the page from this exactly like Excel or
    LibreOffice prints the template, so web and CLI outputs look the same.
    """
    ps = ws.page_setup
    pm = ws.page_margins
    po = ws.print_options
    spp = ws.sheet_properties.pageSetUpPr
    fit = bool(spp and spp.fitToPage)

    default_h = ws.sheet_format.defaultRowHeight or 12.75
    row_heights = []
    for r in range(1, last_row + 1):
        dim = ws.row_dimensions.get(r)
        row_heights.append(round(dim.height, 2) if dim is not None and dim.height else default_h)

    widths = column_widths(ws, last_col_idx)

    merges = []
    for rng in ws.merged_cells.ranges:
        if rng.min_col <= last_col_idx and rng.min_row <= last_row:
            merges.append(str(rng))
    merge_anchors = {m.split(":")[0] for m in merges}

    styles, style_ids, cells = [], {}, []
    for row in ws.iter_rows(min_row=1, max_row=last_row, max_col=last_col_idx):
        for c in row:
            b = c.border
            # left, right, top, bottom, diagonal-up, diagonal-down ("no seat" X)
            bits = "".join("1" if getattr(b, s).style else "0" for s in ("left", "right", "top", "bottom"))
            diag = b.diagonal is not None and b.diagonal.style
            bits += ("1" if diag and b.diagonalUp else "0") + ("1" if diag and b.diagonalDown else "0")
            if c.value is None and bits == "000000" and c.coordinate not in merge_anchors:
                continue
            key = _style_key(c)
            if key not in style_ids:
                style_ids[key] = len(styles)
                sz, bold, h, v, rot, wrap = key
                styles.append({"sz": sz, "b": bold, "h": h, "v": v, "rot": rot, "wrap": wrap})
            cells.append([c.coordinate, style_ids[key], bits, None if c.value is None else str(c.value)])

    return {
        "page": {
            # Templates without a paper size print on the printer default;
            # in Türkiye that is A4, so fall back to it.
            "paper": PAPER_SIZES.get(ps.paperSize, "a4"),
            "orientation": "landscape" if ps.orientation == "landscape" else "portrait",
            "margins": {"left": pm.left, "right": pm.right, "top": pm.top, "bottom": pm.bottom},
            "hCenter": bool(po.horizontalCentered),
            "vCenter": bool(po.verticalCentered),
            "fitToPage": fit,
            "fitToWidth": 1 if ps.fitToWidth is None else int(ps.fitToWidth),
            "fitToHeight": 1 if ps.fitToHeight is None else int(ps.fitToHeight),
            "scale": int(ps.scale) if ps.scale else 100,
        },
        "colWidths": [widths[get_column_letter(i)] for i in range(1, last_col_idx + 1)],
        "rowHeights": row_heights,
        "merges": merges,
        "styles": styles,
        "cells": cells,
    }


def convert_room(room: str, capacity: int, seat_mapping: dict) -> dict:
    template_path = TEMPLATES_DIR / f"Template_{room}.xlsx"
    if not template_path.exists():
        raise FileNotFoundError(f"{room}: missing template {template_path}")

    wb = load_workbook(template_path)
    ws = wb.active

    merges = {}
    for rng in ws.merged_cells.ranges:
        anchor = cell_ref(get_column_letter(rng.min_col), rng.min_row)
        merges[anchor] = rng

    # Seats, in seat-number order (fill order — never reorder)
    seats = []
    for n_str, ref in seat_mapping.items():
        col, row = parse_cell(ref)
        rng = merges.get(ref)
        if rng is None:
            raise AssertionError(f"{room}: seat {n_str} anchor {ref} is not a merge anchor")
        rows_tall = rng.max_row - rng.min_row + 1
        cols_wide = rng.max_col - rng.min_col + 1
        if rows_tall != SEAT_MERGE_ROWS or cols_wide != 1:
            raise AssertionError(
                f"{room}: seat {n_str} at {ref} spans {rows_tall}x{cols_wide}, expected {SEAT_MERGE_ROWS}x1"
            )
        seats.append({"n": int(n_str), "cell": ref, "col": col, "row": row})

    anchor_rows = sorted({s["row"] for s in seats})
    band_of = {row: i for i, row in enumerate(anchor_rows)}
    for s in seats:
        s["band"] = band_of[s["row"]]
        del s["row"]

    seat_cols = sorted({s["col"] for s in seats}, key=column_index_from_string)
    last_seat_row = max(r for r in anchor_rows) + SEAT_MERGE_ROWS - 1
    last_col_idx = max(column_index_from_string(c) for c in seat_cols)

    # Header: rows 1-2 merged title, row 3 merged lectern band
    title_rng = next((r for r in ws.merged_cells.ranges if r.min_row == 1), None)
    lectern_rng = next((r for r in ws.merged_cells.ranges if r.min_row == 3 and r.max_row == 3), None)
    if title_rng is None or lectern_rng is None:
        raise AssertionError(f"{room}: missing title or lectern merge")
    title_text = ws.cell(row=1, column=title_rng.min_col).value or "SINAV YERLEŞİM PLANI"
    lectern_text = ws.cell(row=3, column=lectern_rng.min_col).value or "KÜRSÜ"

    corridors = []
    unassigned_desks = []
    seat_anchor_refs = set(seat_mapping.values())
    for rng in ws.merged_cells.ranges:
        anchor = cell_ref(get_column_letter(rng.min_col), rng.min_row)
        if anchor in seat_anchor_refs or rng is title_rng or rng is lectern_rng:
            continue
        letter = get_column_letter(rng.min_col)
        rows_tall = rng.max_row - rng.min_row + 1
        if rng.min_col != rng.max_col:
            raise AssertionError(f"{room}: unexpected multi-column merge {rng}")
        if rows_tall > SEAT_MERGE_ROWS:
            # Corridor: single-column merge spanning the seat area
            label_raw = ws.cell(row=rng.min_row, column=rng.min_col).value or "KORİDOR"
            label = str(label_raw).split()[0] if str(label_raw).strip() else "KORİDOR"
            corridors.append({
                "col": letter,
                "range": str(rng),
                "label": label,
            })
            last_col_idx = max(last_col_idx, rng.max_col)
        elif rows_tall == SEAT_MERGE_ROWS:
            # Physical desk drawn in the template but not in the seat mapping
            # (e.g. Z-18 G22, 104 A22) — rendered as a permanently empty desk.
            if rng.min_row not in anchor_rows:
                raise AssertionError(f"{room}: unassigned desk {anchor} not aligned to a seat band")
            unassigned_desks.append({"cell": anchor, "col": letter, "band": anchor_rows.index(rng.min_row)})
        else:
            raise AssertionError(f"{room}: unexpected merge {rng} (not seat/title/lectern/corridor/desk)")

    corridors.sort(key=lambda c: column_index_from_string(c["col"]))
    corridor_cols = {c["col"] for c in corridors}

    merge_count = len(ws.merged_cells.ranges)
    expected = len(seats) + 2 + len(corridors) + len(unassigned_desks)
    if merge_count != expected:
        raise AssertionError(
            f"{room}: mergeCount {merge_count} != seats+2+corridors+desks {expected}"
        )
    if len(seats) != capacity:
        raise AssertionError(f"{room}: {len(seats)} seats != capacity {capacity}")

    # Columns inside the extent, classified
    widths = column_widths(ws, last_col_idx)
    columns = []
    for idx in range(1, last_col_idx + 1):
        letter = get_column_letter(idx)
        if letter in corridor_cols:
            ctype = "corridor"
        elif letter in seat_cols:
            ctype = "seat"
        else:
            ctype = "gap"
        columns.append({"letter": letter, "width": widths[letter], "type": ctype})

    for s in seats:
        if column_index_from_string(s["col"]) > last_col_idx:
            raise AssertionError(f"{room}: seat {s['n']} outside extent")

    # Typical content row height (first seat band)
    height = ws.row_dimensions.get(anchor_rows[0])
    row_height = round(height.height, 2) if height is not None and height.height else 20.0

    orientation = "landscape" if ws.page_setup.orientation == "landscape" else "portrait"

    return {
        "capacity": capacity,
        "orientation": orientation,
        "title": str(title_text).strip(),
        "lectern": str(lectern_text).strip(),
        "columns": columns,
        "bands": anchor_rows,
        "rowHeight": row_height,
        "corridors": corridors,
        "unassignedDesks": unassigned_desks,
        "seats": sorted(seats, key=lambda s: s["n"]),
        "extent": {"lastCol": get_column_letter(last_col_idx), "lastRow": last_seat_row},
        "sheet": extract_sheet(ws, last_col_idx, last_seat_row),
    }


def main() -> int:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    capacities = config["classroom-capacities"]
    mappings = config["seat-mappings"]

    rooms = {}
    errors = []
    for room, capacity in capacities.items():
        try:
            rooms[room] = convert_room(room, capacity, mappings[room])
            print(f"  ok  {room}: {capacity} seats, {len(rooms[room]['corridors'])} corridors, "
                  f"{rooms[room]['orientation']}")
        except (AssertionError, FileNotFoundError, KeyError) as exc:
            errors.append(f"{room}: {exc}")
            print(f" FAIL {room}: {exc}", file=sys.stderr)

    if errors:
        print(f"\n{len(errors)} room(s) failed — classrooms.json NOT written", file=sys.stderr)
        return 1

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": 1, "rooms": rooms}
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"\nWrote {OUTPUT_PATH} ({size_kb:.0f} KB, {len(rooms)} rooms)")

    WEB_TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    for room in rooms:
        shutil.copy2(TEMPLATES_DIR / f"Template_{room}.xlsx", WEB_TEMPLATES_DIR / f"Template_{room}.xlsx")
    print(f"Synced {len(rooms)} templates to {WEB_TEMPLATES_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
