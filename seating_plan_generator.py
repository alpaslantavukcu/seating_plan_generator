import json
import pandas as pd
import argparse
import random
from typing import List, Dict, Set, Tuple
from pathlib import Path
from openpyxl import Workbook, load_workbook
from openpyxl.utils import get_column_letter

class SeatingPlanGenerator:
    def __init__(self, config_file: str):
        """Initialize with path to master configuration file."""
        self.config_file = config_file
        self._load_config()
        
    def _load_config(self):
        """Load classroom configuration from JSON file."""
        try:
            with open(self.config_file, 'r') as f:
                config = json.load(f)
                self.classroom_configs = config["classroom-capacities"]
                self.seat_mappings = config["seat-mappings"]
        except FileNotFoundError:
            raise Exception(f"Configuration file {self.config_file} not found")
        except json.JSONDecodeError:
            raise Exception("Invalid JSON format in configuration file")
        except KeyError:
            raise Exception("Configuration file must contain 'classroom-capacities' or 'seat-mappings' key")

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

    def _load_input(self, input_file: str) -> tuple[List[str], str, str]:
        """Load input data containing available classrooms and file paths."""
        try:
            with open(input_file, 'r') as f:
                input_data = json.load(f)
                return (
                    input_data["available_classrooms"],
                    input_data["student_ids_file"],
                    input_data["output_prefix"]
                )
        except FileNotFoundError:
            raise Exception(f"Input file {input_file} not found")
        except json.JSONDecodeError:
            raise Exception("Invalid JSON format in input file")
        except KeyError as e:
            raise Exception(f"Missing required key in input file: {e}")

    def _validate_classrooms(self, available_classrooms: List[str]):
        """Validate that all requested classrooms exist in configuration."""
        # Check if classrooms exist in configuration
        invalid_rooms = set(available_classrooms) - set(self.classroom_configs.keys())
        if invalid_rooms:
            raise Exception(f"Unknown classrooms in input: {invalid_rooms}")
            
        # Check if seat mappings exist for each classroom
        missing_mappings = [room for room in available_classrooms if room not in self.seat_mappings]
        if missing_mappings:
            raise Exception(f"Missing seat mappings for classrooms: {missing_mappings}")
            
        # Check if seat mappings are not empty
        empty_mappings = [room for room in available_classrooms if not self.seat_mappings[room]]
        if empty_mappings:
            raise Exception(f"Empty seat mappings for classrooms: {empty_mappings}")

    def generate_seating_plan(self, input_file: str) -> tuple[Dict[str, Dict[str, Tuple[str, str]]], str]:
        """Generate seating plan based on input specifications."""
        # Load and validate input
        available_classrooms, student_file, output_prefix = self._load_input(input_file)
        students = self._load_student_ids(student_file)
        self._validate_classrooms(available_classrooms)

        # Shuffle students
        random.shuffle(students)

        # Calculate total available capacity
        total_capacity = sum(self.classroom_configs[room] for room in available_classrooms)
        if len(students) > total_capacity:
            raise Exception(f"Not enough capacity in available classrooms "
                          f"(need: {len(students)}, available: {total_capacity})")

        # Distribute students across classrooms with seat assignments
        seating_plan = {}
        student_index = 0

        # For each classroom
        for room in available_classrooms:
            room_seats = self.seat_mappings[room]
            seating_plan[room] = {}
            
            # Assign students to seats based on configuration order
            for seat_num in room_seats.keys():
                if student_index < len(students):
                    seating_plan[room][seat_num] = students[student_index]
                    student_index += 1
                else:
                    break

        return seating_plan, output_prefix

    def export_to_excel(self, seating_plan: Dict[str, Dict[str, Tuple[str, str]]], output_prefix: str):
        """Export seating plan to Excel file with specific cell mappings using templates."""
        # Create output directory if it doesn't exist
        output_path = Path(output_prefix)
        output_dir = output_path.parent
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Get the output file prefix without extension
        output_prefix_name = output_path.stem
        
        # For each classroom and its students
        for room in seating_plan:
            # Load the template for this classroom
            template_path = f"Templates/Template_{room}.xlsx"
            try:
                wb = load_workbook(template_path)
                ws = wb.active
                
                room_seats = self.seat_mappings[room]
                
                # Fill in students according to seat mappings
                for seat_id, student_info in seating_plan[room].items():
                    if seat_id in room_seats:
                        cell = room_seats[seat_id]
                        student_id, name = student_info
                        # Format: (seat_number) ID - Name
                        ws[cell] = f"({seat_id}) {student_id} - {name}"
                
                # Generate output filename for this classroom using the provided prefix
                filename = f"{output_prefix_name}_{room}.xlsx"
                full_output_path = output_dir / filename
                
                # Save the filled template
                wb.save(str(full_output_path))
                print(f"Generated seating plan for classroom {room}: {full_output_path}")
                
            except FileNotFoundError:
                print(f"Warning: Template file not found for classroom {room}: {template_path}")
                continue
            except Exception as e:
                print(f"Error processing classroom {room}: {str(e)}")
                continue

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
        
        # Generate seating plan based on provided input file
        seating_plan, output_prefix = generator.generate_seating_plan(args.input)
        
        # Export to Excel
        generator.export_to_excel(seating_plan, output_prefix)
        print(f"Seating plan has been generated successfully! Output saved to: {output_prefix}")
        
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()