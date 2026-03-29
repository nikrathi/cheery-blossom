#!/usr/bin/env python3

import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV_PATH = ROOT / "tambola_ticket_manifest.csv"
DEFAULT_JSON_PATH = ROOT / "output" / "tickets_manifest.json"
REPORT_PATH = ROOT / "output" / "csv_validation_report.json"

EXPECTED_HEADERS = ["Ticket", "Food Lovers", "Sakura Vibes", "Color Mood", "Japan Vibes"]
EXPECTED_TICKET_COUNT = 30
ENTRY_RE = re.compile(r"^\s*(\d+)\.\s+(.+?)\s*$")

CANONICAL_DATASET = {
    "Food Lovers": {
        17: "Pani Puri",
        63: "Dabeli",
        5: "Papdi Chaat",
        72: "Hakka Noodles",
        28: "Dal Pakwan",
        44: "Moong Chaat",
        9: "Dhokla",
        51: "Pav Bhaji",
        36: "Samosa",
        80: "Kachori",
        14: "Bhel Puri",
        67: "Sev Puri",
        2: "Chole Bhature",
        55: "Paneer Tikka",
        31: "Veg Spring Rolls",
        70: "Masala Corn",
        21: "Cheese Balls",
        48: "Aloo Tikki",
        11: "Falafel",
        60: "Nachos",
    },
    "Sakura Vibes": {
        6: "Cherry Blossom",
        75: "Pink Kimono",
        24: "Paper Lantern",
        58: "Sakura Tree",
        12: "Origami Crane",
        41: "Tea Ceremony",
        79: "Blossom Path",
        33: "Floral Hairpin",
        18: "Petal Shower",
        65: "Japanese Fan",
        27: "Spring Breeze",
        53: "Hanami Picnic",
        3: "Silk Scarf",
        47: "Floral Dress",
        68: "Zen Garden",
        22: "Calligraphy Art",
        39: "Cherry Dessert",
        56: "Bonsai Tree",
        8: "Pink Sunset",
        62: "Garden Bridge",
    },
    "Color Mood": {
        16: "Pastel Pink",
        73: "Lavender Purple",
        1: "Sunshine Yellow",
        50: "Sky Blue",
        26: "Mint Green",
        64: "Coral Peach",
        35: "Ivory White",
        77: "Baby Blue",
        13: "Rose Gold",
        59: "Lilac",
        42: "Aqua",
        23: "Soft Beige",
        66: "Dusty Pink",
        4: "Teal",
        71: "Cream",
        29: "Peach",
        54: "Blush Pink",
        7: "Light Grey",
        49: "Champagne",
        32: "Frost Blue",
    },
    "Japan Vibes": {
        20: "Tokyo",
        61: "Kyoto",
        10: "Osaka",
        57: "Mount Fuji",
        25: "Shibuya Crossing",
        74: "Bullet Train",
        15: "Sushi",
        46: "Ramen",
        69: "Torii Gate",
        34: "Samurai",
        76: "Geisha",
        19: "Anime",
        43: "Cherry Shrine",
        30: "Bamboo Forest",
        78: "Sumo Wrestling",
        37: "Matcha",
        52: "Onsen",
        40: "Japanese Garden",
        38: "Pagoda",
        45: "Street market",
    },
}


def parse_cell_entries(cell):
    pieces = [piece.strip() for piece in cell.split("|") if piece.strip()]
    parsed = []
    malformed = []
    for piece in pieces:
        match = ENTRY_RE.match(piece)
        if not match:
            malformed.append(piece)
            continue
        parsed.append((int(match.group(1)), match.group(2).strip()))
    return pieces, parsed, malformed


def ticket_signature_from_csv_row(row):
    signature = []
    for category in EXPECTED_HEADERS[1:]:
        _, parsed, _ = parse_cell_entries(row[category])
        signature.extend((category, number, name) for number, name in parsed)
    return tuple(sorted(signature))


def ticket_signature_from_json_ticket(ticket):
    signature = []
    for category in EXPECTED_HEADERS[1:]:
        signature.extend((category, int(item["number"]), item["name"]) for item in ticket[category])
    return tuple(sorted(signature))


