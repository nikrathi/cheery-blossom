const storageKey = "tambola-caller-state-v5";
const categoryClasses = {
  "Food Lovers": "category-food",
  "Sakura Vibes": "category-sakura",
  "Color Mood": "category-color",
  "Japan Vibes": "category-japan",
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

const appData = await fetch("./app-data.json", { cache: "no-store" }).then((response) => {
  if (!response.ok) {
    throw new Error("Unable to load app data.");
  }
  return response.json();
});

if (!Array.isArray(appData.sequencePool) || !appData.sequencePool.length) {
  throw new Error("No hidden sequence pool was found.");
}

const numberDirectory = new Map(appData.numberDirectory.map((entry) => [entry.number, entry]));
const sequencePool = appData.sequencePool.map((entry) => [...entry.sequence]);

let state = loadState();
hydrateControls();
renderAll();

elements.nextButton.addEventListener("click", () => {
  const activeSequence = getActiveSequence();
  if (state.currentIndex >= activeSequence.length - 1) {
    setFeedback("All numbers in the stored caller order have already been called.", true);
    return;
  }

  state.currentIndex += 1;
  saveState();
  renderAll();
});

elements.newSequenceButton.addEventListener("click", () => {
  if (sequencePool.length < 2) {
    setFeedback("Only one hidden sequence is available right now.", true);
    return;
  }

  const { nextIndex, restartedCycle } = chooseNextSequenceIndex();
  state.sequenceIndex = nextIndex;
  state.currentIndex = -1;
  state.usedSequenceIndices = restartedCycle ? [nextIndex] : [...state.usedSequenceIndices, nextIndex];
  saveState();
  renderAll();

  if (restartedCycle) {
    setFeedback("Loaded a fresh hidden sequence. All stored orders were used once, so a new rotation has started.");
    return;
  }

  setFeedback("Loaded a new hidden sequence and reset the board.");
});

elements.undoButton.addEventListener("click", () => {
  if (state.currentIndex < 0) {
    return;
  }

  state.currentIndex -= 1;
  saveState();
  renderAll();
});

elements.resetButton.addEventListener("click", () => {
  state.currentIndex = -1;
  saveState();
  renderAll();
  setFeedback("Caller reset. The stored sequence will restart from the first number.");
});

elements.copySequenceButton.addEventListener("click", async () => {
  const activeSequence = getActiveSequence();
  await copyText(activeSequence.join(", "));
  setFeedback("Copied the full stored sequence.");
});

elements.copyCalledButton.addEventListener("click", async () => {
  const calledText = getCalledNumbers()
    .map((number) => formatEntry(numberDirectory.get(number)))
    .join("\n");
  await copyText(calledText || "No numbers called yet.");
  setFeedback("Copied called numbers list.");
});

function loadState() {
  const defaults = { currentIndex: -1, sequenceIndex: 0, usedSequenceIndices: [0] };

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw);
    const sequenceIndex = Number.isInteger(parsed.sequenceIndex)
      ? Math.min(Math.max(parsed.sequenceIndex, 0), sequencePool.length - 1)
      : 0;
    const activeSequence = sequencePool[sequenceIndex];
    const currentIndex = Number.isInteger(parsed.currentIndex)
      ? Math.min(Math.max(parsed.currentIndex, -1), activeSequence.length - 1)
      : -1;
    const usedSequenceIndices = Array.isArray(parsed.usedSequenceIndices)
      ? [...new Set(parsed.usedSequenceIndices.filter((index) => Number.isInteger(index) && index >= 0 && index < sequencePool.length))]
      : [];

    if (!usedSequenceIndices.includes(sequenceIndex)) {
      usedSequenceIndices.push(sequenceIndex);
    }

    return {
      currentIndex,
      sequenceIndex,
      usedSequenceIndices: usedSequenceIndices.length ? usedSequenceIndices : [sequenceIndex],
    };
  } catch {
    return defaults;
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function hydrateControls() {
  elements.modeLabel.textContent = "Stored order";
  elements.sequenceSourceLabel.textContent = appData.sequenceDesignSource;
}

function getActiveSequence() {
  return sequencePool[state.sequenceIndex];
}

function getCalledNumbers() {
  const activeSequence = getActiveSequence();
  return activeSequence.slice(0, state.currentIndex + 1);
}

function chooseNextSequenceIndex() {
  const unseenIndexes = sequencePool
    .map((_, index) => index)
    .filter((index) => !state.usedSequenceIndices.includes(index));

  if (unseenIndexes.length) {
    return {
      nextIndex: unseenIndexes[Math.floor(Math.random() * unseenIndexes.length)],
      restartedCycle: false,
    };
  }

  const freshCycleIndexes = sequencePool
    .map((_, index) => index)
    .filter((index) => index !== state.sequenceIndex);

  return {
    nextIndex: freshCycleIndexes[Math.floor(Math.random() * freshCycleIndexes.length)],
    restartedCycle: true,
  };
}

function renderAll() {
  const activeSequence = getActiveSequence();
  const calledNumbers = getCalledNumbers();
  const calledSet = new Set(calledNumbers);
  const currentNumber = state.currentIndex >= 0 ? activeSequence[state.currentIndex] : null;
  const currentEntry = currentNumber ? numberDirectory.get(currentNumber) : null;

  elements.calledCount.textContent = `${calledNumbers.length} / ${activeSequence.length}`;
  elements.remainingCount.textContent = String(activeSequence.length - calledNumbers.length);
  elements.currentCategory.textContent = currentEntry?.category || "Waiting";
  elements.currentNumber.textContent = currentEntry?.number ?? "--";
  elements.currentName.textContent = currentEntry ? currentEntry.name : "Press Next Number to begin";
  elements.currentCallCard.className = `current-call-card ${currentEntry ? categoryClasses[currentEntry.category] : ""}`;
  elements.nextButton.disabled = state.currentIndex >= activeSequence.length - 1;
  elements.undoButton.disabled = state.currentIndex < 0;

  if (state.currentIndex >= 0) {
    const nextNumber = activeSequence[state.currentIndex + 1];
    const nextLabel = nextNumber ? ` Next in sequence: ${nextNumber}.` : " Sequence complete.";
    setFeedback(`Using the private stored order. Position ${state.currentIndex + 1} of ${activeSequence.length}.${nextLabel}`);
  } else {
    setFeedback(`Using the private stored order derived from ${appData.sequenceDesignSource}. Ready to start at position 1 of ${activeSequence.length}.`);
  }

  renderCalledByCategory(calledSet);
  renderBoard(calledSet);
  renderHistory(calledNumbers);
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
