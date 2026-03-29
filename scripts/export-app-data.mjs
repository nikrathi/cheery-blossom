import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const csvPath = path.join(root, "tambola_ticket_manifest.csv");
const outputPath = path.join(root, "public", "app-data.json");

const excelSequence = [
  10, 16, 58, 79, 53, 57, 65, 12, 17, 36,
  66, 3, 8, 39, 24, 21, 27, 49, 77, 43,
  61, 44, 20, 45, 78, 67, 7, 14, 56, 26,
  31, 74, 47, 75, 70, 63, 55, 72, 35, 23,
  68, 40, 62, 41, 15, 76, 42, 60, 30, 25,
  28, 50, 1, 52, 29, 73, 5, 51, 32, 71,
  13, 9, 48, 11, 19, 80, 69, 64, 59, 38,
  46, 4, 37, 54, 22, 6, 2, 18, 33, 34,
];

const patternBlueprints = [
  {
    id: "sakura-sprint",
    title: "Sakura Sprint",
    description: "Starts with a fast Sakura win, then rolls into Food, Color, Japan, and a delayed full house.",
    source: "Derived from ticket manifest",
    kind: "staged",
    stageOrder: ["Sakura Vibes", "Food Lovers", "Color Mood", "Japan Vibes"],
    winners: {
      "Food Lovers": 21,
      "Sakura Vibes": 4,
      "Color Mood": 1,
      "Japan Vibes": 24,
      "Full House": 9,
    },
  },
  {
    id: "japan-drift",
    title: "Japan Drift",
    description: "Opens with Japan Vibes, keeps the category prizes distinct, and leaves a separate full-house closer.",
    source: "Derived from ticket manifest",
    kind: "staged",
    stageOrder: ["Japan Vibes", "Food Lovers", "Color Mood", "Sakura Vibes"],
    winners: {
      "Food Lovers": 22,
      "Sakura Vibes": 24,
      "Color Mood": 29,
      "Japan Vibes": 18,
      "Full House": 3,
    },
  },
  {
    id: "food-cascade",
    title: "Food Cascade",
    description: "Leads with Food Lovers, then Japan, Sakura, and Color, with all five prize types going to different tickets.",
    source: "Derived from ticket manifest",
    kind: "staged",
    stageOrder: ["Food Lovers", "Japan Vibes", "Sakura Vibes", "Color Mood"],
    winners: {
      "Food Lovers": 15,
      "Sakura Vibes": 19,
      "Color Mood": 9,
      "Japan Vibes": 26,
      "Full House": 28,
    },
  },
];
const sequencesPerBlueprint = 12;

const expectedHeaders = ["Ticket", "Food Lovers", "Sakura Vibes", "Color Mood", "Japan Vibes"];
const categoryOrder = expectedHeaders.slice(1);
const prizeOrder = [...categoryOrder, "Full House"];
const entryPattern = /^\s*(\d+)\.\s+(.+?)\s*$/;
const fourNumberPermutations = buildPermutations([0, 1, 2, 3]);

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
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

function allNumbers(maxNumber) {
  return Array.from({ length: maxNumber }, (_, index) => index + 1);
}

function assertSequenceValidity(sequence, maxNumber, label) {
  if (sequence.length !== maxNumber) {
    throw new Error(`${label} should contain ${maxNumber} numbers, found ${sequence.length}`);
  }
  if (new Set(sequence).size !== sequence.length) {
    throw new Error(`${label} contains duplicate numbers.`);
  }

  const missing = allNumbers(maxNumber).filter((number) => !sequence.includes(number));
  if (missing.length) {
    throw new Error(`${label} is missing numbers: ${missing.join(", ")}`);
  }
}

function buildPermutations(values) {
  if (values.length === 1) {
    return [values];
  }

  const permutations = [];
  values.forEach((value, index) => {
    const remainder = values.filter((_, candidateIndex) => candidateIndex !== index);
    for (const suffix of buildPermutations(remainder)) {
      permutations.push([value, ...suffix]);
    }
  });

  return permutations;
}

function applyPermutation(values, permutation) {
  return permutation.map((index) => values[index]);
}