def validate(csv_path=DEFAULT_CSV_PATH, json_path=DEFAULT_JSON_PATH):
    errors = []
    warnings = []

    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        headers = reader.fieldnames or []

    summary = {
        "csv_path": str(csv_path),
        "row_count": len(rows),
        "expected_ticket_count": EXPECTED_TICKET_COUNT,
        "headers_match_expected": headers == EXPECTED_HEADERS,
    }

    if headers != EXPECTED_HEADERS:
        errors.append(f"CSV headers do not match expected layout: {headers!r}")
    if len(rows) != EXPECTED_TICKET_COUNT:
        errors.append(f"Expected {EXPECTED_TICKET_COUNT} tickets, found {len(rows)}")

    ticket_ids = []
    seen_ticket_signatures = {}
    seen_category_signatures = {category: {} for category in EXPECTED_HEADERS[1:]}
    number_to_names = defaultdict(set)
    name_to_numbers = defaultdict(set)
    category_counts = {category: Counter() for category in EXPECTED_HEADERS[1:]}
    global_number_counts = Counter()
    global_name_counts = Counter()
    global_pair_counts = Counter()

    for row_index, row in enumerate(rows, start=2):
        ticket_raw = (row.get("Ticket") or "").strip()
        if not ticket_raw.isdigit():
            errors.append(f"Row {row_index}: invalid ticket id {ticket_raw!r}")
            continue

        ticket_id = int(ticket_raw)
        ticket_ids.append(ticket_id)
        ticket_numbers = []
        ticket_names = []
        ticket_pairs = []
        full_signature = []

        for category in EXPECTED_HEADERS[1:]:
            cell = (row.get(category) or "").strip()
            if not cell:
                errors.append(f"Ticket {ticket_id}: empty value for {category}")
                continue

            raw_pieces, parsed, malformed = parse_cell_entries(cell)
            if len(raw_pieces) != 4:
                errors.append(f"Ticket {ticket_id}: {category} has {len(raw_pieces)} entries instead of 4")
            for piece in malformed:
                errors.append(f"Ticket {ticket_id}: malformed {category} entry {piece!r}")

            canonical = CANONICAL_DATASET[category]
            category_signature = tuple(sorted(parsed))
            previous_ticket = seen_category_signatures[category].get(category_signature)
            if previous_ticket is not None:
                errors.append(f"Ticket {ticket_id}: {category} combination duplicates ticket {previous_ticket}")
            else:
                seen_category_signatures[category][category_signature] = ticket_id

            category_numbers = []
            category_names = []
            for number, name in parsed:
                full_signature.append((category, number, name))
                ticket_numbers.append(number)
                ticket_names.append(name)
                ticket_pairs.append((number, name))
                category_numbers.append(number)
                category_names.append(name)
                number_to_names[number].add(name)
                name_to_numbers[name].add(number)
                category_counts[category][number] += 1
                global_number_counts[number] += 1
                global_name_counts[name] += 1
                global_pair_counts[(number, name)] += 1

                expected_name = canonical.get(number)
                if expected_name is None:
                    errors.append(f"Ticket {ticket_id}: {category} contains invalid number {number}")
                elif expected_name != name:
                    errors.append(
                        f"Ticket {ticket_id}: {category} has {number}. {name}, expected {number}. {expected_name}"
                    )

            if len(category_numbers) != len(set(category_numbers)):
                errors.append(f"Ticket {ticket_id}: duplicate number inside {category}")
            if len(category_names) != len(set(category_names)):
                errors.append(f"Ticket {ticket_id}: duplicate name inside {category}")
            if len(parsed) != len(set(parsed)):
                errors.append(f"Ticket {ticket_id}: duplicate number/name pair inside {category}")
            if category_numbers and category_numbers != sorted(category_numbers):
                warnings.append(f"Ticket {ticket_id}: {category} entries are not sorted ascending")

        if len(ticket_numbers) != 16:
            errors.append(f"Ticket {ticket_id}: has {len(ticket_numbers)} total entries instead of 16")
        if len(ticket_numbers) != len(set(ticket_numbers)):
            errors.append(f"Ticket {ticket_id}: repeated number across categories")
        if len(ticket_names) != len(set(ticket_names)):
            errors.append(f"Ticket {ticket_id}: repeated name across categories")
        if len(ticket_pairs) != len(set(ticket_pairs)):
            errors.append(f"Ticket {ticket_id}: repeated number/name pair across categories")

        full_signature = tuple(sorted(full_signature))
        previous_ticket = seen_ticket_signatures.get(full_signature)
        if previous_ticket is not None:
            errors.append(f"Ticket {ticket_id}: duplicates full ticket {previous_ticket}")
        else:
            seen_ticket_signatures[full_signature] = ticket_id

    if len(ticket_ids) != len(set(ticket_ids)):
        errors.append("Ticket IDs are not unique")
    if sorted(ticket_ids) != list(range(1, len(rows) + 1)):
        errors.append(f"Ticket IDs are not exactly 1..{len(rows)}")

    expected_global_numbers = {number for mapping in CANONICAL_DATASET.values() for number in mapping}
    expected_global_names = {name for mapping in CANONICAL_DATASET.values() for name in mapping.values()}
    if set(global_number_counts) != expected_global_numbers:
        missing = sorted(expected_global_numbers - set(global_number_counts))
        extra = sorted(set(global_number_counts) - expected_global_numbers)
        errors.append(f"Global number set mismatch. Missing={missing}, extra={extra}")
    if set(global_name_counts) != expected_global_names:
        missing = sorted(expected_global_names - set(global_name_counts))
        extra = sorted(set(global_name_counts) - expected_global_names)
        errors.append(f"Global name set mismatch. Missing={missing}, extra={extra}")

    for number, names in sorted(number_to_names.items()):
        if len(names) != 1:
            errors.append(f"Number {number} maps to multiple names: {sorted(names)}")
    for name, numbers in sorted(name_to_numbers.items()):
        if len(numbers) != 1:
            errors.append(f"Name {name!r} maps to multiple numbers: {sorted(numbers)}")

    per_category_frequency = {}
    for category, mapping in CANONICAL_DATASET.items():
        counts = category_counts[category]
        frequencies = sorted(set(counts.values())) if counts else []
        missing_numbers = sorted(set(mapping) - set(counts))
        extra_numbers = sorted(set(counts) - set(mapping))
        per_category_frequency[category] = {
            "distinct_numbers_seen": len(counts),
            "missing_numbers": missing_numbers,
            "extra_numbers": extra_numbers,
            "frequency_values": frequencies,
        }
        if missing_numbers:
            errors.append(f"{category}: missing numbers {missing_numbers}")
        if extra_numbers:
            errors.append(f"{category}: extra numbers {extra_numbers}")
        if frequencies != [6]:
            errors.append(f"{category}: expected each number to appear 6 times, saw frequencies {frequencies}")

    summary.update(
        {
            "ticket_ids_unique": len(ticket_ids) == len(set(ticket_ids)),
            "ticket_ids_sequential": sorted(ticket_ids) == list(range(1, len(rows) + 1)),
            "full_ticket_uniqueness": len(seen_ticket_signatures) == len(rows),
            "distinct_numbers_seen": len(global_number_counts),
            "distinct_names_seen": len(global_name_counts),
            "distinct_pairs_seen": len(global_pair_counts),
            "total_entries": sum(global_number_counts.values()),
            "all_80_numbers_present": set(global_number_counts) == expected_global_numbers,
            "all_80_names_present": set(global_name_counts) == expected_global_names,
            "per_category_frequency": per_category_frequency,
        }
    )

    if json_path.exists():
        json_data = json.loads(json_path.read_text())
        json_tickets = json_data.get("tickets", [])
        csv_signatures = {ticket_signature_from_csv_row(row) for row in rows}
        json_signatures = {ticket_signature_from_json_ticket(ticket) for ticket in json_tickets}
        if csv_signatures != json_signatures:
            warnings.append(
                "CSV does not match output/tickets_manifest.json. This is not an internal CSV validity error, "
                "but the exported ticket set differs from the older JSON manifest."
            )
        summary["matches_json_manifest_ticket_set"] = csv_signatures == json_signatures

    result = {
        "status": "pass" if not errors else "fail",
        "summary": summary,
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors,
        "warnings": warnings,
    }
    return result


def main():
    result = validate()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["status"] == "pass" else 1)


if __name__ == "__main__":
    main()
