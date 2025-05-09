# Exam Seating Plan Generator

A Python program that generates exam seating plans by distributing students across available classrooms based on classroom capacities and seat mappings, with template-based visual output.

## Features

- Reads classroom configurations and seat mappings from a JSON file
- Accepts student IDs and names from a text file
- Shuffles students for random assignment
- Uses Excel templates for each classroom
- Assigns students to specific seats (cells) in Excel
- Formats long names to maintain readability
- Command-line interface for easy integration

## Prerequisites

- Python 3.7 or higher
- Required Python packages:
  ```bash
  pip install openpyxl
  ```

## Usage

### Command Line Interface

```bash
python seating_plan_generator.py -c <config_file> -i <input_file>
```

Arguments:
- `-c, --config`: Path to configuration JSON file (required)
- `-i, --input`: Path to input JSON file (required)

Example:
```bash
python seating_plan_generator.py -c config/configuration.json -i config/input.json
```

### File Formats

#### 1. Configuration File (configuration.json)
```json
{
    "classroom-capacities": {
        "Z-16": 70,
        "Z-17": 49,
        "Z-18": 54
    },
    "seat-mappings": {
        "Z-16": {
            "1": "C4",
            "2": "D4",
            "3": "E4"
        },
        "Z-17": {
            "1": "C4",
            "2": "D4",
            "3": "E4"
        }
    }
}
```
- `classroom-capacities`: Object with classroom codes as keys and their capacities as values
- `seat-mappings`: Object mapping seat numbers to Excel cells for each classroom

#### 2. Input File (input.json)
```json
{
    "available_classrooms": ["Z-16", "Z-17"],
    "student_ids_file": "data/student_ids.txt",
    "output_prefix": "output/seating_plan"
}
```
- `available_classrooms`: List of classrooms to use (must exist in configuration.json)
- `student_ids_file`: Path to text file containing student IDs and names
- `output_prefix`: Prefix for output files - one file per classroom will be created (e.g., "seating_plan_Z-16.xlsx", "seating_plan_Z-17.xlsx")

#### 3. Student IDs File (specified in input.json)
```text
150220722   John Smith (smithj)
150220724   Jane Doe (doej)
150220725   Alex Johnson (johnsona)
```
- Each line contains: Student ID, name, and nickname in parentheses
- IDs and names are separated by tabs or spaces

#### 4. Excel Templates
- Each classroom should have a template file named `Template_ROOM.xlsx`
- For example: `Template_Z-16.xlsx`, `Template_Z-17.xlsx`
- The templates should contain the classroom layout

## Distribution Algorithm

The program uses the following algorithm to distribute students:

1. **Input Processing**
   - Loads classroom configurations and seat mappings
   - Validates available classrooms and their seat mappings
   - Reads student IDs and names
   - Shuffles students for random assignment

2. **Capacity Validation**
   - Calculates total capacity of available classrooms
   - Verifies if there's enough capacity for all students
   - Ensures seat mappings exist for all classrooms

3. **Distribution Logic**
   - Shuffles the student list for random assignment
   - Assigns students to specific seats in each classroom
   - Uses the seat mapping to determine Excel cell positions

4. **Output Generation**
   - For each classroom, loads its template file
   - Places each student in their assigned cell
   - Formats each entry as "(seat_number) student_id - name"
   - For long names, formats as "First M. Last" (first name, middle initials, last name)
   - Creates separate output files for each classroom

## Example Workflow

1. **Setup Configuration**
   ```json
   {
       "classroom-capacities": {
           "Z-16": 70,
           "Z-17": 49
       },
       "seat-mappings": {
           "Z-16": {
               "1": "C4",
               "2": "D4"
           },
           "Z-17": {
               "1": "C4",
               "2": "D4"
           }
       }
   }
   ```

2. **Prepare Input**
   ```json
   {
       "available_classrooms": ["Z-16", "Z-17"],
       "student_ids_file": "students.txt",
       "output_prefix": "output/dummy"
   }
   ```

3. **Create Templates**
   - Create `Template_Z-16.xlsx` and `Template_Z-17.xlsx` with your desired layout

4. **Run Program**
   ```bash
   python seating_plan_generator.py -c configuration.json -i input.json
   ```

5. **Result**
   - One Excel file per classroom using the output prefix from input.json
   - For example: `dummy_Z-16.xlsx`, `dummy_Z-17.xlsx` if prefix is "dummy"
   - Students randomly assigned to seats with visual layout
   - Each cell shows: "(seat_number) student_id - name"

## Error Handling

The program handles various error conditions:
- Missing or invalid configuration/input files
- Unknown classrooms in input file
- Missing seat mappings for classrooms
- Empty seat mappings
- Insufficient total capacity
- Missing template files
- File permission issues

## Notes

- Students are shuffled for random distribution
- Template files must be named exactly `Template_ROOM.xlsx`
- Long names are reformatted to first name + middle initials + last name
- Output files are named using the pattern `{prefix}_{room}.xlsx`
- Output directories are created automatically if they don't exist

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is licensed under the MIT License - see the LICENSE file for details.