function decodePermutationIndexes(code, digits, base) {
  const indexes = [];
  let remainder = code;

  for (let index = 0; index < digits; index += 1) {
    indexes.push(remainder % base);
    remainder = Math.floor(remainder / base);
  }

  return indexes;
}

function buildStagedParts(blueprint, ticketsById, baseSequence) {
  const seen = new Set();
  const stageBlocks = [];

  for (const category of blueprint.stageOrder) {
    const ticketId = blueprint.winners[category];
    const ticket = ticketsById.get(ticketId);
    const block = ticket.categories[category].map((entry) => entry.number);
    stageBlocks.push(block);

    for (const entry of ticket.categories[category]) {
      if (!seen.has(entry.number)) {
        seen.add(entry.number);
      }
    }
  }

  const fullHouseTicket = ticketsById.get(blueprint.winners["Full House"]);
  const delayedFullHouseNumbers = fullHouseTicket.entries
    .map((entry) => entry.number)
    .filter((number) => !seen.has(number));

  const trailingNumbers = baseSequence.filter(
    (number) => !seen.has(number) && !delayedFullHouseNumbers.includes(number),
  );

  return {
    stageBlocks,
    leadingTrail: trailingNumbers.slice(0, 20),
    delayedFullHouseNumbers,
    trailingTail: trailingNumbers.slice(20),
  };
}

function composeSequence(parts, blockPermutations) {
  return [
    ...parts.stageBlocks.flatMap((block, index) => applyPermutation(block, blockPermutations[index])),
    ...parts.leadingTrail,
    ...parts.delayedFullHouseNumbers,
    ...parts.trailingTail,
  ];
}

function analyzeSequence(sequence, tickets) {
  const positions = new Map(sequence.map((number, index) => [number, index + 1]));

  const winnersByPrize = {};
  for (const prize of prizeOrder) {
    const timings = tickets.map((ticket) => {
      const entries = prize === "Full House" ? ticket.entries : ticket.categories[prize];
      const callIndex = Math.max(...entries.map((entry) => positions.get(entry.number)));
      return { ticketId: ticket.ticketId, callIndex };
    });

    const winningCall = Math.min(...timings.map((timing) => timing.callIndex));
    const winningTickets = timings
      .filter((timing) => timing.callIndex === winningCall)
      .map((timing) => timing.ticketId);

    winnersByPrize[prize] = {
      winningCall,
      winningTickets,
      unique: winningTickets.length === 1,
    };
  }

  return winnersByPrize;
}

function matchesWinnerProfile(winnersByPrize, blueprint) {
  return prizeOrder.every(
    (prize) =>
      winnersByPrize[prize].unique && winnersByPrize[prize].winningTickets[0] === blueprint.winners[prize],
  );
}

const csvText = await readFile(csvPath, "utf8");
const lines = csvText
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .filter(Boolean);

if (lines.length < 2) {
  throw new Error("CSV does not contain enough rows.");
}

const headers = parseCsvLine(lines[0]);
if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
  throw new Error(`Unexpected CSV headers: ${JSON.stringify(headers)}`);
}

const tickets = [];
const numbers = new Map();
const names = new Map();

