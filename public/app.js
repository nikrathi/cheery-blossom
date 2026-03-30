const accessKey = "tambola-host-access-v1";
const stateKey = "tambola-local-game-v2";
const accessCode = "awesome";
const categoryClasses = {
  "Food Lovers": "category-food",
  "Sakura Vibes": "category-sakura",
  "Color Mood": "category-color",
  "Japan Vibes": "category-japan",
};

const accessElements = {
  form: document.querySelector("#access-form"),
  input: document.querySelector("#access-code"),
  feedback: document.querySelector("#access-feedback"),
  unlockedRow: document.querySelector("#host-unlocked-row"),
  lockButton: document.querySelector("#lock-controls-button"),
};

const elements = {
  modeLabel: document.querySelector("#mode-label"),
  calledCount: document.querySelector("#called-count"),
  remainingCount: document.querySelector("#remaining-count"),
  currentCallCard: document.querySelector("#current-call-card"),
  currentCategory: document.querySelector("#current-category"),
  currentNumber: document.querySelector("#current-number"),
  currentName: document.querySelector("#current-name"),
  nextButton: document.querySelector("#next-button"),
  newSequenceButton: document.querySelector("#new-sequence-button"),
  undoButton: document.querySelector("#undo-button"),
  resetButton: document.querySelector("#reset-button"),
  copySequenceButton: document.querySelector("#copy-sequence-button"),
  copyCalledButton: document.querySelector("#copy-called-button"),
  sequenceFeedback: document.querySelector("#sequence-feedback"),
  sequenceSourceLabel: document.querySelector("#sequence-source-label"),
  calledByCategory: document.querySelector("#called-by-category"),
  numberBoard: document.querySelector("#number-board"),
  historyList: document.querySelector("#history-list"),
};

let appData;
let numberDirectory;
let currentState;
let hostAccessCode = sessionStorage.getItem(accessKey) || "";
let busy = false;

if (elements.modeLabel) {
  initializeTambola().catch((error) => {
    console.error(error);
    setAccessFeedback("Unable to load the Tambola board right now.", true);
  });
}

async function initializeTambola() {
  appData = await fetch("./app-data.json", { cache: "no-store" }).then((response) => {
    if (!response.ok) {
      throw new Error("Unable to load app data.");
    }
    return response.json();
  });

  numberDirectory = new Map(appData.numberDirectory.map((entry) => [entry.number, entry]));
  bindAccessEvents();
  bindAppEvents();
  hydrateControls();
  await loadOrCreateState();
  renderAll();
}

function bindAccessEvents() {
  accessElements.form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await unlockHostControls();
  });

  accessElements.lockButton?.addEventListener("click", () => {
    hostAccessCode = "";
    sessionStorage.removeItem(accessKey);
    renderAccessState();
    renderAll();
    setAccessFeedback("Host controls locked on this device.");
  });
}

async function unlockHostControls() {
  const enteredCode = accessElements.input?.value.trim().toLowerCase() || "";
  if (!enteredCode) {
    setAccessFeedback("Enter the access code first.", true);
    return;
  }

  if (enteredCode !== accessCode) {
    setAccessFeedback("Incorrect access code. Please try again.", true);
    return;
  }

  hostAccessCode = enteredCode;
  sessionStorage.setItem(accessKey, enteredCode);
  if (accessElements.input) {
    accessElements.input.value = "";
  }

  renderAccessState();
  renderAll();
  setAccessFeedback("Host controls unlocked on this device.");
}

function bindAppEvents() {
  elements.nextButton.addEventListener("click", async () => {
    await performAction("next");
  });

  elements.newSequenceButton.addEventListener("click", async () => {
    await performAction("new-sequence");
  });

  elements.undoButton.addEventListener("click", async () => {
    await performAction("undo");
  });

  elements.resetButton.addEventListener("click", async () => {
    await performAction("reset");
  });

  elements.copySequenceButton.addEventListener("click", async () => {
    if (!hostAccessCode) {
      setAccessFeedback("Enter the code to reveal the full sequence.", true);
      return;
    }

    await copyText((currentState?.sequence || []).join(", "));
    setFeedback("Copied the full validated random sequence.");
  });

  elements.copyCalledButton.addEventListener("click", async () => {
    const calledText = getViewState().calledNumbers
      .map((number) => formatEntry(numberDirectory.get(number)))
      .join("\n");
    await copyText(calledText || "No numbers called yet.");
    setFeedback("Copied called numbers list.");
  });
}

async function loadOrCreateState() {
  const savedState = readSavedState();
  if (isValidState(savedState)) {
    currentState = savedState;
    return;
  }

  await createNewGame();
}

