import os
import json
import argparse
import random
import platform
import subprocess
from typing import List, Dict, Tuple
from pathlib import Path
from openpyxl import load_workbook
from pypdf import PdfWriter

# Only import win32com on Windows
if platform.system() == 'Windows':
    import win32com.client

class SeatingPlanGenerator:
    def __init__(self, config_file: str):
        """Initialize with path to master configuration file."""
        self.config_file = config_file
        self._load_config()
        self._parse_input()
        self.generated_excel_files = []  # Track Excel files
        self.generated_pdf_files = []    # Track PDF files
        
    def _load_config(self):
        """Load classroom configuration from JSON file."""
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                self.classroom_configs = config["classroom-capacities"]
                self.seat_mappings = config["seat-mappings"]
        except FileNotFoundError:
            raise Exception(f"Configuration file {self.config_file} not found")
        except json.JSONDecodeError:
            raise Exception("Invalid JSON format in configuration file")
        except KeyError:
            raise Exception("Configuration file must contain 'classroom-capacities' or 'seat-mappings' key")

    def _parse_input(self):
        """Parse and validate all input data."""
        try:
            # Load input file
            with open('input.json', 'r', encoding='utf-8') as f:
                input_data = json.load(f)
                
            # Parse available classrooms
            available_classrooms = input_data["available_classrooms"]
            if not isinstance(available_classrooms, (list, dict)):
                raise ValueError("available_classrooms must be either a list or a dictionary")
            
            # Convert to consistent format and validate
            if isinstance(available_classrooms, dict):
                self.room_capacities = available_classrooms
                # Validate dictionary values are integers
                for room, capacity in available_classrooms.items():
                    if not isinstance(capacity, int) or capacity <= 0:
                        raise ValueError(f"Invalid capacity for classroom {room}: must be a positive integer")
            else:
                self.room_capacities = {room: self.classroom_configs[room] for room in available_classrooms}
            
            # Validate classrooms exist in configuration
            classroom_names = list(self.room_capacities.keys())
            invalid_rooms = set(classroom_names) - set(self.classroom_configs.keys())
            if invalid_rooms:
                raise Exception(f"Unknown classrooms in input: {invalid_rooms}")
            
            # Validate seat mappings
            missing_mappings = [room for room in classroom_names if room not in self.seat_mappings]
            if missing_mappings:
                raise Exception(f"Missing seat mappings for classrooms: {missing_mappings}")
            
            empty_mappings = [room for room in classroom_names if not self.seat_mappings[room]]
            if empty_mappings:
                raise Exception(f"Empty seat mappings for classrooms: {empty_mappings}")
            
            # Parse other input data
            self.student_file = input_data["student_ids_file"]
            # if it is not provided, use the current file's directory
            self.output_directory = input_data.get("output_directory", os.path.dirname(os.path.abspath(__file__)))
            self.exam_name = input_data["exam_name"]
            
            # Parse cell parameters if provided, otherwise use default
            self.cell_params = input_data.get("cell_params", ["student_id", "name"])
            
            # Validate cell parameters
            valid_params = ["seat_number", "student_id", "name"]
            invalid_params = [param for param in self.cell_params if param not in valid_params]
            if invalid_params:
                raise ValueError(f"Invalid cell parameters: {invalid_params}. Valid parameters are: {valid_params}")
            
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
            middle_initials = ' '.join(name[0] + '.' for name in middle_names)
            formatted = f"{first_name} {middle_initials} {last_name}"
            
            # If still too long, try without spaces between initials
            if len(formatted) > 16:
                middle_initials = ''.join(name[0] + '.' for name in middle_names)
                formatted = f"{first_name} {middle_initials} {last_name}"
            
            return formatted
            
        return full_name

    def _load_student_ids(self, student_file: str) -> List[Tuple[str, str]]:
        """Load student IDs and names from text file."""
        try:
            with open(student_file, 'r', encoding='utf-8') as f:
                students = []
                for line in f:
                    if line.strip():
                        # Get the ID (first sequence of digits)
                        student_id = line.strip().split()[0]
                        
                        # Get everything after the ID until the nickname
                        name_start = len(student_id)
                        nickname_start = line.rfind('(')
                        
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

    def generate_seating_plan(self) -> tuple[Dict[str, Dict[str, Tuple[str, str]]], str]:
        """Generate seating plan based on input specifications."""
        # Load student data
        students = self._load_student_ids(self.student_file)
        
        # Shuffle students
        random.shuffle(students)
        
        # Calculate total capacity
        total_capacity = sum(self.room_capacities.values())
        if len(students) > total_capacity:
            raise Exception(f"Not enough capacity in available classrooms "
                          f"(need: {len(students)}, available: {total_capacity})")

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

    def export_to_excel(self, seating_plan: Dict[str, Dict[str, Tuple[str, str]]], output_directory: str):
        """Export seating plan to Excel file with specific cell mappings using templates."""
        # Create output directory if it doesn't exist
        output_dir = Path(output_directory)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Clear previous list of generated files
        self.generated_excel_files = []
        
        # For each classroom and its students
        for room in seating_plan:
            # Load the template for this classroom
            template_path = f"Templates/Template_{room}.xlsx"
            try:
                wb = load_workbook(template_path)
                ws = wb.active
                
                # Write exam name to A1
                ws['A1'] = self.exam_name
                
                room_seats = self.seat_mappings[room]
                
                # Fill in students according to seat mappings
                for seat_id, student_info in seating_plan[room].items():
                    if seat_id in room_seats:
                        cell = room_seats[seat_id]
                        student_id, name = student_info
                        
                        # Build cell value based on configured parameters
                        cell_parts = []
                        for param in self.cell_params:
                            if param == "seat_number":
                                cell_parts.append(f"({seat_id})")
                            elif param == "student_id":
                                cell_parts.append(student_id)
                            elif param == "name":
                                cell_parts.append(name)
                        
                        # Join parts with spaces
                        ws[cell] = " ".join(cell_parts)
                
                # Generate output filename using exam name
                filename = f"{self.exam_name}_{room}.xlsx"
                full_output_path = output_dir / filename
                
                # Save the filled template
                wb.save(str(full_output_path))
                # Add to the list of generated files
                self.generated_excel_files.append(full_output_path)
                print(f"Generated seating plan for classroom {room}: {full_output_path}")
                
            except FileNotFoundError:
                print(f"Warning: Template file not found for classroom {room}: {template_path}")
                continue
            except Exception as e:
                print(f"Error processing classroom {room}: {str(e)}")
                continue

    def export_to_pdf(self, output_directory: str):
        """Convert generated Excel files to PDF format."""
        system = platform.system()
        
        # Clear previous list of generated PDF files
        self.generated_pdf_files = []
        
        if system == 'Windows':
            self._export_to_pdf_windows(output_directory)
        elif system == 'Linux':
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
                pdf_path = excel_file.with_suffix('.pdf')
                
                # Open the workbook
                wb = excel.Workbooks.Open(str(excel_file.absolute()))
                
                # Export as PDF with optimized settings
                wb.ExportAsFixedFormat(
                    Type=0,  # PDF format
                    Filename=str(pdf_path.absolute()),
                    Quality=0,  # Standard quality
                    IncludeDocProperties=True,
                    IgnorePrintAreas=False,
                    OpenAfterPublish=False
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
            if 'excel' in locals():
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
                pdf_path = excel_file.with_suffix('.pdf')
                
                # Use LibreOffice to convert
                cmd = [
                    'libreoffice',
                    '--headless',
                    '--convert-to', 'pdf',
                    '--outdir', str(output_dir),
                    str(excel_file.absolute())
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
                    print("Error: LibreOffice not found. Please install LibreOffice to convert files to PDF.")
                    return
            
            print("PDF conversion completed successfully!")
            
        except Exception as e:
            print(f"Error during PDF conversion: {str(e)}")

    def merge_pdfs(self, output_directory: str):
        """Merge all generated PDF files into a single PDF."""
        output_dir = Path(output_directory)
        
        # Use the tracked PDF files
        pdf_files = sorted(self.generated_pdf_files)  # Sort for consistent order

        if not pdf_files:
            print("No PDF files found to merge.")
            return

        writer = PdfWriter()
        for pdf_file in pdf_files:
            with open(pdf_file, "rb") as f:
                writer.append(f)
            print(f"Added {pdf_file.name} to merged PDF.")

        merged_filename = f"{self.exam_name}_All_Seating_Plans.pdf"
        merged_path = output_dir / merged_filename
        with open(merged_path, "wb") as f_out:
            writer.write(f_out)
        print(f"Merged PDF created: {merged_path}")

        # Add a tutanak.pdf file befor the each file in the list
        tutanak_path = "Templates/tutanak.pdf"
        writer = PdfWriter()
        for pdf_file in pdf_files:
            with open(pdf_file, "rb") as f:
                with open(tutanak_path, "rb") as f_tutanak:
                    writer.append(f_tutanak)
                    writer.append(f)
            print(f"Added tutanak and {pdf_file.name} to merged PDF.")
        
        merged_with_tutanak_name = f"{self.exam_name}_All_Seating_Plans_with_Tutanak_Printable.pdf"
        merged_with_tutanak_path = output_dir / merged_with_tutanak_name
        with open(merged_with_tutanak_path, "wb") as f_out:
            writer.write(f_out)
        print(f"Merged PDF with tutanak created: {merged_with_tutanak_path}")

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='Generate exam seating plan.')
    parser.add_argument(
        '-c', '--config',
        type=str,
        default='configuration.json',
        help='Path to configuration file (default: configuration.json)'
    )
    parser.add_argument(
        '-i', '--input',
        type=str,
        default='input.json',
        help='Path to input file (default: input.json)'
    )
    return parser.parse_args()

def main():
    try:
        # Parse command line arguments
        args = parse_arguments()
        
        # Initialize seating plan generator with provided configuration
        generator = SeatingPlanGenerator(args.config)
        
        # Generate seating plan
        seating_plan, output_directory = generator.generate_seating_plan()
        
        # Export to Excel
        generator.export_to_excel(seating_plan, output_directory)
        print(f"Seating plan has been generated successfully! Output saved to: {output_directory}")
        
        # Export to PDF
        generator.export_to_pdf(output_directory)
        print("PDF files have been generated successfully!")
        
        # Merge PDFs
        generator.merge_pdfs(output_directory)
        print("Merged PDF has been created successfully!")
        
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()