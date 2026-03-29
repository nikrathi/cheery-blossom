#!/usr/bin/env python3

import json
import random
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "output"
MANIFEST_PATH = OUTPUT_DIR / "tickets_manifest.json"
MARKDOWN_PATH = OUTPUT_DIR / "tickets_manifest.md"


DATASET = {
    "Food Lovers": [
        {"name": "Pani Puri", "number": 17},
        {"name": "Dabeli", "number": 63},
        {"name": "Papdi Chaat", "number": 5},
        {"name": "Hakka Noodles", "number": 72},
        {"name": "Dal Pakwan", "number": 28},
        {"name": "Moong Chaat", "number": 44},
        {"name": "Dhokla", "number": 9},
        {"name": "Pav Bhaji", "number": 51},
        {"name": "Samosa", "number": 36},
        {"name": "Kachori", "number": 80},
        {"name": "Bhel Puri", "number": 14},
        {"name": "Sev Puri", "number": 67},
        {"name": "Chole Bhature", "number": 2},
        {"name": "Paneer Tikka", "number": 55},
        {"name": "Veg Spring Rolls", "number": 31},
        {"name": "Masala Corn", "number": 70},
        {"name": "Cheese Balls", "number": 21},
        {"name": "Aloo Tikki", "number": 48},
        {"name": "Falafel", "number": 11},
        {"name": "Nachos", "number": 60},
    ],
    "Sakura Vibes": [
        {"name": "Cherry Blossom", "number": 6},
        {"name": "Pink Kimono", "number": 75},
        {"name": "Paper Lantern", "number": 24},
        {"name": "Sakura Tree", "number": 58},
        {"name": "Origami Crane", "number": 12},
        {"name": "Tea Ceremony", "number": 41},
        {"name": "Blossom Path", "number": 79},
        {"name": "Floral Hairpin", "number": 33},
        {"name": "Petal Shower", "number": 18},
        {"name": "Japanese Fan", "number": 65},
        {"name": "Spring Breeze", "number": 27},
        {"name": "Hanami Picnic", "number": 53},
        {"name": "Silk Scarf", "number": 3},
        {"name": "Floral Dress", "number": 47},
        {"name": "Zen Garden", "number": 68},
        {"name": "Calligraphy Art", "number": 22},
        {"name": "Cherry Dessert", "number": 39},
        {"name": "Bonsai Tree", "number": 56},
        {"name": "Pink Sunset", "number": 8},
        {"name": "Garden Bridge", "number": 62},
    ],
    "Color Mood": [
        {"name": "Pastel Pink", "number": 16},
        {"name": "Lavender Purple", "number": 73},
        {"name": "Sunshine Yellow", "number": 1},
        {"name": "Sky Blue", "number": 50},
        {"name": "Mint Green", "number": 26},
        {"name": "Coral Peach", "number": 64},
        {"name": "Ivory White", "number": 35},
        {"name": "Baby Blue", "number": 77},
        {"name": "Rose Gold", "number": 13},
        {"name": "Lilac", "number": 59},
        {"name": "Aqua", "number": 42},
        {"name": "Soft Beige", "number": 23},
        {"name": "Dusty Pink", "number": 66},
        {"name": "Teal", "number": 4},
        {"name": "Cream", "number": 71},
        {"name": "Peach", "number": 29},
        {"name": "Blush Pink", "number": 54},
        {"name": "Light Grey", "number": 7},
        {"name": "Champagne", "number": 49},
        {"name": "Frost Blue", "number": 32},
    ],
    "Japan Vibes": [
        {"name": "Tokyo", "number": 20},
        {"name": "Kyoto", "number": 61},
        {"name": "Osaka", "number": 10},
        {"name": "Mount Fuji", "number": 57},
        {"name": "Shibuya Crossing", "number": 25},
        {"name": "Bullet Train", "number": 74},
        {"name": "Sushi", "number": 15},
        {"name": "Ramen", "number": 46},
        {"name": "Torii Gate", "number": 69},
        {"name": "Samurai", "number": 34},
        {"name": "Geisha", "number": 76},
        {"name": "Anime", "number": 19},
        {"name": "Cherry Shrine", "number": 43},
        {"name": "Bamboo Forest", "number": 30},
        {"name": "Sumo Wrestling", "number": 78},
        {"name": "Matcha", "number": 37},
        {"name": "Onsen", "number": 52},
        {"name": "Japanese Garden", "number": 40},
        {"name": "Pagoda", "number": 38},
        {"name": "Street market", "number": 45},
    ],
}


CATEGORY_SEEDS = {
    "Food Lovers": 11,
    "Sakura Vibes": 23,
    "Color Mood": 37,
    "Japan Vibes": 49,
}

MASTER_SHUFFLE_SEED = 20260328
TICKET_COUNT = 30
ITEMS_PER_TICKET_PER_CATEGORY = 4


