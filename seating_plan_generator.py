import argparse
import json
import os
import platform
import random
import shutil
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple

from openpyxl import load_workbook, Workbook
from openpyxl.styles import Alignment, Font
from pypdf import PdfWriter, PdfReader

# Only import win32com on Windows
if platform.system() == "Windows":
    import win32com.client  # type: ignore


class SeatingPlanGenerator:
    def __init__(self, config_file: str, input_file: str):
        """Initialize with path to master configuration file."""
        self.config_file = config_file
        self.input_file = input_file
        self._load_config()
        self._parse_input()
        self.generated_excel_files = []  # Track Excel files
        self.generated_pdf_files = []  # Track PDF files

    def _load_config(self):
        """Load classroom configuration from JSON file."""
        try:
            with open(self.config_file, "r", encoding="utf-8") as f:
                config = json.load(f)
                self.classroom_configs = config["classroom-capacities"]
                self.seat_mappings = config["seat-mappings"]
        except FileNotFoundError:
            raise Exception(f"Configuration file {self.config_file} not found")
        except json.JSONDecodeError:
            raise Exception("Invalid JSON format in configuration file")
        except KeyError:
            raise Exception(
                "Configuration file must contain 'classroom-capacities' or 'seat-mappings' key"
            )

    def _parse_input(self):
        """Parse and validate all input data."""
        try:
            # Load input file
            with open(self.input_file, "r", encoding="utf-8") as f:
                input_data = json.load(f)

            # Parse available classrooms
            available_classrooms = input_data["available_classrooms"]
            if not isinstance(available_classrooms, (list, dict)):
                raise ValueError(
                    "available_classrooms must be either a list or a dictionary"
                )

            # Convert to consistent format and validate
            if isinstance(available_classrooms, dict):
                self.room_capacities = available_classrooms
                # Validate dictionary values are integers
                for room, capacity in available_classrooms.items():
                    if not isinstance(capacity, int) or capacity <= 0:
                        raise ValueError(
                            f"Invalid capacity for classroom {room}: must be a positive integer"
                        )
            else:
                self.room_capacities = {
                    room: self.classroom_configs[room] for room in available_classrooms
                }

            # Validate classrooms exist in configuration
            classroom_names = list(self.room_capacities.keys())
            invalid_rooms = set(classroom_names) - set(self.classroom_configs.keys())
            if invalid_rooms:
                raise Exception(f"Unknown classrooms in input: {invalid_rooms}")

            # Validate seat mappings
            missing_mappings = [
                room for room in classroom_names if room not in self.seat_mappings
            ]
            if missing_mappings:
                raise Exception(
                    f"Missing seat mappings for classrooms: {missing_mappings}"
                )

            empty_mappings = [
                room for room in classroom_names if not self.seat_mappings[room]
            ]
            if empty_mappings:
                raise Exception(f"Empty seat mappings for classrooms: {empty_mappings}")

            # Parse other input data
            self.student_file = input_data["student_ids_file"]
            # if it is not provided, use the current file's directory
            self.output_directory = input_data.get(
                "output_directory", os.path.dirname(os.path.abspath(__file__))
            )
            self.exam_name = input_data["exam_name"]

            # Parse cell parameters if provided, otherwise use default
            self.cell_params = input_data.get("cell_params", ["student_id", "name"])

            # Validate cell parameters
            valid_params = ["seat_number", "student_id", "name"]
            invalid_params = [
                param for param in self.cell_params if param not in valid_params
            ]
            if invalid_params:
                raise ValueError(
                    f"Invalid cell parameters: {invalid_params}. Valid parameters are: {valid_params}"
                )

        except FileNotFoundError:
            raise Exception("Input file input.json not found")
        except json.JSONDecodeError:
            raise Exception("Invalid JSON format in input file")
        except KeyError as e:
            raise Exception(f"Missing required key in input file: {e}")

    def _format_long_name(self, full_name: str) -> str:
        """Format long names to first name + middle initials + last name."""
        # If name is short enough, return as is
        if len(full_name) <= 16:
            return full_name

        # Split the name into parts
        parts = full_name.split()

        # If only two parts, return as is
        if len(parts) <= 2:
            return full_name

        # For names with more than 2 parts
        if len(parts) > 2:
            # Keep first and last names
            first_name = parts[0]
            last_name = parts[-1]
            # Initialize only the middle parts
            middle_names = parts[1:-1]
            middle_initials = " ".join(name[0] + "." for name in middle_names)
            formatted = f"{first_name} {middle_initials} {last_name}"

            # If still too long, try without spaces between initials
            if len(formatted) > 16:
                middle_initials = "".join(name[0] + "." for name in middle_names)
                formatted = f"{first_name} {middle_initials} {last_name}"

            return formatted

        return full_name

    def _load_student_ids(self, student_file: str) -> List[Tuple[str, str]]:
        """Load student IDs and names from text file."""
        try:
            with open(student_file, "r", encoding="utf-8") as f:
                students = []
                for line in f:
                    if line.strip():
                        # Get the ID (first sequence of digits)
                        student_id = line.strip().split()[0]

                        # Get everything after the ID until the nickname
                        name_start = len(student_id)
                        nickname_start = line.rfind("(")

                        # Extract and clean the name
                        full_name = line[name_start:nickname_start].strip()

                        # Format long names
                        formatted_name = self._format_long_name(full_name)

                        students.append((student_id, formatted_name))
                return students
        except FileNotFoundError:
            raise Exception(f"Student ID file {student_file} not found")
        except Exception as e:
            raise Exception(f"Error reading student ID file: {str(e)}")

    def generate_seating_plan(
        self,
    ) -> Tuple[Dict[str, Dict[str, Tuple[str, str]]], str]:
        """Generate seating plan based on input specifications."""
        # Load student data
        students = self._load_student_ids(self.student_file)

        # Shuffle students
        random.shuffle(students)

        # Calculate total capacity
        total_capacity = sum(self.room_capacities.values())
        if len(students) > total_capacity:
            raise Exception(
                f"Not enough capacity in available classrooms "
                f"(need: {len(students)}, available: {total_capacity})"
            )

        # Distribute students across classrooms with seat assignments
        seating_plan = {}
        student_index = 0

        # For each classroom
        for room, capacity in self.room_capacities.items():
            room_seats = self.seat_mappings[room]
            seating_plan[room] = {}

            # Assign students to seats based on configuration order
            for seat_num in room_seats.keys():
                if student_index < len(students) and len(seating_plan[room]) < capacity:
                    seating_plan[room][seat_num] = students[student_index]
                    student_index += 1
                else:
                    break

        return seating_plan, self.output_directory

    def export_to_excel(
        self, seating_plan: Dict[str, Dict[str, Tuple[str, str]]], output_directory: str
    ):
        """Export seating plan to Excel file with specific cell mappings using templates."""
        # Create output directory if it doesn't exist
        output_dir = Path(output_directory)

        while output_dir.exists():
            if (
                input(
                    f"Output directory {output_dir} already exists. Do you want to overwrite it? (y/n): "
                ).lower()
                == "y"
            ):
                shutil.rmtree(output_dir)
            else:
                output_dir = Path(input("Please enter a new output directory: "))

        output_dir.mkdir(parents=True, exist_ok=True)

        # Clear previous list of generated files
        self.generated_excel_files = []

        # For each classroom and its students
        for room in seating_plan:
            # Load the template for this classroom
            template_path = f"Templates/Template_{room}.xlsx"
            try:
                wb = load_workbook(template_path)

                # Create two worksheets
                ws_id_only = wb.active
                ws_id_only.title = f"{room}_id_only"
                ws_full = wb.copy_worksheet(ws_id_only)
                ws_full.title = f"{room}_full"

                # Write exam name to A1 in both worksheets (preserving original logic)
                ws_id_only["A1"] = f"{self.exam_name} | {room}"
                ws_full["A1"] = f"{self.exam_name} | {room}"

                room_seats = self.seat_mappings[room]

                # Fill in students for both worksheets
                for seat_id, student_info in seating_plan[room].items():
                    if seat_id in room_seats:
                        cell = room_seats[seat_id]
                        student_id, name = student_info

                        # ID-only version
                        ws_id_only[cell] = student_id

                        # Full version with configured parameters
                        cell_parts = []
                        for param in self.cell_params:
                            if param == "seat_number":
                                cell_parts.append(f"({seat_id})")
                            elif param == "student_id":
                                cell_parts.append(student_id)
                            elif param == "name":
                                cell_parts.append(name)
                        ws_full[cell] = "\n".join(cell_parts)

                # Generate single output file
                filename = f"{self.exam_name}_{room}.xlsx"
                full_output_path = output_dir / filename

                # Save the workbook with both worksheets
                wb.save(str(full_output_path))
                # Add to the list of generated files
                self.generated_excel_files.append(full_output_path)
                print(
                    f"Generated seating plan for classroom {room} with both versions: {full_output_path}"
                )

            except FileNotFoundError:
                raise Exception(
                    f"Template file not found for classroom {room}: {template_path}"
                )
            except Exception as e:
                raise Exception(f"Error processing classroom {room}: {str(e)}")

    def export_to_pdf(self, output_directory: str):
        """Convert generated Excel files to PDF format."""
        system = platform.system()

        # Clear previous list of generated PDF files
        self.generated_pdf_files = []

        if system == "Windows":
            self._export_to_pdf_windows(output_directory)
        elif system == "Linux" or system == "Darwin":
            self._export_to_pdf_linux(output_directory)
        else:
            print(f"PDF conversion is not supported on {system} system")

    def _export_to_pdf_windows(self, output_directory: str):
        """Convert Excel files to PDF on Windows using win32com."""
        try:
            print("Starting PDF conversion...")
            # Initialize Excel application once
            excel = win32com.client.Dispatch("Excel.Application")
            excel.Visible = False
            excel.DisplayAlerts = False  # Disable alerts for faster processing

            # Use the tracked Excel files
            total_files = len(self.generated_excel_files)

            print(f"Found {total_files} Excel files to convert")

            for idx, excel_file in enumerate(self.generated_excel_files, 1):
                print(f"Converting file {idx}/{total_files}: {excel_file.name}")

                # Convert to PDF
                pdf_path = excel_file.with_suffix(".pdf")

                # Open the workbook
                wb = excel.Workbooks.Open(str(excel_file.absolute()))

                # Export as PDF with optimized settings
                wb.ExportAsFixedFormat(
                    Type=0,  # PDF format
                    Filename=str(pdf_path.absolute()),
                    Quality=0,  # Standard quality
                    IncludeDocProperties=True,
                    IgnorePrintAreas=False,
                    OpenAfterPublish=False,
                )

                # Close workbook
                wb.Close(SaveChanges=False)

                # Add to the list of generated PDF files
                self.generated_pdf_files.append(pdf_path)
                print(f"✓ Generated PDF: {pdf_path.name}")

            # Quit Excel application
            excel.Quit()
            print("PDF conversion completed successfully!")

        except Exception as e:
            print(f"Error converting to PDF: {str(e)}")
            if "excel" in locals():
                excel.Quit()

    def _export_to_pdf_linux(self, output_directory: str):
        """Convert Excel files to PDF on Linux using LibreOffice."""
        try:
            print("Starting PDF conversion...")
            output_dir = Path(output_directory)
            # Use the tracked Excel files
            total_files = len(self.generated_excel_files)

            print(f"Found {total_files} Excel files to convert")

            for idx, excel_file in enumerate(self.generated_excel_files, 1):
                print(f"Converting file {idx}/{total_files}: {excel_file.name}")

                # Convert to PDF using LibreOffice
                pdf_path = excel_file.with_suffix(".pdf")

                # Use LibreOffice to convert
                cmd = [
                    "libreoffice",
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(output_dir),
                    str(excel_file.absolute()),
                ]

                try:
                    subprocess.run(cmd, check=True, capture_output=True, text=True)
                    # Add to the list of generated PDF files
                    self.generated_pdf_files.append(pdf_path)
                    print(f"✓ Generated PDF: {pdf_path.name}")
                except subprocess.CalledProcessError as e:
                    print(f"Error converting {excel_file.name}: {e.stderr}")
                    continue
                except FileNotFoundError:
                    print(
                        "Error: LibreOffice not found. Please install LibreOffice to convert files to PDF."
                    )
                    return

            print("PDF conversion completed successfully!")

        except Exception as e:
            print(f"Error during PDF conversion: {str(e)}")

    def merge_pdfs(self, output_directory: str):
        """Merge all generated PDF files into separate PDFs for ID-only and full versions."""
        output_dir = Path(output_directory)

        # Use the tracked PDF files
        pdf_files = sorted(self.generated_pdf_files)  # Sort for consistent order

        if not pdf_files:
            print("No PDF files found to merge.")
            return

        # Create ID-only version (first page of each PDF)
        writer_id = PdfWriter()
        for pdf_file in pdf_files:
            with open(pdf_file, "rb") as f:
                # Get the first page (ID-only version)
                reader = PdfReader(f)
                writer_id.add_page(reader.pages[0])
            print(f"Added ID-only page from {pdf_file.name}")

        merged_id_name = f"{self.exam_name}_All_Seating_Plans_Only_ID.pdf"
        merged_id_path = output_dir / merged_id_name
        with open(merged_id_path, "wb") as f_out:
            writer_id.write(f_out)
        print(f"Merged ID-only PDF created: {merged_id_path}")

        # Create full version (second page of each PDF)
        writer_full = PdfWriter()
        for pdf_file in pdf_files:
            with open(pdf_file, "rb") as f:
                # Get the second page (full version)
                reader = PdfReader(f)
                writer_full.add_page(reader.pages[1])
            print(f"Added full version page from {pdf_file.name}")

        merged_full_name = f"{self.exam_name}_All_Seating_Plans_Full.pdf"
        merged_full_path = output_dir / merged_full_name
        with open(merged_full_path, "wb") as f_out:
            writer_full.write(f_out)
        print(f"Merged full version PDF created: {merged_full_path}")

        # Create full version with tutanak
        tutanak_path = "Templates/tutanak.pdf"
        writer_tutanak = PdfWriter()
        for pdf_file in pdf_files:
            with open(pdf_file, "rb") as f:
                with open(tutanak_path, "rb") as f_tutanak:
                    # Add tutanak and the second page (full version)
                    reader_tutanak = PdfReader(f_tutanak)
                    reader_pdf = PdfReader(f)
                    writer_tutanak.add_page(reader_tutanak.pages[0])
                    writer_tutanak.add_page(reader_pdf.pages[1])
            print(f"Added tutanak and full version page from {pdf_file.name}")

        merged_with_tutanak_name = (
            f"{self.exam_name}_All_Seating_Plans_with_Tutanak_Printable.pdf"
        )
        merged_with_tutanak_path = output_dir / merged_with_tutanak_name
        with open(merged_with_tutanak_path, "wb") as f_out:
            writer_tutanak.write(f_out)
        print(
            f"Merged full version PDF with tutanak created: {merged_with_tutanak_path}"
        )

    def export_single_sheet_room_list(
        self, seating_plan: Dict[str, Dict[str, Tuple[str, str]]], output_directory: str
    ):
        """
        Export a single Excel sheet where each column is a classroom and each row is a student ID assigned to that classroom.
        """
        output_dir = Path(output_directory)
        wb = Workbook()
        ws = wb.active
        ws.title = "Room List"

        # Write the title row (merged)
        title = f"{self.exam_name}"
        ws.merge_cells(
            start_row=1, start_column=1, end_row=1, end_column=len(seating_plan) + 5
        )
        ws.cell(row=1, column=1, value=title)
        ws.cell(row=1, column=1).font = Font(bold=True, size=12)
        ws.cell(row=1, column=1).alignment = Alignment(
            horizontal="center", vertical="center"
        )
        ws.row_dimensions[1].height = 20  # Make the title row taller

        # Write classroom headers
        for col, room in enumerate(seating_plan.keys(), 1):
            ws.cell(row=2, column=col, value=room)
            ws.cell(row=2, column=col).font = Font(bold=True)
            ws.cell(row=2, column=col).alignment = Alignment(horizontal="center")

        # Find the max number of students in any room
        max_students = max(len(students) for students in seating_plan.values())

        # Write student IDs under each classroom
        for col, room in enumerate(seating_plan.keys(), 1):
            students = list(seating_plan[room].values())
            for row in range(max_students):
                if row < len(students):
                    student_id = students[row][0]
                    cell = ws.cell(row=row + 3, column=col, value=student_id)
                    cell.alignment = Alignment(horizontal="center")
                    cell.font = Font(size=5.5)  # Smaller font size
                    ws.row_dimensions[row + 3].height = 7.5  # Smaller row height

        # Adjust column widths
        for col in range(1, len(seating_plan) + 1):
            ws.column_dimensions[chr(64 + col)].width = 16

        # Set print settings to fit all columns on one page (width-wise)
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE

        # Reduce print margins (in inches)
        ws.page_margins.left = 0.2
        ws.page_margins.right = 0.2
        ws.page_margins.top = 0.2
        ws.page_margins.bottom = 0.2
        ws.page_margins.header = 0.1
        ws.page_margins.footer = 0.1

        # Save the file
        room_list_file = output_dir / f"{self.exam_name}_SingleSheetRoomList.xlsx"
        wb.save(str(room_list_file))
        print(f"Generated single-sheet room list Excel file: {room_list_file}")

        # Export to PDF
        system = platform.system()
        if system == "Windows":
            try:
                excel = win32com.client.Dispatch("Excel.Application")
                excel.Visible = False
                excel.DisplayAlerts = False

                wb = excel.Workbooks.Open(str(room_list_file.absolute()))
                pdf_path = room_list_file.with_suffix(".pdf")

                wb.ExportAsFixedFormat(
                    Type=0,  # PDF format
                    Filename=str(pdf_path.absolute()),
                    Quality=0,  # Standard quality
                    IncludeDocProperties=True,
                    IgnorePrintAreas=False,
                    OpenAfterPublish=False,
                )

                wb.Close(SaveChanges=False)
                excel.Quit()
                print(f"Generated room list PDF: {pdf_path}")

            except Exception as e:
                print(f"Error converting room list to PDF: {str(e)}")
                if "excel" in locals():
                    excel.Quit()

        elif system == "Linux":
            try:
                pdf_path = room_list_file.with_suffix(".pdf")
                cmd = [
                    "libreoffice",
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(output_dir),
                    str(room_list_file.absolute()),
                ]

                subprocess.run(cmd, check=True, capture_output=True, text=True)
                print(f"Generated room list PDF: {pdf_path}")

            except subprocess.CalledProcessError as e:
                print(f"Error converting room list to PDF: {e.stderr}")
            except FileNotFoundError:
                print(
                    "Error: LibreOffice not found. Please install LibreOffice to convert files to PDF."
                )
        else:
            print(f"PDF conversion is not supported on {system} system")


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Generate exam seating plan.")
    parser.add_argument(
        "-c",
        "--config",
        type=str,
        default="configuration.json",
        help="Path to configuration file (default: configuration.json)",
    )
    parser.add_argument(
        "-i",
        "--input",
        type=str,
        default="input.json",
        help="Path to input file (default: input.json)",
    )
    parser.add_argument(
        "--pdf-only",
        action="store_true",
        help="Only perform PDF operations (convert Excel to PDF and merge) without generating new seating plans",
    )
    parser.add_argument(
        "--seed", type=int, help="Random seed for reproducible student shuffling"
    )
    return parser.parse_args()


