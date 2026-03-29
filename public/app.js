const accessKey = "tambola-host-access-v1";
const pollIntervalMs = 2000;
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
let pollHandle;
let refreshInFlight = false;

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
  await refreshState();
  pollHandle = window.setInterval(() => {
    refreshState().catch((error) => console.error(error));
  }, pollIntervalMs);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshState().catch((error) => console.error(error));
    }
  });
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
  const enteredCode = accessElements.input?.value.trim() || "";
  if (!enteredCode) {
    setAccessFeedback("Enter the access code first.", true);
    return;
  }

  const response = await fetch("/api/tambola/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ accessCode: enteredCode }),
  });

  if (!response.ok) {
    setAccessFeedback("Incorrect access code. Please try again.", true);
    return;
  }

  hostAccessCode = enteredCode;
  sessionStorage.setItem(accessKey, enteredCode);
  if (accessElements.input) {
    accessElements.input.value = "";
  }

  renderAccessState();
  await refreshState();
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

    const response = await fetch("/api/tambola/sequence", {
      headers: {
        "x-tambola-access-code": hostAccessCode,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      hostAccessCode = "";
      sessionStorage.removeItem(accessKey);
      renderAccessState();
      renderAll();
      setAccessFeedback("Host access expired. Enter the code again.", true);
      return;
    }

    const payload = await response.json();
    await copyText(payload.sequence.join(", "));
    setFeedback("Copied the full stored sequence.");
  });

  elements.copyCalledButton.addEventListener("click", async () => {
    const calledText = (currentState?.calledNumbers || [])
      .map((number) => formatEntry(numberDirectory.get(number)))
      .join("\n");
    await copyText(calledText || "No numbers called yet.");
    setFeedback("Copied called numbers list.");
  });
}

async function performAction(action) {
  if (!hostAccessCode) {
    setAccessFeedback("Enter the code to use host controls.", true);
    return;
  }

  const response = await fetch("/api/tambola/action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ action, accessCode: hostAccessCode }),
  });

  if (!response.ok) {
    hostAccessCode = "";
    sessionStorage.removeItem(accessKey);
    renderAccessState();
    renderAll();
    setAccessFeedback("Host access expired. Enter the code again.", true);
    return;
  }

  currentState = await response.json();
  renderAll();
}

async function refreshState() {
  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;
  try {
    const headers = hostAccessCode
      ? { "x-tambola-access-code": hostAccessCode }
      : undefined;
    const response = await fetch("/api/tambola/state", {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Unable to refresh Tambola state.");
    }

    currentState = await response.json();
    renderAll();
  } finally {
    refreshInFlight = false;
  }
}

function hydrateControls() {
  elements.modeLabel.textContent = "Live shared state";
  elements.sequenceSourceLabel.textContent = appData.sequenceDesignSource;
  renderAccessState();
  if (hostAccessCode) {
    setAccessFeedback("Host controls unlocked on this device.");
    return;
  }

  setAccessFeedback("Without the code, this page stays in viewer mode.");
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
  const calledNumbers = currentState?.calledNumbers || [];
  const calledSet = new Set(calledNumbers);
  const currentEntry = currentState?.currentEntry || null;
  const hostUnlocked = Boolean(hostAccessCode);

  elements.calledCount.textContent = `${currentState?.calledCount ?? 0} / ${currentState?.sequenceLength ?? appData.maxNumber}`;
  elements.remainingCount.textContent = String(currentState?.remainingCount ?? appData.maxNumber);
  elements.currentCategory.textContent = currentEntry?.category || "Waiting";
  elements.currentNumber.textContent = currentEntry?.number ?? "--";
  elements.currentName.textContent = currentEntry ? currentEntry.name : "Waiting for the first call";
  elements.currentCallCard.className = `current-call-card ${currentEntry ? categoryClasses[currentEntry.category] : ""}`;

  elements.nextButton.disabled = !hostUnlocked || (currentState?.calledCount ?? 0) >= (currentState?.sequenceLength ?? 0);
  elements.undoButton.disabled = !hostUnlocked || (currentState?.calledCount ?? 0) === 0;
  elements.resetButton.disabled = !hostUnlocked;
  elements.newSequenceButton.disabled = !hostUnlocked;
  elements.copySequenceButton.disabled = !hostUnlocked;

  if ((currentState?.calledCount ?? 0) > 0) {
    const nextLabel = hostUnlocked && currentState?.nextNumber ? ` Next in sequence: ${currentState.nextNumber}.` : "";
    setFeedback(`Position ${currentState.calledCount} of ${currentState.sequenceLength}.${nextLabel}`);
  } else if (hostUnlocked) {
    setFeedback(`Host controls unlocked. Ready to start at position 1 of ${currentState?.sequenceLength ?? appData.maxNumber}.`);
  } else {
    setFeedback("Viewer mode on this device. Current and past calls stay visible, but host controls are locked.");
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
