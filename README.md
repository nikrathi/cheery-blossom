# Cherry Blossom Tambola

This repo contains:

- the static Tambola caller site in `public/`
- the ticket generator and validator in `scripts/`
- the ticket artwork template in `assets/base_template.png`

## Ticket Service

The main entrypoint is:

```bash
python3 scripts/tambola_ticket_service.py build
```

That command will:

1. generate a fresh ticket manifest
2. write `tambola_ticket_manifest.csv`
3. write `output/tickets_manifest.json`
4. write `output/tickets_manifest.md`
5. validate the CSV and write `output/csv_validation_report.json`
6. export `public/app-data.json` for the Tambola caller
7. render ticket PNGs and a contact sheet through the Swift renderer

## Useful Commands

Generate the manifest files only:

```bash
python3 scripts/tambola_ticket_service.py generate
```

Validate an existing CSV:

```bash
python3 scripts/tambola_ticket_service.py validate
```

Export Tambola app data from an existing CSV:

```bash
python3 scripts/tambola_ticket_service.py export-app-data
```

Render ticket images from an existing manifest JSON:

```bash
python3 scripts/tambola_ticket_service.py render
```

Skip ticket image rendering:

```bash
python3 scripts/tambola_ticket_service.py build --no-render
```

The legacy wrapper still works:

```bash
./scripts/build_tickets.sh
```

## Requirements

- Python 3
- Swift, for `scripts/render_tickets.swift`

## Outputs

- Ticket CSV: `tambola_ticket_manifest.csv`
- Ticket JSON manifest: `output/tickets_manifest.json`
- Ticket Markdown manifest: `output/tickets_manifest.md`
- Ticket images: `output/tickets/`
- Ticket preview sheet: `output/previews/tickets_contact_sheet.png`
- Validation report: `output/csv_validation_report.json`
- Tambola website data: `public/app-data.json`
