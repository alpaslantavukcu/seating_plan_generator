import json
import os
import re
import tempfile
import zipfile
import base64
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import streamlit as st
import streamlit.components.v1 as components

from seating_plan_generator import run_generation_pipeline


BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "configuration.json"
INPUT_PATH = BASE_DIR / "input.json"
UPLOAD_DIR = Path(os.getenv("STREAMLIT_UPLOAD_DIR", str(BASE_DIR / ".streamlit_uploads")))
OUTPUT_BASE_DIR = Path(
    os.getenv("STREAMLIT_OUTPUT_BASE_DIR", str(BASE_DIR / "generated_outputs"))
)


def load_defaults() -> Tuple[Dict[str, int], Dict[str, object]]:
    with open(CONFIG_PATH, "r", encoding="utf-8") as config_file:
        config_data = json.load(config_file)
    with open(INPUT_PATH, "r", encoding="utf-8") as input_file:
        input_data = json.load(input_file)
    return config_data["classroom-capacities"], input_data


def inject_styles() -> None:
    st.markdown(
        """
<style>
:root {
    --green-main: #2e7d32;
    --green-light: #66bb6a;
    --green-soft: #e8f5e9;
    --bg-white: #ffffff;
}

.stApp {
    background: linear-gradient(180deg, #f7fff7 0%, #ffffff 38%);
}

.title-card {
    background: var(--bg-white);
    border: 1px solid #dcefdc;
    border-radius: 16px;
    padding: 1.1rem 1.2rem;
    box-shadow: 0 6px 20px rgba(46, 125, 50, 0.08);
    margin-bottom: 0.8rem;
}

.title-card h2 {
    color: var(--green-main);
    margin: 0;
}

.title-card p {
    margin: 0.4rem 0 0;
    color: #355f37;
}

div.stButton > button {
    border-radius: 10px;
    border: 1px solid var(--green-main);
    background: var(--green-main);
    color: white;
    font-weight: 600;
    transition: all 0.2s ease-in-out;
}

div.stButton > button:hover {
    background: #256a2a;
    border-color: #256a2a;
}

div[data-baseweb="input"], div[data-baseweb="select"] {
    border-radius: 10px;
}

h3 {
    color: var(--green-main);
}

.section-label {
    font-weight: 700;
    color: var(--green-main);
    margin-top: 0.6rem;
}
</style>
""",
        unsafe_allow_html=True,
    )


def build_available_classrooms(
    selected_rooms: List[str],
    use_custom_capacities: bool,
    custom_capacities: Dict[str, int],
) -> Union[List[str], Dict[str, int]]:
    if use_custom_capacities:
        return {room: custom_capacities[room] for room in selected_rooms}
    return selected_rooms


def save_uploaded_student_file(uploaded_file) -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    upload_path = UPLOAD_DIR / uploaded_file.name
    upload_path.write_bytes(uploaded_file.getvalue())
    return upload_path


def resolve_output_directory(user_output_input: str) -> Path:
    OUTPUT_BASE_DIR.mkdir(parents=True, exist_ok=True)
    candidate = Path(user_output_input.strip())
    if candidate.is_absolute():
        return candidate
    return OUTPUT_BASE_DIR / candidate


