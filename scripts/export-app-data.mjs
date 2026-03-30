import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const csvPath = path.join(root, "tambola_ticket_manifest.csv");
const outputPath = path.join(root, "public", "app-data.json");

const expectedHeaders = ["Ticket", "Food Lovers", "Sakura Vibes", "Color Mood", "Japan Vibes"];
const categoryOrder = expectedHeaders.slice(1);
const prizeOrder = [...categoryOrder, "Full House"];
const entryPattern = /^\s*(\d+)\.\s+(.+?)\s*$/;

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseEntries(cell) {
  return cell
    .split("|")
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map((piece) => {
      const match = piece.match(entryPattern);
      if (!match) {
        throw new Error(`Malformed entry: ${piece}`);
      }

      return {
        number: Number.parseInt(match[1], 10),
        name: match[2].trim(),
      };
    });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const csvText = await readFile(csvPath, "utf8");
const lines = csvText
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .filter(Boolean);

assert(lines.length >= 2, "CSV does not contain enough rows.");

const headers = parseCsvLine(lines[0]);
assert(JSON.stringify(headers) === JSON.stringify(expectedHeaders), `Unexpected CSV headers: ${JSON.stringify(headers)}`);

const tickets = [];
const numbersByValue = new Map();
const numbersByName = new Map();

for (const line of lines.slice(1)) {
  const values = parseCsvLine(line);
  assert(values.length === expectedHeaders.length, `Unexpected column count in row: ${line}`);

  const row = Object.fromEntries(expectedHeaders.map((header, index) => [header, values[index]]));
  const ticketId = Number.parseInt(row.Ticket, 10);
  assert(Number.isInteger(ticketId), `Invalid ticket id: ${row.Ticket}`);

  const categories = {};
  const entries = [];

  for (const category of categoryOrder) {
    const parsedEntries = parseEntries(row[category]);
    assert(parsedEntries.length === 4, `Ticket ${ticketId} has ${parsedEntries.length} ${category} entries`);

    const categoryNumbers = new Set();
    const categoryNames = new Set();

    for (const entry of parsedEntries) {
      assert(!categoryNumbers.has(entry.number), `Ticket ${ticketId} repeats number ${entry.number} inside ${category}`);
      assert(!categoryNames.has(entry.name), `Ticket ${ticketId} repeats name ${entry.name} inside ${category}`);

      categoryNumbers.add(entry.number);
      categoryNames.add(entry.name);

      const record = { number: entry.number, name: entry.name, category };
      const existingNumber = numbersByValue.get(entry.number);
      const existingName = numbersByName.get(entry.name);

      if (existingNumber) {
        assert(existingNumber.name === entry.name, `Number ${entry.number} maps to both ${existingNumber.name} and ${entry.name}`);
        assert(existingNumber.category === category, `Number ${entry.number} appears in multiple categories.`);
      }

      if (existingName) {
        assert(existingName.number === entry.number, `Name ${entry.name} maps to both ${existingName.number} and ${entry.number}`);
        assert(existingName.category === category, `Name ${entry.name} appears in multiple categories.`);
      }

      numbersByValue.set(entry.number, record);
      numbersByName.set(entry.name, record);
      entries.push(record);
    }

    categories[category] = parsedEntries
      .map((entry) => ({ ...entry, category }))
      .sort((left, right) => left.number - right.number);
  }

  assert(entries.length === 16, `Ticket ${ticketId} does not have 16 entries.`);
  assert(new Set(entries.map((entry) => entry.number)).size === 16, `Ticket ${ticketId} repeats numbers across categories.`);

  tickets.push({
    ticketId,
    categories,
    entries: entries.sort((left, right) => left.number - right.number),
  });
}

const ticketSignatures = new Set(
  tickets.map((ticket) => JSON.stringify(ticket.entries.map((entry) => `${entry.category}:${entry.number}:${entry.name}`))),
);
assert(ticketSignatures.size === tickets.length, "Duplicate full tickets detected in CSV.");

const maxNumber = numbersByValue.size;
assert(maxNumber === 80, `Expected 80 unique numbers, found ${maxNumber}.`);

const allNumbers = Array.from({ length: maxNumber }, (_, index) => index + 1);
const missingNumbers = allNumbers.filter((number) => !numbersByValue.has(number));
assert(missingNumbers.length === 0, `Missing numbers from directory: ${missingNumbers.join(", ")}`);

const categoryDirectory = Object.fromEntries(
  categoryOrder.map((category) => [
    category,
    [...numbersByValue.values()]
      .filter((entry) => entry.category === category)
      .sort((left, right) => left.number - right.number),
  ]),
);

const appData = {
  generatedFrom: "tambola_ticket_manifest.csv",
  sequenceDesignSource: "Validated random search over tambola_ticket_manifest.csv",
  sequenceMode: "validated-random-search",
  ticketCount: tickets.length,
  maxNumber,
  categoryOrder,
  prizeOrder,
  winnerPolicy: {
    uniquePrizeWinner: true,
    distinctWinningTickets: true,
  },
  tickets: tickets.sort((left, right) => left.ticketId - right.ticketId),
  numberDirectory: [...numbersByValue.values()].sort((left, right) => left.number - right.number),
  categoryDirectory,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(appData, null, 2), "utf8");

console.log(`Wrote ${outputPath}`);