for (const line of lines.slice(1)) {
  const values = parseCsvLine(line);
  if (values.length !== expectedHeaders.length) {
    throw new Error(`Unexpected column count in row: ${line}`);
  }

  const row = Object.fromEntries(expectedHeaders.map((header, index) => [header, values[index]]));
  const ticketId = Number.parseInt(row.Ticket, 10);
  if (!Number.isInteger(ticketId)) {
    throw new Error(`Invalid ticket id: ${row.Ticket}`);
  }

  const categories = {};
  const entries = [];
  for (const category of categoryOrder) {
    const parsedEntries = parseEntries(row[category]);
    if (parsedEntries.length !== 4) {
      throw new Error(`Ticket ${ticketId} has ${parsedEntries.length} ${category} entries`);
    }

    const categoryNumbers = new Set();
    const categoryNames = new Set();

    for (const entry of parsedEntries) {
      if (categoryNumbers.has(entry.number)) {
        throw new Error(`Ticket ${ticketId} repeats number ${entry.number} inside ${category}`);
      }
      if (categoryNames.has(entry.name)) {
        throw new Error(`Ticket ${ticketId} repeats name ${entry.name} inside ${category}`);
      }

      categoryNumbers.add(entry.number);
      categoryNames.add(entry.name);

      const existingNumber = numbers.get(entry.number);
      if (existingNumber && existingNumber.name !== entry.name) {
        throw new Error(`Number ${entry.number} maps to both ${existingNumber.name} and ${entry.name}`);
      }

      const existingName = names.get(entry.name);
      if (existingName && existingName.number !== entry.number) {
        throw new Error(`Name ${entry.name} maps to both ${existingName.number} and ${entry.number}`);
      }

      const record = { number: entry.number, name: entry.name, category };
      numbers.set(entry.number, record);
      names.set(entry.name, record);
      entries.push(record);
    }

    categories[category] = parsedEntries.sort((left, right) => left.number - right.number);
  }

  if (entries.length !== 16) {
    throw new Error(`Ticket ${ticketId} does not have 16 entries.`);
  }
  if (new Set(entries.map((entry) => entry.number)).size !== 16) {
    throw new Error(`Ticket ${ticketId} repeats numbers across categories.`);
  }

  tickets.push({
    ticketId,
    categories,
    entries: entries.sort((left, right) => left.number - right.number),
  });
}

const ticketSignatures = new Set(
  tickets.map((ticket) =>
    JSON.stringify(ticket.entries.map((entry) => `${entry.category}:${entry.number}:${entry.name}`)),
  ),
);
if (ticketSignatures.size !== tickets.length) {
  throw new Error("Duplicate full tickets detected in CSV.");
}

const maxNumber = numbers.size;
assertSequenceValidity(excelSequence, maxNumber, "Excel master sequence");

const ticketsById = new Map(tickets.map((ticket) => [ticket.ticketId, ticket]));
const categoryDirectory = Object.fromEntries(
  categoryOrder.map((category) => [
    category,
    [...numbers.values()]
      .filter((entry) => entry.category === category)
      .sort((left, right) => left.number - right.number),
  ]),
);

const permutationBase = fourNumberPermutations.length;
const maxPermutationCodes = permutationBase ** categoryOrder.length;
const seenSequenceSignatures = new Set();
const sequencePool = [];

patternBlueprints.forEach((blueprint, blueprintIndex) => {
  const parts = buildStagedParts(blueprint, ticketsById, excelSequence);
  let builtCount = 0;

  for (let step = 0; step < maxPermutationCodes && builtCount < sequencesPerBlueprint; step += 1) {
    const code = (step * 19 + blueprintIndex * 37) % maxPermutationCodes;
    const permutationIndexes = decodePermutationIndexes(code, categoryOrder.length, permutationBase);
    const blockPermutations = permutationIndexes.map((index) => fourNumberPermutations[index]);
    const sequence = composeSequence(parts, blockPermutations);
    const signature = sequence.join(",");

    if (seenSequenceSignatures.has(signature)) {
      continue;
    }

    assertSequenceValidity(sequence, maxNumber, `${blueprint.title} variation ${builtCount + 1}`);
    const winnersByPrize = analyzeSequence(sequence, tickets);
    if (!matchesWinnerProfile(winnersByPrize, blueprint)) {
      continue;
    }

    seenSequenceSignatures.add(signature);
    sequencePool.push({
      id: `${blueprint.id}-${builtCount + 1}`,
      sequence,
    });
    builtCount += 1;
  }

  if (builtCount < sequencesPerBlueprint) {
    throw new Error(`Only found ${builtCount} valid hidden sequences for ${blueprint.title}.`);
  }
});

const appData = {
  generatedFrom: "tambola_ticket_manifest.csv",
  sequenceDesignSource: "final_tambola_call_sequence.xlsx",
  sequenceMode: "rotating-hidden-stored-orders",
  ticketCount: tickets.length,
  maxNumber,
  categoryOrder,
  tickets: tickets.sort((left, right) => left.ticketId - right.ticketId),
  numberDirectory: [...numbers.values()].sort((left, right) => left.number - right.number),
  categoryDirectory,
  sequencePool,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(appData, null, 2), "utf8");

console.log(`Wrote ${outputPath}`);
