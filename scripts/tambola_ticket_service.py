#!/usr/bin/env python3

import argparse
import csv
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from generate_ticket_manifest import build_ticket_manifest, render_markdown
from validate_tickets_csv import validate as validate_csv


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST_JSON = ROOT / "output" / "tickets_manifest.json"
DEFAULT_MANIFEST_MD = ROOT / "output" / "tickets_manifest.md"
DEFAULT_CSV = ROOT / "tambola_ticket_manifest.csv"
DEFAULT_REPORT = ROOT / "output" / "csv_validation_report.json"
DEFAULT_APP_DATA = ROOT / "public" / "app-data.json"
DEFAULT_RENDER_SCRIPT = ROOT / "scripts" / "render_tickets.swift"
DEFAULT_BASE_IMAGE = ROOT / "assets" / "base_template.png"
DEFAULT_TICKETS_DIR = ROOT / "output" / "tickets"
DEFAULT_PREVIEW_DIR = ROOT / "output" / "previews"
EXPECTED_HEADERS = ["Ticket", "Food Lovers", "Sakura Vibes", "Color Mood", "Japan Vibes"]
CATEGORY_ORDER = EXPECTED_HEADERS[1:]
PRIZE_ORDER = [*CATEGORY_ORDER, "Full House"]
ENTRY_RE = re.compile(r"^\s*(\d+)\.\s+(.+?)\s*$")


def format_entries(entries):
    return " | ".join(f"{entry['number']}. {entry['name']}" for entry in entries)


def write_manifest_json(manifest, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def write_manifest_markdown(manifest, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_markdown(manifest), encoding="utf-8")


def write_manifest_csv(manifest, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=EXPECTED_HEADERS)
        writer.writeheader()

        for ticket in sorted(manifest["tickets"], key=lambda item: item["ticket_id"]):
            writer.writerow(
                {
                    "Ticket": ticket["ticket_id"],
                    "Food Lovers": format_entries(ticket["Food Lovers"]),
                    "Sakura Vibes": format_entries(ticket["Sakura Vibes"]),
                    "Color Mood": format_entries(ticket["Color Mood"]),
                    "Japan Vibes": format_entries(ticket["Japan Vibes"]),
                }
            )


def parse_entries(cell):
    parsed = []
    pieces = [piece.strip() for piece in cell.split("|") if piece.strip()]

    for piece in pieces:
        match = ENTRY_RE.match(piece)
        if not match:
            raise ValueError(f"Malformed entry: {piece!r}")
        parsed.append((int(match.group(1)), match.group(2).strip()))

    return parsed


def parse_ticket_csv(csv_path):
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        headers = reader.fieldnames or []

    if headers != EXPECTED_HEADERS:
        raise ValueError(f"Unexpected CSV headers: {headers!r}")

    tickets = []
    numbers = {}
    names = {}

    for row in rows:
        ticket_id = int((row.get("Ticket") or "").strip())
        categories = {}
        entries = []

        for category in CATEGORY_ORDER:
            parsed = parse_entries((row.get(category) or "").strip())
            if len(parsed) != 4:
                raise ValueError(f"Ticket {ticket_id}: {category} has {len(parsed)} entries instead of 4")

            category_entries = []
            category_numbers = set()
            category_names = set()

            for number, name in parsed:
                if number in category_numbers:
                    raise ValueError(f"Ticket {ticket_id}: duplicate number {number} inside {category}")
                if name in category_names:
                    raise ValueError(f"Ticket {ticket_id}: duplicate name {name!r} inside {category}")

                record = {"number": number, "name": name, "category": category}
                existing_number = numbers.get(number)
                existing_name = names.get(name)

                if existing_number and existing_number["name"] != name:
                    raise ValueError(f"Number {number} maps to multiple names")
                if existing_name and existing_name["number"] != number:
                    raise ValueError(f"Name {name!r} maps to multiple numbers")

                numbers[number] = record
                names[name] = record
                category_numbers.add(number)
                category_names.add(name)
                category_entries.append(record)
                entries.append(record)

            categories[category] = sorted(category_entries, key=lambda item: item["number"])

        if len(entries) != 16 or len({entry["number"] for entry in entries}) != 16:
            raise ValueError(f"Ticket {ticket_id}: expected 16 unique numbers across all categories")

        tickets.append(
            {
                "ticketId": ticket_id,
                "categories": categories,
                "entries": sorted(entries, key=lambda item: item["number"]),
            }
        )

    return tickets, numbers


def export_app_data(csv_path, output_path):
    tickets, numbers = parse_ticket_csv(csv_path)
    category_directory = {
        category: sorted(
            [entry for entry in numbers.values() if entry["category"] == category],
            key=lambda item: item["number"],
        )
        for category in CATEGORY_ORDER
    }

    app_data = {
        "generatedFrom": csv_path.name,
        "sequenceDesignSource": "Validated random search over tambola_ticket_manifest.csv",
        "sequenceMode": "validated-random-search",
        "ticketCount": len(tickets),
        "maxNumber": len(numbers),
        "categoryOrder": CATEGORY_ORDER,
        "prizeOrder": PRIZE_ORDER,
        "winnerPolicy": {
            "uniquePrizeWinner": True,
            "distinctWinningTickets": True,
        },
        "tickets": sorted(tickets, key=lambda item: item["ticketId"]),
        "numberDirectory": sorted(numbers.values(), key=lambda item: item["number"]),
        "categoryDirectory": category_directory,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(app_data, indent=2), encoding="utf-8")


def write_validation_report(result, report_path):
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, indent=2), encoding="utf-8")