def main():
    try:
        # Parse command line arguments
        args = parse_arguments()

        # Set random seed if provided
        if args.seed is not None:
            random.seed(args.seed)
            print(f"Using random seed: {args.seed}")

        # Initialize seating plan generator with provided configuration
        generator = SeatingPlanGenerator(args.config, args.input)

        if not args.pdf_only:
            # Generate seating plan
            seating_plan, output_directory = generator.generate_seating_plan()

            # Export to Excel
            generator.export_to_excel(seating_plan, output_directory)
            print(
                f"Seating plan has been generated successfully! Output saved to: {output_directory}"
            )

            # Export the single-sheet room list
            generator.export_single_sheet_room_list(seating_plan, output_directory)
        else:
            # In PDF-only mode, we need to find existing Excel files
            output_directory = generator.output_directory
            excel_dir = Path(output_directory)
            generator.generated_excel_files = list(
                excel_dir.glob(f"{generator.exam_name}_*.xlsx")
            )

            if not generator.generated_excel_files:
                print(
                    f"No Excel files found for exam '{generator.exam_name}' in {output_directory}"
                )
                return

            print(
                f"Found {len(generator.generated_excel_files)} Excel files to process"
            )

        # Export to PDF
        generator.export_to_pdf(output_directory)
        print("PDF files have been generated successfully!")

        # Merge PDFs
        generator.merge_pdfs(output_directory)
        print("Merged PDFs have been created successfully!")

    except Exception as e:
        print(f"Error: {str(e)}")


if __name__ == "__main__":
    main()