function readSavedState() {
  try {
    const raw = localStorage.getItem(stateKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isValidState(candidate) {
  if (!candidate || !Array.isArray(candidate.sequence)) {
    return false;
  }

  if (candidate.sequence.length !== appData.maxNumber) {
    return false;
  }

  if (new Set(candidate.sequence).size !== candidate.sequence.length) {
    return false;
  }

  const currentIndex = Number.isInteger(candidate.currentIndex) ? candidate.currentIndex : -1;
  if (currentIndex < -1 || currentIndex >= candidate.sequence.length) {
    return false;
  }

  const expectedNumbers = new Set(appData.numberDirectory.map((entry) => entry.number));
  if (candidate.sequence.some((number) => !expectedNumbers.has(number))) {
    return false;
  }

  return matchesWinnerPolicy(analyzeSequence(candidate.sequence));
}

function persistState() {
  localStorage.setItem(stateKey, JSON.stringify(currentState));
}

async function performAction(action) {
  if (busy) {
    return;
  }

  if (!hostAccessCode) {
    setAccessFeedback("Enter the code to use host controls.", true);
    return;
  }

  busy = true;
  renderAll();
  try {
    switch (action) {
      case "next":
        if (currentState.currentIndex < currentState.sequence.length - 1) {
          currentState.currentIndex += 1;
        }
        break;
      case "undo":
        if (currentState.currentIndex > -1) {
          currentState.currentIndex -= 1;
        }
        break;
      case "reset":
        currentState.currentIndex = -1;
        break;
      case "new-sequence":
        await createNewGame();
        break;
      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    if (action !== "new-sequence") {
      currentState.updatedAt = new Date().toISOString();
      persistState();
    }
  } finally {
    busy = false;
    renderAll();
  }
}

async function createNewGame() {
  setFeedback("Searching for a validated random order...");
  const nextState = await generateValidatedState();
  currentState = nextState;
  persistState();
}

async function generateValidatedState() {
  const availableNumbers = appData.numberDirectory.map((entry) => entry.number);
  let attempts = 0;

  while (attempts < 10000) {
    attempts += 1;
    const sequence = shuffle([...availableNumbers]);
    const winnersByPrize = analyzeSequence(sequence);

    if (matchesWinnerPolicy(winnersByPrize)) {
      return {
        sequence,
        currentIndex: -1,
        searchAttempts: attempts,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    if (attempts % 250 === 0) {
      await nextFrame();
    }
  }

  throw new Error("Unable to find a valid random order after many attempts.");
}

function analyzeSequence(sequence) {
  const positions = new Map(sequence.map((number, index) => [number, index + 1]));
  const winnersByPrize = {};

  for (const prize of appData.prizeOrder) {
    const timings = appData.tickets.map((ticket) => {
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
    };
  }

  return winnersByPrize;
}

function matchesWinnerPolicy(winnersByPrize) {
  const winnerIds = [];

  for (const prize of appData.prizeOrder) {
    const winners = winnersByPrize[prize]?.winningTickets || [];
    if (appData.winnerPolicy?.uniquePrizeWinner && winners.length !== 1) {
      return false;
    }
    winnerIds.push(winners[0]);
  }

  if (appData.winnerPolicy?.distinctWinningTickets) {
    return new Set(winnerIds).size === winnerIds.length;
  }

  return true;
}

function shuffle(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function randomInt(maxExclusive) {
  if (window.crypto?.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function getViewState() {
  const sequence = currentState?.sequence || [];
  const currentIndex = currentState?.currentIndex ?? -1;
  const calledNumbers = sequence.slice(0, currentIndex + 1);
  const currentNumber = currentIndex >= 0 ? sequence[currentIndex] : null;
  const currentEntry = currentNumber ? numberDirectory.get(currentNumber) : null;
  const nextNumber = currentIndex < sequence.length - 1 ? sequence[currentIndex + 1] : null;

  return {
    sequence,
    currentIndex,
    calledNumbers,
    calledCount: calledNumbers.length,
    remainingCount: Math.max(sequence.length - calledNumbers.length, 0),
    sequenceLength: sequence.length,
    currentEntry,
    nextNumber,
  };
}

function hydrateControls() {
  elements.modeLabel.textContent = "Validated random order";
  elements.sequenceSourceLabel.textContent = "random search with one earliest winner per prize";
  renderAccessState();

  if (hostAccessCode) {
    setAccessFeedback("Host controls unlocked on this device.");
    return;
  }

  setAccessFeedback("Without the code, this page stays in viewer mode on this device.");
}

function renderAccessState() {
  const hostUnlocked = Boolean(hostAccessCode);
  if (accessElements.form) {
    accessElements.form.hidden = hostUnlocked;
  }
  if (accessElements.unlockedRow) {
    accessElements.unlockedRow.hidden = !hostUnlocked;
  }
}

function setAccessFeedback(message, isError = false) {
  if (!accessElements.feedback) {
    return;
  }

  accessElements.feedback.textContent = message;
  accessElements.feedback.classList.toggle("error", isError);
}

function renderAll() {
  const view = getViewState();
  const calledSet = new Set(view.calledNumbers);
  const currentEntry = view.currentEntry || null;
  const hostUnlocked = Boolean(hostAccessCode);

  elements.calledCount.textContent = `${view.calledCount} / ${view.sequenceLength || appData.maxNumber}`;
  elements.remainingCount.textContent = String(view.remainingCount ?? appData.maxNumber);
  elements.currentCategory.textContent = currentEntry?.category || "Waiting";
  elements.currentNumber.textContent = currentEntry?.number ?? "--";
  elements.currentName.textContent = currentEntry ? currentEntry.name : "Waiting for the first call";
  elements.currentCallCard.className = `current-call-card ${currentEntry ? categoryClasses[currentEntry.category] : ""}`;

  elements.nextButton.disabled = busy || !hostUnlocked || view.calledCount >= view.sequenceLength;
  elements.undoButton.disabled = busy || !hostUnlocked || view.calledCount === 0;
  elements.resetButton.disabled = busy || !hostUnlocked;
  elements.newSequenceButton.disabled = busy || !hostUnlocked;
  elements.copySequenceButton.disabled = !hostUnlocked || !view.sequenceLength;

  if (busy) {
    setFeedback("Searching for a validated random order...");
  } else if (view.calledCount > 0) {
    const nextLabel = hostUnlocked && view.nextNumber ? ` Next in sequence: ${view.nextNumber}.` : "";
    setFeedback(`Position ${view.calledCount} of ${view.sequenceLength}.${nextLabel}`);
  } else if (hostUnlocked) {
    const attemptText = currentState?.searchAttempts ? ` Found in ${currentState.searchAttempts} attempt${currentState.searchAttempts === 1 ? "" : "s"}.` : "";
    setFeedback(`Validated random order ready.${attemptText} Each prize has one earliest winner and all five prize winners are different tickets.`);
  } else {
    setFeedback("Viewer mode on this device. Unlock with the code to call numbers or generate a fresh validated random order.");
  }

  renderCalledByCategory(calledSet);
  renderBoard(calledSet);
  renderHistory(view.calledNumbers);
}

function renderCalledByCategory(calledSet) {
  const grouped = {};
  for (const category of appData.categoryOrder) {
    grouped[category] = appData.categoryDirectory[category].filter((entry) => calledSet.has(entry.number));
  }

  elements.calledByCategory.innerHTML = appData.categoryOrder
    .map((category) => {
      const items = grouped[category];
      const list = items.length
        ? `<ul>${items
            .map((entry) => `<li><strong>${entry.number}</strong><span>${entry.name}</span></li>`)
            .join("")}</ul>`
        : `<p>No numbers called yet.</p>`;
      return `
        <article class="category-card ${categoryClasses[category]}">
          <h3>${category}</h3>
          <p>${items.length} called</p>
          ${list}
        </article>
      `;
    })
    .join("");
}

function renderBoard(calledSet) {
  elements.numberBoard.innerHTML = appData.numberDirectory
    .map((entry) => {
      const categoryClass = categoryClasses[entry.category];
      const calledClass = calledSet.has(entry.number) ? "is-called" : "";
      return `
        <article class="number-tile ${categoryClass} ${calledClass}">
          <span class="number-tile-number">${entry.number}</span>
          <span class="number-tile-name">${entry.name}</span>
        </article>
      `;
    })
    .join("");
}

function renderHistory(calledNumbers) {
  const latest = [...calledNumbers]
    .reverse()
    .map((number) => numberDirectory.get(number))
    .filter(Boolean);

  if (!latest.length) {
    elements.historyList.innerHTML = `<li><span>No numbers called yet.</span></li>`;
    return;
  }

  elements.historyList.innerHTML = latest
    .map(
      (entry, index) => `
        <li>
          <div>
            <strong>${entry.number}</strong> ${entry.name}
          </div>
          <div class="history-meta">
            <div>${entry.category}</div>
            <small>#${calledNumbers.length - index}</small>
          </div>
        </li>
      `,
    )
    .join("");
}

function formatEntry(entry) {
  return `${entry.number}. ${entry.name} (${entry.category})`;
}

function setFeedback(message, isError = false) {
  elements.sequenceFeedback.innerHTML = message;
  elements.sequenceFeedback.classList.toggle("error", isError);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}