def build_balanced_category_tickets(category_name, items, seed):
    rng = random.Random(seed)
    round_pairs = [(a, b) for a in range(6) for b in range(a + 1, 6)] * 2
    rng.shuffle(round_pairs)
    ticket_indexes = list(range(TICKET_COUNT))
    item_indexes = list(range(len(items)))
    ticket_assignments = [set() for _ in ticket_indexes]

    for round_index in range(6):
        active_tickets = [idx for idx, pair in enumerate(round_pairs) if round_index not in pair]
        if len(active_tickets) != len(items):
            raise RuntimeError(f"{category_name}: expected 20 active tickets in round {round_index}")

        adjacency = {item_idx: active_tickets[:] for item_idx in item_indexes}
        for item_idx in item_indexes:
            rng.shuffle(adjacency[item_idx])

        item_order = item_indexes[:]
        rng.shuffle(item_order)
        match_to_item = {}

        def dfs(item_idx, seen):
            for ticket_idx in adjacency[item_idx]:
                if ticket_idx in seen or item_idx in ticket_assignments[ticket_idx]:
                    continue
                seen.add(ticket_idx)
                if ticket_idx not in match_to_item or dfs(match_to_item[ticket_idx], seen):
                    match_to_item[ticket_idx] = item_idx
                    return True
            return False

        for item_idx in item_order:
            if not dfs(item_idx, set()):
                raise RuntimeError(f"{category_name}: unable to complete round {round_index}")

        for ticket_idx, item_idx in match_to_item.items():
            ticket_assignments[ticket_idx].add(item_idx)

    structured = []
    usage_counts = Counter()

    for item_indexes_for_ticket in ticket_assignments:
        if len(item_indexes_for_ticket) != ITEMS_PER_TICKET_PER_CATEGORY:
            raise RuntimeError(f"{category_name}: ticket does not contain 4 unique items")

        selected_items = sorted(
            (items[item_idx] for item_idx in item_indexes_for_ticket),
            key=lambda entry: entry["number"],
        )
        structured.append(selected_items)
        usage_counts.update(entry["number"] for entry in selected_items)

    if set(usage_counts.values()) != {6}:
        raise RuntimeError(f"{category_name}: expected each number to appear exactly 6 times")

    return structured


def build_ticket_manifest():
    category_ticket_lists = {}
    for category_name, items in DATASET.items():
        category_ticket_lists[category_name] = build_balanced_category_tickets(
            category_name,
            items,
            CATEGORY_SEEDS[category_name],
        )

    tickets = []
    for ticket_index in range(TICKET_COUNT):
        food = category_ticket_lists["Food Lovers"][ticket_index]
        sakura = category_ticket_lists["Sakura Vibes"][ticket_index]
        color = category_ticket_lists["Color Mood"][ticket_index]
        japan = category_ticket_lists["Japan Vibes"][ticket_index]

        numbers = [entry["number"] for group in (food, sakura, color, japan) for entry in group]
        if len(numbers) != 16 or len(set(numbers)) != 16:
            raise RuntimeError(f"Ticket {ticket_index + 1} does not contain 16 unique numbers")

        tickets.append(
            {
                "ticket_id": ticket_index + 1,
                "Food Lovers": food,
                "Color Mood": color,
                "Sakura Vibes": sakura,
                "Japan Vibes": japan,
            }
        )

    shuffler = random.Random(MASTER_SHUFFLE_SEED)
    shuffler.shuffle(tickets)

    for final_index, ticket in enumerate(tickets, start=1):
        ticket["ticket_id"] = final_index

    signatures = {
        tuple(entry["number"] for category in ("Food Lovers", "Color Mood", "Sakura Vibes", "Japan Vibes") for entry in ticket[category])
        for ticket in tickets
    }
    if len(signatures) != TICKET_COUNT:
        raise RuntimeError("Duplicate full ticket definitions detected")

    return {"ticket_count": TICKET_COUNT, "tickets": tickets}


def render_markdown(manifest):
    lines = ["# Tambola Ticket Manifest", ""]
    for ticket in manifest["tickets"]:
        lines.append(f"## Ticket {ticket['ticket_id']:02d}")
        lines.append("")
        for category_name in ("Food Lovers", "Color Mood", "Sakura Vibes", "Japan Vibes"):
            lines.append(f"### {category_name}")
            for entry in ticket[category_name]:
                lines.append(f"- {entry['number']}. {entry['name']}")
            lines.append("")
    return "\n".join(lines).strip() + "\n"


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = build_ticket_manifest()
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    MARKDOWN_PATH.write_text(render_markdown(manifest), encoding="utf-8")
    print(f"Wrote {MANIFEST_PATH}")
    print(f"Wrote {MARKDOWN_PATH}")


if __name__ == "__main__":
    main()