def slugify_text(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-").lower()
    return normalized or "seating-plan"


def build_output_zip(output_directory: Path, exam_name: str) -> Tuple[bytes, str]:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_name = f"{slugify_text(exam_name)}_{timestamp}.zip"
    zip_buffer = BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for item in sorted(output_directory.rglob("*")):
            if item.is_file():
                archive.write(item, arcname=item.relative_to(output_directory))

    zip_buffer.seek(0)
    return zip_buffer.getvalue(), zip_name


def trigger_auto_download(zip_bytes: bytes, zip_name: str) -> None:
    st.session_state["zip_bytes"] = zip_bytes
    st.session_state["zip_name"] = zip_name
    st.session_state["download_trigger"] = datetime.now().timestamp()


def create_temp_input_file(
    exam_name: str,
    available_classrooms: Union[List[str], Dict[str, int]],
    student_file: str,
    output_directory: str,
    cell_params: List[str],
) -> Path:
    payload = {
        "exam_name": exam_name,
        "available_classrooms": available_classrooms,
        "student_ids_file": student_file,
        "output_directory": output_directory,
        "cell_params": cell_params,
    }
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as temp_file:
        json.dump(payload, temp_file, ensure_ascii=False, indent=2)
        return Path(temp_file.name)


def validate_inputs(
    exam_name: str,
    selected_rooms: List[str],
    cell_params: List[str],
    student_path: Optional[Path],
    use_custom_capacities: bool,
    custom_capacities: Dict[str, int],
    classroom_capacities: Dict[str, int],
) -> Optional[str]:
    if not exam_name.strip():
        return "Exam name is required."
    if not selected_rooms:
        return "Select at least one classroom."
    if not cell_params:
        return "Select at least one cell field (student id, name, or seat number)."
    if student_path is None or not student_path.exists():
        return "Provide a valid student list file."
    if use_custom_capacities:
        for room in selected_rooms:
            value = custom_capacities.get(room)
            max_capacity = classroom_capacities[room]
            if value is None or value <= 0:
                return f"Capacity for {room} must be a positive number."
            if value > max_capacity:
                return (
                    f"Capacity for {room} cannot exceed configured maximum "
                    f"({max_capacity})."
                )
    return None


def main() -> None:
    st.set_page_config(page_title="Seating Plan Generator", page_icon="🪑", layout="wide")
    inject_styles()

    try:
        classroom_capacities, input_defaults = load_defaults()
    except Exception as error:
        st.error(f"Failed to load config/input files: {error}")
        return

    st.markdown(
        """
<div class="title-card">
  <h2>Seating Plan Generator</h2>
  <p>Create seating plans with a modern workflow and full export pipeline.</p>
</div>
""",
        unsafe_allow_html=True,
    )

    room_options = sorted(classroom_capacities.keys())
    default_selected_rooms = input_defaults.get("available_classrooms", [])
    if isinstance(default_selected_rooms, dict):
        default_selected_rooms = list(default_selected_rooms.keys())

    default_cell_params = input_defaults.get("cell_params", ["student_id", "name"])
    default_output_directory = input_defaults.get("output_directory", "output")
    default_exam_name = input_defaults.get("exam_name", "")

    with st.form("seating_plan_form", clear_on_submit=False):
        left_col, right_col = st.columns(2)

        with left_col:
            st.markdown('<div class="section-label">Exam Settings</div>', unsafe_allow_html=True)
            exam_name = st.text_input("Exam name", value=default_exam_name)
            output_directory = st.text_input(
                "Output directory",
                value=str(default_output_directory),
                help="Relative paths are created under the app output base directory.",
            )
            overwrite_output = st.checkbox(
                "Overwrite output directory if it already exists", value=False
            )

            seed_text = st.text_input(
                "Random seed (optional)",
                value="",
                help="Enter a number for reproducible shuffling.",
            )

        with right_col:
            st.markdown('<div class="section-label">Classroom Selection</div>', unsafe_allow_html=True)
            selected_rooms = st.multiselect(
                "Available classrooms",
                options=room_options,
                default=[room for room in default_selected_rooms if room in room_options],
            )
            use_custom_capacities = st.checkbox("Use custom capacities per classroom", value=False)

        custom_capacities: Dict[str, int] = {}
        if use_custom_capacities and selected_rooms:
            st.markdown('<div class="section-label">Custom Capacities</div>', unsafe_allow_html=True)
            capacity_columns = st.columns(3)
            for idx, room in enumerate(selected_rooms):
                max_capacity = classroom_capacities[room]
                with capacity_columns[idx % 3]:
                    custom_capacities[room] = st.number_input(
                        f"{room} capacity (max {max_capacity})",
                        min_value=1,
                        max_value=max_capacity,
                        value=max_capacity,
                        step=1,
                    )

        st.markdown('<div class="section-label">Student List</div>', unsafe_allow_html=True)
        source_mode = st.radio(
            "Student file source",
            options=["Use existing file path", "Upload file"],
            horizontal=True,
        )
        student_file_path_input = st.text_input(
            "Student list file path",
            value=str(input_defaults.get("student_ids_file", "ogrenci-listesi.txt")),
            disabled=(source_mode != "Use existing file path"),
        )
        uploaded_file = st.file_uploader(
            "Upload student list (.txt)",
            type=["txt"],
            disabled=(source_mode != "Upload file"),
        )

        st.markdown('<div class="section-label">Cell Fields</div>', unsafe_allow_html=True)
        cell_params = st.multiselect(
            "Show these values in seat cells",
            options=["student_id", "name", "seat_number"],
            default=[p for p in default_cell_params if p in {"student_id", "name", "seat_number"}],
        )

        run_clicked = st.form_submit_button("Generate Seating Plans")

    if not run_clicked:
        return

    parsed_seed: Optional[int] = None
    if seed_text.strip():
        try:
            parsed_seed = int(seed_text.strip())
        except ValueError:
            st.error("Random seed must be a valid integer.")
            return

    student_path: Optional[Path] = None
    if source_mode == "Upload file":
        if uploaded_file is not None:
            student_path = save_uploaded_student_file(uploaded_file)
    else:
        candidate = Path(student_file_path_input)
        if not candidate.is_absolute():
            candidate = BASE_DIR / candidate
        student_path = candidate

    error_message = validate_inputs(
        exam_name=exam_name,
        selected_rooms=selected_rooms,
        cell_params=cell_params,
        student_path=student_path,
        use_custom_capacities=use_custom_capacities,
        custom_capacities=custom_capacities,
        classroom_capacities=classroom_capacities,
    )
    if error_message:
        st.error(error_message)
        return

    available_classrooms = build_available_classrooms(
        selected_rooms=selected_rooms,
        use_custom_capacities=use_custom_capacities,
        custom_capacities=custom_capacities,
    )
    resolved_output_dir = resolve_output_directory(output_directory)

    temp_input_path = create_temp_input_file(
        exam_name=exam_name,
        available_classrooms=available_classrooms,
        student_file=str(student_path),
        output_directory=str(resolved_output_dir),
        cell_params=cell_params,
    )

    try:
        with st.spinner("Generating seating plans and exports..."):
            result = run_generation_pipeline(
                config_file=str(CONFIG_PATH),
                input_file=str(temp_input_path),
                pdf_only=False,
                seed=parsed_seed,
                overwrite_output=overwrite_output,
                allow_prompt=False,
            )
        output_dir = Path(result["output_directory"])
        zip_bytes, zip_name = build_output_zip(output_dir, exam_name)
        trigger_auto_download(zip_bytes, zip_name)

        st.success("Generation completed successfully.")
        st.write(f"Output directory: `{output_dir}`")
        st.write(f"Excel files generated: `{len(result['excel_files'])}`")
        st.write(f"PDF files generated: `{len(result['pdf_files'])}`")
        st.info(
            "Merged PDF files and single-sheet room list are generated in the output directory."
        )
        st.download_button(
            label="Download ZIP (fallback)",
            data=zip_bytes,
            file_name=zip_name,
            mime="application/zip",
            key=f"download_button_{zip_name}",
        )
    except Exception as error:
        st.error(f"Generation failed: {error}")
    finally:
        if temp_input_path.exists():
            temp_input_path.unlink()

    if st.session_state.get("zip_bytes") and st.session_state.get("zip_name"):
        download_token = st.session_state.get("download_trigger", 0)
        encoded = base64.b64encode(st.session_state["zip_bytes"]).decode("utf-8")
        components.html(
            f"""
<script>
(function() {{
    const binary = atob("{encoded}");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {{
        bytes[i] = binary.charCodeAt(i);
    }}
    const blob = new Blob([bytes], {{type: "application/zip"}});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "{st.session_state["zip_name"]}";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}})();
</script>
<div style="display:none">download-{download_token}</div>
""",
            height=0,
        )
        st.session_state.pop("zip_bytes", None)
        st.session_state.pop("zip_name", None)


if __name__ == "__main__":
    main()