def run_swift_renderer(manifest_json, base_image, tickets_dir, previews_dir, render_script):
    if not base_image.exists():
        raise FileNotFoundError(
            f"Base template image not found at {base_image}. "
            "Provide --base-image or make sure assets/base_template.png exists."
        )
    if not manifest_json.exists():
        raise FileNotFoundError(
            f"Manifest JSON not found at {manifest_json}. Generate the manifest before rendering."
        )

    env = os.environ.copy()
    module_cache = str(ROOT / ".swift-cache")
    env["SWIFT_MODULECACHE_PATH"] = module_cache
    env["CLANG_MODULE_CACHE_PATH"] = module_cache
    env["TAMBOLA_MANIFEST_JSON"] = str(manifest_json)
    env["TAMBOLA_BASE_IMAGE"] = str(base_image)
    env["TAMBOLA_TICKETS_OUTPUT_DIR"] = str(tickets_dir)
    env["TAMBOLA_PREVIEWS_OUTPUT_DIR"] = str(previews_dir)

    (ROOT / ".swift-cache").mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["swift", str(render_script)],
        check=True,
        cwd=ROOT,
        env=env,
    )


def command_generate(args):
    manifest = build_ticket_manifest()
    write_manifest_json(manifest, args.manifest_json)
    write_manifest_markdown(manifest, args.manifest_md)
    write_manifest_csv(manifest, args.csv)
    print(f"Wrote {args.manifest_json}")
    print(f"Wrote {args.manifest_md}")
    print(f"Wrote {args.csv}")


def command_validate(args):
    result = validate_csv(args.csv, args.manifest_json)
    write_validation_report(result, args.report)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["status"] == "pass" else 1)


def command_export_app_data(args):
    export_app_data(args.csv, args.app_data)
    print(f"Wrote {args.app_data}")


def command_render(args):
    run_swift_renderer(
        manifest_json=args.manifest_json,
        base_image=args.base_image,
        tickets_dir=args.tickets_dir,
        previews_dir=args.previews_dir,
        render_script=args.render_script,
    )
    print(f"Rendered tickets to {args.tickets_dir}")
    print(f"Created preview in {args.previews_dir}")


def command_build(args):
    manifest = build_ticket_manifest()
    write_manifest_json(manifest, args.manifest_json)
    write_manifest_markdown(manifest, args.manifest_md)
    write_manifest_csv(manifest, args.csv)

    validation_result = validate_csv(args.csv, args.manifest_json)
    write_validation_report(validation_result, args.report)
    if validation_result["status"] != "pass":
        print(json.dumps(validation_result, indent=2))
        raise SystemExit(1)

    export_app_data(args.csv, args.app_data)

    print(f"Wrote {args.manifest_json}")
    print(f"Wrote {args.manifest_md}")
    print(f"Wrote {args.csv}")
    print(f"Wrote {args.report}")
    print(f"Wrote {args.app_data}")

    if args.render:
        run_swift_renderer(
            manifest_json=args.manifest_json,
            base_image=args.base_image,
            tickets_dir=args.tickets_dir,
            previews_dir=args.previews_dir,
            render_script=args.render_script,
        )
        print(f"Rendered tickets to {args.tickets_dir}")
        print(f"Created preview in {args.previews_dir}")


def add_common_manifest_arguments(parser):
    parser.add_argument("--manifest-json", type=Path, default=DEFAULT_MANIFEST_JSON)
    parser.add_argument("--manifest-md", type=Path, default=DEFAULT_MANIFEST_MD)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)


def add_render_arguments(parser):
    parser.add_argument("--render-script", type=Path, default=DEFAULT_RENDER_SCRIPT)
    parser.add_argument("--base-image", type=Path, default=DEFAULT_BASE_IMAGE)
    parser.add_argument("--tickets-dir", type=Path, default=DEFAULT_TICKETS_DIR)
    parser.add_argument("--previews-dir", type=Path, default=DEFAULT_PREVIEW_DIR)


def build_parser():
    parser = argparse.ArgumentParser(
        description="Generate, validate, render, and export Tambola tickets for the Cherry Blossom Tambola flow.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate_parser = subparsers.add_parser("generate", help="Generate JSON, Markdown, and CSV ticket manifests.")
    add_common_manifest_arguments(generate_parser)
    generate_parser.set_defaults(func=command_generate)

    validate_parser = subparsers.add_parser("validate", help="Validate a ticket CSV and write a JSON report.")
    validate_parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    validate_parser.add_argument("--manifest-json", type=Path, default=DEFAULT_MANIFEST_JSON)
    validate_parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    validate_parser.set_defaults(func=command_validate)

    export_parser = subparsers.add_parser("export-app-data", help="Export public/app-data.json from a ticket CSV.")
    export_parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    export_parser.add_argument("--app-data", type=Path, default=DEFAULT_APP_DATA)
    export_parser.set_defaults(func=command_export_app_data)

    render_parser = subparsers.add_parser("render", help="Render ticket images using the Swift renderer.")
    render_parser.add_argument("--manifest-json", type=Path, default=DEFAULT_MANIFEST_JSON)
    add_render_arguments(render_parser)
    render_parser.set_defaults(func=command_render)

    build_parser = subparsers.add_parser(
        "build",
        help="Generate manifests, validate the CSV, export app data, and optionally render ticket images.",
    )
    add_common_manifest_arguments(build_parser)
    build_parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    build_parser.add_argument("--app-data", type=Path, default=DEFAULT_APP_DATA)
    add_render_arguments(build_parser)
    build_parser.add_argument("--no-render", action="store_false", dest="render")
    build_parser.set_defaults(func=command_build, render=True)

    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main(sys.argv[1:])
