const STORAGE_KEY = "porous-absorber-efficiency-v1";
const HISTORY_LIMIT = 80;
const THETA_LIMIT_RANDOM = (78 * Math.PI) / 180;
const FREQUENCY_OPTIMIZER = {
  min: 20,
  max: 5000,
  defaultValue: 1000,
};

const CHART_FREQUENCY = {
  min: 20,
  defaultMax: 5000,
  dataMax: 20000,
  samples: 280,
};

const AIR = {
  pressure: 101325,
  gasConstant: 287.05,
};

const AIR_TEMPERATURE = {
  min: -20,
  max: 40,
  defaultValue: 20,
};

const ABSORBER_PRESETS = [
  {
    id: "light-wool",
    label: "Light wool (5k)",
    name: "Light wool",
    flowResistivity: 5000,
  },
  {
    id: "glass-wool",
    label: "Glass wool (8k)",
    name: "Glass wool",
    flowResistivity: 8000,
  },
  {
    id: "mineral-wool",
    label: "Mineral wool (10k)",
    name: "Mineral wool",
    flowResistivity: 10000,
  },
  {
    id: "melamine-foam",
    label: "Melamine foam (12k)",
    name: "Melamine foam",
    flowResistivity: 12000,
  },
  {
    id: "dense-rockwool",
    label: "Dense rockwool (30k)",
    name: "Dense rockwool",
    flowResistivity: 30000,
  },
];

const DEFAULT_ABSORBER_PRESET_ID = "mineral-wool";

const ABSORBER_PRESET_BY_ID = Object.fromEntries(
  ABSORBER_PRESETS.map((preset) => [preset.id, preset]),
);

const CHART_FREQUENCY_TICKS = [
  20,
  31.5,
  63,
  125,
  250,
  500,
  1000,
  2000,
  4000,
  5000,
  8000,
  16000,
];

const CHART_FREQUENCY_TICK_TEXT = [
  "20",
  "31.5",
  "63",
  "125",
  "250",
  "500",
  "1k",
  "2k",
  "4k",
  "5k",
  "8k",
  "16k",
];

const ROOM_MODE_FREQUENCY_MAX = 20000;

const ROOM_DIMENSION_RANGE = {
  min: 0,
  max: 500,
  step: 1,
  fallback: 0,
};

const ROOM_DIMENSIONS = {
  width: {
    label: "Width",
    color: "#3f6f55",
  },
  depth: {
    label: "Depth",
    color: "#b84d37",
  },
  height: {
    label: "Height",
    color: "#4b65a2",
  },
};

const PARAMS = {
  thickness: {
    label: "Absorber thickness",
    shortLabel: "Thickness",
    unit: "mm",
    sliderMin: 50,
    sliderMax: 1000,
    sliderStep: 10,
    fieldMin: 1,
    defaultValue: 100,
  },
  flowResistivity: {
    label: "Flow resistivity",
    shortLabel: "Flow resistivity",
    unit: "Pa.s/m²",
    sliderMin: 1000,
    sliderMax: 35000,
    sliderStep: 1000,
    fieldMin: 1,
    defaultValue: 9000,
  },
  airGap: {
    label: "Air gap",
    shortLabel: "Air gap",
    unit: "mm",
    sliderMin: 0,
    sliderMax: 500,
    sliderStep: 10,
    fieldMin: 0,
    defaultValue: 0,
  },
};

const COLORS = [
  "#116a68",
  "#b84d37",
  "#4b65a2",
  "#8a5a18",
  "#517a32",
  "#8a3d6e",
  "#2d7d9a",
  "#33312f",
  "#3f6f55",
  "#7f4fb0",
];

let state = loadState();
let history = [];
let pendingSnapshot = null;
let plotReady = false;
let chartRevision = 0;

const els = {};

applyThemeAttribute();

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindGlobalControls();
  populateParameterSelect();
  populateAbsorberPresetSelect();
  waitForPlotly();
  render();
});

function cacheElements() {
  els.chart = document.querySelector("#chart");
  els.chartStatus = document.querySelector("#chartStatus");
  els.randomIncidence = document.querySelector("#randomIncidence");
  els.airTemperature = document.querySelector("#airTemperature");
  els.resetAirTemperatureButton = document.querySelector("#resetAirTemperatureButton");
  els.darkMode = document.querySelector("#darkMode");
  els.resetAllButton = document.querySelector("#resetAllButton");
  els.undoButton = document.querySelector("#undoButton");
  els.addAbsorberButton = document.querySelector("#addAbsorberButton");
  els.absorberPreset = document.querySelector("#absorberPreset");
  els.applyToVisibleButton = document.querySelector("#applyToVisibleButton");
  els.copyParameter = document.querySelector("#copyParameter");
  els.copySource = document.querySelector("#copySource");
  els.optimizeFrequencyRange = document.querySelector("#optimizeFrequencyRange");
  els.optimizeFrequencyInput = document.querySelector("#optimizeFrequencyInput");
  els.optimizerLineVisible = document.querySelector("#optimizerLineVisible");
  els.optimizeButtons = document.querySelectorAll("[data-optimize-param]");
  els.roomModeOrder = document.querySelector("#roomModeOrder");
  els.roomDimensionList = document.querySelector("#roomDimensionList");
  els.absorberList = document.querySelector("#absorberList");
  els.absorberCount = document.querySelector("#absorberCount");
}

function bindGlobalControls() {
  els.randomIncidence.addEventListener("change", () => {
    commit(() => {
      state.randomIncidence = els.randomIncidence.checked;
    });
  });

  bindDeferredFieldCommit(els.airTemperature, commitAirTemperatureInput);
  els.resetAirTemperatureButton.addEventListener("click", resetAirTemperature);

  els.darkMode.addEventListener("change", () => {
    state.theme = els.darkMode.checked ? "dark" : "light";
    saveState();
    syncTheme();
    renderChart();
  });

  els.undoButton.addEventListener("click", undo);
  els.resetAllButton.addEventListener("click", resetAllState);

  document.addEventListener("keydown", (event) => {
    const isMacUndo = event.metaKey && event.key.toLowerCase() === "z";
    const isOtherUndo = event.ctrlKey && event.key.toLowerCase() === "z";
    if ((isMacUndo || isOtherUndo) && !event.shiftKey) {
      event.preventDefault();
      undo();
    }
  });

  els.addAbsorberButton.addEventListener("click", () => {
    commit(() => {
      const last = state.absorbers.at(-1);
      const preset =
        ABSORBER_PRESET_BY_ID[state.absorberPresetId] ??
        ABSORBER_PRESET_BY_ID[DEFAULT_ABSORBER_PRESET_ID];
      const usesMaterialPreset = Number.isFinite(preset.flowResistivity);
      const absorberNumber = state.absorbers.length + 1;
      state.absorbers.push(
        createAbsorber({
          name: usesMaterialPreset
            ? `${preset.name} ${absorberNumber}`
            : `Absorber ${absorberNumber}`,
          thickness: last?.thickness ?? PARAMS.thickness.defaultValue,
          flowResistivity: usesMaterialPreset
            ? preset.flowResistivity
            : last?.flowResistivity ?? PARAMS.flowResistivity.defaultValue,
          airGap: last?.airGap ?? PARAMS.airGap.defaultValue,
        }),
      );
    });
  });

  els.absorberPreset.addEventListener("change", () => {
    state.absorberPresetId = normalizeAbsorberPresetId(els.absorberPreset.value);
    saveState();
    syncStaticControls();
  });

  els.copyParameter.addEventListener("change", () => {
    state.copyParameter = els.copyParameter.value;
    saveState();
  });

  els.copySource.addEventListener("change", () => {
    state.copySourceId = els.copySource.value;
    saveState();
  });

  els.applyToVisibleButton.addEventListener("click", () => {
    const parameter = state.copyParameter;
    const source = state.absorbers.find((absorber) => absorber.id === state.copySourceId);
    if (!source || !PARAMS[parameter]) return;
    commit(() => {
      state.absorbers.forEach((absorber) => {
        absorber[parameter] = source[parameter];
      });
    });
  });

  els.optimizeFrequencyRange.addEventListener("pointerdown", () => {
    enableOptimizerLine();
  });

  els.optimizeFrequencyRange.addEventListener("input", (event) => {
    enableOptimizerLine();
    setOptimizeFrequency(frequencyFromSliderPosition(event.target.value));
  });

  bindDeferredFieldCommit(els.optimizeFrequencyInput, commitOptimizeFrequencyInput);

  els.optimizeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      optimizeAbsorbers(button.dataset.optimizeParam);
    });
  });

  els.optimizerLineVisible.addEventListener("change", (event) => {
    state.showOptimizerLine = event.target.checked;
    saveState();
    syncStaticControls();
    renderChart();
  });

  els.roomModeOrder.addEventListener("change", (event) => {
    state.roomModes.order = clampRoomModeOrder(event.target.value);
    saveState();
    syncStaticControls();
    renderChart();
  });
}

function populateParameterSelect() {
  els.copyParameter.innerHTML = Object.entries(PARAMS)
    .map(([key, meta]) => `<option value="${key}">${escapeHtml(meta.shortLabel)}</option>`)
    .join("");
}

function populateAbsorberPresetSelect() {
  els.absorberPreset.innerHTML = ABSORBER_PRESETS.map(
    (preset) => `<option value="${preset.id}">${escapeHtml(preset.label)}</option>`,
  ).join("");
}

function waitForPlotly() {
  if (window.Plotly) {
    plotReady = true;
    renderChart();
    return;
  }

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (window.Plotly) {
      window.clearInterval(timer);
      plotReady = true;
      renderChart();
    } else if (attempts > 80) {
      window.clearInterval(timer);
      els.chartStatus.textContent =
        "Plotly did not load. Check the network connection and reload the page.";
    }
  }, 125);
}

function createDefaultState() {
  return {
    randomIncidence: false,
    airTemperatureC: AIR_TEMPERATURE.defaultValue,
    theme: preferredTheme(),
    absorberPresetId: DEFAULT_ABSORBER_PRESET_ID,
    copyParameter: "thickness",
    copySourceId: null,
    optimizeFrequency: FREQUENCY_OPTIMIZER.defaultValue,
    showOptimizerLine: false,
    roomModes: {
      order: 0,
      dimensions: {
        width: null,
        depth: null,
        height: null,
      },
      visible: {
        width: true,
        depth: true,
        height: true,
      },
    },
    absorbers: [
      createAbsorber({
        name: "Absorber 1",
        thickness: 100,
        flowResistivity: 10000,
        airGap: 0,
      }),
      createAbsorber({
        name: "Absorber 2",
        thickness: 50,
        flowResistivity: 6000,
        airGap: 50,
      }),
    ],
  };
}

function createAbsorber(overrides = {}) {
  return {
    id:
      overrides.id ??
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: overrides.name ?? "Absorber",
    thickness: numberOrDefault(overrides.thickness, PARAMS.thickness.defaultValue),
    flowResistivity: numberOrDefault(
      overrides.flowResistivity,
      PARAMS.flowResistivity.defaultValue,
    ),
    airGap: numberOrDefault(overrides.airGap, PARAMS.airGap.defaultValue),
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeState(createDefaultState());
    return normalizeState(JSON.parse(raw));
  } catch {
    return normalizeState(createDefaultState());
  }
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in strict browser modes; the app remains usable.
  }
}

function normalizeState(candidate) {
  const fallback = createDefaultState();
  const absorbers = Array.isArray(candidate?.absorbers)
    ? candidate.absorbers.map((absorber, index) =>
        createAbsorber({
          id: absorber.id,
          name: typeof absorber.name === "string" && absorber.name.trim()
            ? absorber.name.trim()
            : `Absorber ${index + 1}`,
          thickness: clampToParam("thickness", absorber.thickness),
          flowResistivity: clampToParam("flowResistivity", absorber.flowResistivity),
          airGap: clampToParam("airGap", absorber.airGap),
        }),
      )
    : fallback.absorbers;

  const normalized = {
    randomIncidence: Boolean(candidate?.randomIncidence),
    airTemperatureC: clampAirTemperature(candidate?.airTemperatureC),
    theme: normalizeTheme(candidate?.theme),
    absorberPresetId: normalizeAbsorberPresetId(candidate?.absorberPresetId),
    copyParameter: PARAMS[candidate?.copyParameter] ? candidate.copyParameter : "thickness",
    copySourceId: candidate?.copySourceId ?? absorbers[0]?.id ?? null,
    optimizeFrequency: clampFrequency(candidate?.optimizeFrequency),
    showOptimizerLine: candidate?.showOptimizerLine === true,
    roomModes: normalizeRoomModes(candidate?.roomModes),
    absorbers,
  };

  if (!absorbers.some((absorber) => absorber.id === normalized.copySourceId)) {
    normalized.copySourceId = absorbers[0]?.id ?? null;
  }

  return normalized;
}

function commit(mutator) {
  const snapshot = cloneState(state);
  mutator();
  state = normalizeState(state);
  if (JSON.stringify(snapshot) !== JSON.stringify(state)) {
    pushHistory(snapshot);
    saveState();
    render();
    return true;
  }
  return false;
}

function startPendingChange() {
  if (!pendingSnapshot) {
    pendingSnapshot = cloneState(state);
  }
}

function endPendingChange() {
  if (!pendingSnapshot) return;
  const changed = JSON.stringify(pendingSnapshot) !== JSON.stringify(state);
  if (changed) {
    pushHistory(pendingSnapshot);
  }
  pendingSnapshot = null;
  state = normalizeState(state);
  saveState();
  render();
}

function mutateLive(mutator) {
  startPendingChange();
  mutator();
  state = normalizeState(state);
  saveState();
  syncStaticControls();
  renderChart();
}

function pushHistory(snapshot) {
  history.push(cloneState(snapshot));
  if (history.length > HISTORY_LIMIT) {
    history = history.slice(history.length - HISTORY_LIMIT);
  }
}

function undo() {
  if (!history.length) return;
  pendingSnapshot = null;
  state = normalizeState(history.pop());
  saveState();
  render();
}

function resetAllState() {
  const snapshot = cloneState(state);
  pendingSnapshot = null;
  chartRevision += 1;
  state = normalizeState(createDefaultState());
  if (JSON.stringify(snapshot) !== JSON.stringify(state)) {
    pushHistory(snapshot);
  }
  saveState();
  render();
}

function render() {
  syncTheme();
  syncStaticControls();
  renderCopySourceOptions();
  renderAbsorberList();
  renderChart();
}

function syncStaticControls() {
  els.randomIncidence.checked = state.randomIncidence;
  els.airTemperature.value = formatTemperatureInput(state.airTemperatureC);
  els.darkMode.checked = state.theme === "dark";
  els.undoButton.disabled = history.length === 0;
  els.absorberPreset.value = state.absorberPresetId;
  els.copyParameter.value = state.copyParameter;
  els.optimizeFrequencyRange.value = sliderPositionFromFrequency(state.optimizeFrequency);
  els.optimizeFrequencyInput.value = Math.round(state.optimizeFrequency);
  els.optimizerLineVisible.checked = state.showOptimizerLine;
  els.roomModeOrder.value = String(state.roomModes.order);
}

function syncTheme() {
  applyThemeAttribute();
}

function applyThemeAttribute() {
  if (document.documentElement) {
    document.documentElement.dataset.theme = state.theme;
  }
}

function preferredTheme() {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function normalizeTheme(value) {
  if (value === "dark" || value === "light") return value;
  return preferredTheme();
}

function renderCopySourceOptions() {
  els.copySource.innerHTML = state.absorbers
    .map((absorber) => `<option value="${absorber.id}">${escapeHtml(absorber.name)}</option>`)
    .join("");
  if (!state.absorbers.some((absorber) => absorber.id === state.copySourceId)) {
    state.copySourceId = state.absorbers[0]?.id ?? null;
  }
  els.copySource.value = state.copySourceId ?? "";
  els.copySource.disabled = state.absorbers.length === 0;
  els.copyParameter.disabled = state.absorbers.length === 0;
  els.applyToVisibleButton.disabled = state.absorbers.length === 0;
  els.optimizeButtons.forEach((button) => {
    button.disabled = state.absorbers.length === 0;
  });
}

function bindDeferredFieldCommit(input, callback) {
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    callback(event);
    event.currentTarget.blur();
  });
  input.addEventListener("change", callback);
  input.addEventListener("blur", callback);
}

function setOptimizeFrequency(value) {
  state.optimizeFrequency = clampFrequency(value);
  saveState();
  syncStaticControls();
  renderChart();
}

function commitAirTemperatureInput() {
  if (els.airTemperature.value === "") {
    syncStaticControls();
    return;
  }

  const nextTemperature = clampAirTemperature(els.airTemperature.value);
  state.airTemperatureC = nextTemperature;
  saveState();
  syncStaticControls();
  renderRoomDimensionList();
  renderChart();
}

function resetAirTemperature() {
  commit(() => {
    state.airTemperatureC = AIR_TEMPERATURE.defaultValue;
  });
}

function enableOptimizerLine() {
  if (state.showOptimizerLine) return;
  state.showOptimizerLine = true;
  saveState();
  syncStaticControls();
  renderChart();
}

function commitOptimizeFrequencyInput() {
  if (els.optimizeFrequencyInput.value === "") {
    syncStaticControls();
    return;
  }

  setOptimizeFrequency(els.optimizeFrequencyInput.value);
}

function optimizeAbsorbers(parameter) {
  if (!PARAMS[parameter]) return;

  if (!state.absorbers.length) return;

  const air = airProperties();
  commit(() => {
    state.showOptimizerLine = true;
    state.optimizeFrequency = clampFrequency(els.optimizeFrequencyInput.value);
    state.absorbers.forEach((absorber) => {
      absorber[parameter] = bestSliderValueForAbsorber(
        absorber,
        parameter,
        state.optimizeFrequency,
        state.randomIncidence,
        air,
      );
    });
  });
}

function renderAbsorberList() {
  renderRoomDimensionList();
  els.absorberCount.textContent = `${state.absorbers.length} total`;

  if (!state.absorbers.length) {
    els.absorberList.innerHTML =
      '<div class="empty-state">No absorbers yet. Add one to start plotting.</div>';
    return;
  }

  els.absorberList.innerHTML = state.absorbers
    .map((absorber, index) => renderAbsorberCard(absorber, index))
    .join("");

  state.absorbers.forEach((absorber) => {
    const card = els.absorberList.querySelector(`[data-absorber-id="${absorber.id}"]`);
    bindAbsorberCard(card, absorber.id);
  });
}

function renderRoomDimensionList() {
  els.roomDimensionList.innerHTML = Object.entries(ROOM_DIMENSIONS)
    .map(([key, meta]) => {
      const value = state.roomModes.dimensions[key];
      const isVisible = state.roomModes.visible[key];
      const sliderValue = roomSliderValue(value);
      return `
        <div class="room-dimension-field" data-room-dimension="${key}" data-visible="${isVisible}">
          <button
            class="room-dimension-toggle"
            type="button"
            data-room-toggle="${key}"
            aria-pressed="${isVisible}"
            title="Toggle ${meta.label} room-mode lines"
          >
            <span class="room-swatch" style="background: ${meta.color}" aria-hidden="true"></span>
            <span>${meta.label} (cm)</span>
          </button>
          <span class="room-dimension-controls">
            <input
              type="range"
              min="${ROOM_DIMENSION_RANGE.min}"
              max="${ROOM_DIMENSION_RANGE.max}"
              step="${ROOM_DIMENSION_RANGE.step}"
              value="${sliderValue}"
              data-room-action="range"
              data-room-dimension="${key}"
              aria-label="${meta.label} room dimension in centimeters"
            >
            <input
              type="number"
              step="any"
              value="${value ?? ""}"
              data-room-action="number"
              data-room-dimension="${key}"
              inputmode="numeric"
              aria-label="${meta.label} room dimension value in centimeters"
            >
          </span>
          <div class="room-harmonic-row">
            <div class="room-harmonic-buttons" data-room-harmonics="${key}">
              ${renderRoomHarmonicButtons(value)}
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  els.roomDimensionList
    .querySelectorAll("[data-room-toggle]")
    .forEach((button) => bindRoomDimensionToggle(button));

  els.roomDimensionList
    .querySelectorAll("[data-room-action]")
    .forEach((input) => bindRoomDimensionControl(input));

  els.roomDimensionList
    .querySelectorAll("[data-room-harmonic-frequency]")
    .forEach((button) => bindRoomHarmonicButton(button));
}

function bindRoomDimensionToggle(button) {
  button.addEventListener("click", () => {
    const dimension = button.dataset.roomToggle;
    state.roomModes.visible[dimension] = !state.roomModes.visible[dimension];
    saveState();
    syncRoomDimensionVisibility(dimension);
    renderChart();
  });
}

function bindRoomDimensionControl(input) {
  if (input.dataset.roomAction === "range") {
    input.addEventListener("input", (event) => {
      const dimension = event.target.dataset.roomDimension;
      const value = roomValueFromControl(event.target);
      state.roomModes.dimensions[dimension] = value;
      saveState();
      syncRoomDimensionControl(dimension, value);
      syncRoomHarmonicButtons(dimension);
      renderChart();
    });
    return;
  }

  bindDeferredFieldCommit(input, (event) => {
    const dimension = event.target.dataset.roomDimension;
    const value = roomValueFromControl(event.target);
    state.roomModes.dimensions[dimension] = value;
    saveState();
    syncRoomDimensionControl(dimension, value);
    syncRoomHarmonicButtons(dimension);
    renderChart();
  });
}

function bindRoomHarmonicButton(button) {
  button.addEventListener("click", () => {
    const frequency = Number(button.dataset.roomHarmonicFrequency);
    if (!Number.isFinite(frequency)) return;
    setOptimizerFrequencyFromRoomMode(frequency);
  });
}

function setOptimizerFrequencyFromRoomMode(frequency) {
  state.showOptimizerLine = true;
  state.optimizeFrequency = clampFrequency(frequency);
  saveState();
  syncStaticControls();
  renderChart();
}

function syncRoomDimensionVisibility(dimension) {
  const field = els.roomDimensionList.querySelector(`[data-room-dimension="${dimension}"]`);
  if (!field) return;

  const isVisible = state.roomModes.visible[dimension];
  field.dataset.visible = String(isVisible);
  field.querySelector("[data-room-toggle]").setAttribute("aria-pressed", String(isVisible));
}

function syncRoomDimensionControl(dimension, value) {
  const field = els.roomDimensionList.querySelector(`[data-room-dimension="${dimension}"]`);
  if (!field) return;

  field.querySelectorAll("[data-room-action]").forEach((input) => {
    if (input.dataset.roomAction === "range") {
      input.value = roomSliderValue(value);
    } else {
      input.value = value ?? "";
    }
  });
}

function syncRoomHarmonicButtons(dimension) {
  const container = els.roomDimensionList.querySelector(`[data-room-harmonics="${dimension}"]`);
  if (!container) return;

  container.innerHTML = renderRoomHarmonicButtons(state.roomModes.dimensions[dimension]);
  container
    .querySelectorAll("[data-room-harmonic-frequency]")
    .forEach((button) => bindRoomHarmonicButton(button));
}

function renderRoomHarmonicButtons(lengthCentimeters) {
  const air = airProperties();
  return Array.from({ length: 3 }, (_, index) => {
    const order = index + 1;
    const frequency = lengthCentimeters
      ? roomModeFrequency(lengthCentimeters, order, air)
      : null;
    const hasFrequency = Number.isFinite(frequency);
    const label = hasFrequency ? Math.round(frequency) : order;
    const attributes = hasFrequency
      ? `data-room-harmonic-frequency="${frequency}" title="Set optimizer to ${label} Hz"`
      : 'disabled aria-hidden="true" tabindex="-1"';

    return `
      <button
        class="quiet-button room-harmonic-button${hasFrequency ? "" : " is-hidden"}"
        type="button"
        ${attributes}
      >${label}</button>
    `;
  }).join("");
}

function renderAbsorberCard(absorber, index) {
  const color = COLORS[index % COLORS.length];
  const controls = Object.entries(PARAMS)
    .map(([key, meta]) => {
      const value = absorber[key];
      const sliderValue = sliderValueForParam(key, value);
      return `
        <label class="slider-field" data-param="${key}">
          <span class="slider-label">
            <span>${escapeHtml(meta.label)}</span>
            <strong>${formatNumber(value)} ${escapeHtml(meta.unit)}</strong>
          </span>
          <span class="slider-control-row">
            <input
              type="range"
              min="${meta.sliderMin}"
              max="${meta.sliderMax}"
              step="${meta.sliderStep}"
              value="${sliderValue}"
              data-action="range"
              data-param="${key}"
              aria-label="${escapeHtml(meta.label)}"
            >
            <input
              type="number"
              step="any"
              value="${value}"
              data-action="number"
              data-param="${key}"
              aria-label="${escapeHtml(meta.label)} value"
            >
          </span>
        </label>
      `;
    })
    .join("");

  return `
    <article class="absorber-card" data-absorber-id="${absorber.id}">
      <header class="absorber-header">
        <span class="trace-swatch" style="background: ${color}" aria-hidden="true"></span>
        <div class="absorber-title-row">
          <input type="text" value="${escapeHtml(absorber.name)}" data-action="name" aria-label="Absorber name">
        </div>
        <div class="absorber-actions">
          <button class="quiet-button" type="button" data-action="duplicate">Duplicate</button>
          <button class="danger-button" type="button" data-action="remove">Remove</button>
        </div>
      </header>
      <div class="absorber-body">
        ${controls}
      </div>
    </article>
  `;
}

function bindAbsorberCard(card, absorberId) {
  const nameInput = card.querySelector('[data-action="name"]');
  bindDeferredFieldCommit(nameInput, (event) => {
    commit(() => {
      findAbsorber(absorberId).name = event.target.value;
    });
  });

  card.querySelector('[data-action="duplicate"]').addEventListener("click", () => {
    commit(() => {
      const index = state.absorbers.findIndex((absorber) => absorber.id === absorberId);
      const absorber = state.absorbers[index];
      state.absorbers.splice(
        index + 1,
        0,
        createAbsorber({
          ...absorber,
          id: undefined,
          name: `${absorber.name} copy`,
        }),
      );
    });
  });

  card.querySelector('[data-action="remove"]').addEventListener("click", () => {
    commit(() => {
      state.absorbers = state.absorbers.filter((absorber) => absorber.id !== absorberId);
    });
  });

  card.querySelectorAll('[data-action="range"]').forEach((input) => {
    input.addEventListener("pointerdown", startPendingChange);
    input.addEventListener("focus", startPendingChange);
    input.addEventListener("input", (event) => {
      const parameter = event.target.dataset.param;
      const value = valueFromControl(parameter, event.target);
      if (value === null) return;
      mutateLive(() => {
        findAbsorber(absorberId)[parameter] = value;
      });
      syncCardParameter(card, parameter, value);
    });
    input.addEventListener("change", endPendingChange);
    input.addEventListener("pointerup", endPendingChange);
    input.addEventListener("blur", endPendingChange);
  });

  card.querySelectorAll('[data-action="number"]').forEach((input) => {
    bindDeferredFieldCommit(input, (event) => {
      const parameter = event.target.dataset.param;
      const value = valueFromControl(parameter, event.target);
      if (value === null) {
        syncCardParameter(card, parameter, findAbsorber(absorberId)[parameter]);
        return;
      }

      commit(() => {
        findAbsorber(absorberId)[parameter] = value;
      });
    });
  });
}

function syncCardParameter(card, parameter, value) {
  const meta = PARAMS[parameter];
  const field = card.querySelector(`[data-param="${parameter}"]`);
  if (!field) return;
  field.querySelector("strong").textContent = `${formatNumber(value)} ${meta.unit}`;
  field.querySelectorAll("input").forEach((input) => {
    const nextValue =
      input.dataset.action === "range" ? sliderValueForParam(parameter, value) : value;
    if (Number(input.value) !== nextValue) {
      input.value = nextValue;
    }
  });
}

function renderChart() {
  if (!els.chart || !plotReady) return;

  if (!state.absorbers.length) {
    window.Plotly.react(els.chart, [], chartLayout("No absorbers"), chartConfig());
    els.chartStatus.textContent = "No absorbers.";
    return;
  }

  const air = airProperties();
  const frequencies = logSpace(
    CHART_FREQUENCY.min,
    CHART_FREQUENCY.dataMax,
    CHART_FREQUENCY.samples,
  );
  const traces = state.absorbers.map((absorber) => {
    const absorption = frequencies.map((frequency) =>
      absorptionCoefficient(frequency, absorber, state.randomIncidence, air),
    );
    return {
      x: frequencies,
      y: absorption,
      type: "scatter",
      mode: "lines",
      name: absorber.name,
      line: {
        color: COLORS[state.absorbers.indexOf(absorber) % COLORS.length],
        width: 3,
      },
      hovertemplate:
        "<b>%{fullData.name}</b><br>%{x:.0f} Hz<br>efficiency %{y:.3f}<extra></extra>",
    };
  });

  els.chartStatus.textContent = state.randomIncidence
    ? "Diffuse-field estimate, integrated to 78 deg incidence."
    : "Normal-incidence estimate.";

  window.Plotly.react(els.chart, traces, chartLayout(), chartConfig());
}

function chartLayout(emptyTitle = "") {
  const theme = chartTheme();
  return {
    title: emptyTitle
      ? { text: emptyTitle, x: 0.5, font: { size: 18, color: theme.muted } }
      : undefined,
    autosize: true,
    margin: { l: 62, r: 22, t: 22, b: 58 },
    paper_bgcolor: "rgba(255,255,255,0)",
    plot_bgcolor: theme.chartBg,
    font: { color: theme.ink },
    hovermode: "x unified",
    showlegend: true,
    legend: {
      orientation: "h",
      x: 0,
      y: 1.09,
      bgcolor: theme.legendBg,
      bordercolor: theme.line,
      borderwidth: 1,
      font: { size: 12, color: theme.ink },
    },
    xaxis: {
      title: "Frequency (Hz)",
      type: "log",
      range: [
        Math.log10(CHART_FREQUENCY.min),
        Math.log10(CHART_FREQUENCY.defaultMax),
      ],
      tickvals: CHART_FREQUENCY_TICKS,
      ticktext: CHART_FREQUENCY_TICK_TEXT,
      gridcolor: theme.grid,
      zeroline: false,
    },
    yaxis: {
      title: "Efficiency / absorption coefficient",
      range: [0, 1.05],
      fixedrange: false,
      gridcolor: theme.grid,
      zeroline: false,
    },
    shapes: chartOverlayShapes(),
    uirevision: `absorber-efficiency-lab-${chartRevision}`,
  };
}

function chartTheme() {
  if (typeof getComputedStyle !== "function") {
    return {
      ink: "#17211d",
      muted: "#60706a",
      line: "#d8ded7",
      grid: "#e5eae4",
      chartBg: "#fbfcfb",
      legendBg: "rgba(255,255,255,0.78)",
    };
  }

  const styles = getComputedStyle(document.documentElement);
  return {
    ink: styles.getPropertyValue("--ink").trim(),
    muted: styles.getPropertyValue("--muted").trim(),
    line: styles.getPropertyValue("--line").trim(),
    grid: styles.getPropertyValue("--grid").trim(),
    chartBg: styles.getPropertyValue("--chart-bg").trim(),
    legendBg: styles.getPropertyValue("--legend-bg").trim(),
  };
}

function chartConfig() {
  return {
    responsive: true,
    scrollZoom: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
  };
}

function absorptionCoefficient(frequency, absorber, randomIncidence, air = airProperties()) {
  if (!randomIncidence) {
    return clamp01(absorptionAtAngle(frequency, absorber, 0, air));
  }

  const samples = 36;
  const dTheta = THETA_LIMIT_RANDOM / samples;
  let weighted = 0;
  let totalWeight = 0;

  for (let index = 0; index < samples; index += 1) {
    const theta = (index + 0.5) * dTheta;
    const weight = 2 * Math.sin(theta) * Math.cos(theta) * dTheta;
    weighted += absorptionAtAngle(frequency, absorber, theta, air) * weight;
    totalWeight += weight;
  }

  return clamp01(weighted / totalWeight);
}

function absorptionAtAngle(frequency, absorber, theta, air) {
  const omega = 2 * Math.PI * frequency;
  const z0 = air.density * air.speed;
  const k0 = omega / air.speed;
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.max(Math.cos(theta), 1e-5);

  const { zc, kc } = allardChampouxLayer(frequency, absorber.flowResistivity, air);
  const transverse = k0 * sinTheta;
  const kxPorous = keepForwardRoot(csqrt(csub(cmul(kc, kc), c(transverse * transverse))));
  const znPorous = cdiv(cmul(zc, kc), kxPorous);
  const porousMatrix = layerMatrix(
    kxPorous,
    znPorous,
    absorber.thickness / 1000,
  );

  const airGapMeters = absorber.airGap / 1000;
  const airMatrix =
    airGapMeters > 0
      ? layerMatrix(c(k0 * cosTheta), c(z0 / cosTheta), airGapMeters)
      : identityMatrix();

  const totalMatrix = multiplyMatrices(porousMatrix, airMatrix);
  const surfaceImpedance = cdiv(totalMatrix.a, totalMatrix.c);
  const incidentImpedance = c(z0 / cosTheta);
  const reflection = cdiv(
    csub(surfaceImpedance, incidentImpedance),
    cadd(surfaceImpedance, incidentImpedance),
  );

  return 1 - cabs2(reflection);
}

function allardChampouxLayer(frequency, flowResistivity, air) {
  const x = Math.max((air.density * frequency) / flowResistivity, 1e-9);
  const z0 = air.density * air.speed;
  const k0 = (2 * Math.PI * frequency) / air.speed;

  return {
    zc: c(
      z0 * (1 + 0.0571 * x ** -0.754),
      z0 * (-0.087 * x ** -0.732),
    ),
    kc: c(
      k0 * (1 + 0.0978 * x ** -0.7),
      k0 * (-0.189 * x ** -0.595),
    ),
  };
}

function layerMatrix(kx, impedance, depth) {
  if (depth <= 0) return identityMatrix();
  const phase = cmul(kx, c(depth));
  const cosPhase = ccos(phase);
  const sinPhase = csin(phase);
  const jSin = cmul(c(0, 1), sinPhase);
  return {
    a: cosPhase,
    b: cmul(cmul(c(0, 1), impedance), sinPhase),
    c: cdiv(jSin, impedance),
    d: cosPhase,
  };
}

function identityMatrix() {
  return {
    a: c(1),
    b: c(0),
    c: c(0),
    d: c(1),
  };
}

function multiplyMatrices(left, right) {
  return {
    a: cadd(cmul(left.a, right.a), cmul(left.b, right.c)),
    b: cadd(cmul(left.a, right.b), cmul(left.b, right.d)),
    c: cadd(cmul(left.c, right.a), cmul(left.d, right.c)),
    d: cadd(cmul(left.c, right.b), cmul(left.d, right.d)),
  };
}

function keepForwardRoot(value) {
  if (value.re < 0 || value.im > 0) {
    return c(-value.re, -value.im);
  }
  return value;
}

function findAbsorber(absorberId) {
  return state.absorbers.find((absorber) => absorber.id === absorberId);
}

function logSpace(min, max, count) {
  const start = Math.log10(min);
  const end = Math.log10(max);
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    return 10 ** (start + (end - start) * ratio);
  });
}

function clampToParam(parameter, value) {
  const meta = PARAMS[parameter];
  const number = numberOrDefault(value, meta.defaultValue);
  return Math.max(meta.fieldMin, number);
}

function valueFromControl(parameter, input) {
  if (input.dataset.action === "range") {
    return sliderValueForParam(parameter, input.value);
  }

  if (input.value === "") {
    return null;
  }

  const number = Number(input.value);
  if (!Number.isFinite(number)) {
    return null;
  }

  return clampToParam(parameter, number);
}

function airProperties() {
  const kelvin = state.airTemperatureC + 273.15;
  return {
    density: AIR.pressure / (AIR.gasConstant * kelvin),
    speed: 331.3 * Math.sqrt(kelvin / 273.15),
  };
}

function clampAirTemperature(value) {
  const number = numberOrDefault(value, AIR_TEMPERATURE.defaultValue);
  return Math.round(
    Math.min(AIR_TEMPERATURE.max, Math.max(AIR_TEMPERATURE.min, number)),
  );
}

function formatTemperatureInput(value) {
  return String(Math.round(Number(value)));
}

function normalizeAbsorberPresetId(value) {
  return ABSORBER_PRESET_BY_ID[value] ? value : DEFAULT_ABSORBER_PRESET_ID;
}

function sliderValueForParam(parameter, value) {
  const meta = PARAMS[parameter];
  const number = numberOrDefault(value, meta.defaultValue);
  const bounded = Math.min(meta.sliderMax, Math.max(meta.sliderMin, number));
  return roundToStep(bounded, meta.sliderStep);
}

function bestSliderValueForAbsorber(absorber, parameter, frequency, randomIncidence, air) {
  const currentValue = absorber[parameter];
  let bestValue = sliderValueForParam(parameter, currentValue);
  let bestScore = -Infinity;

  sliderValuesForParam(parameter).forEach((value) => {
    const trial = { ...absorber, [parameter]: value };
    const score = absorptionCoefficient(frequency, trial, randomIncidence, air);
    const isBetter = score > bestScore + 1e-9;
    const isTieCloser =
      Math.abs(score - bestScore) <= 1e-9 &&
      Math.abs(value - currentValue) < Math.abs(bestValue - currentValue);

    if (isBetter || isTieCloser) {
      bestScore = score;
      bestValue = value;
    }
  });

  return bestValue;
}

function sliderValuesForParam(parameter) {
  const meta = PARAMS[parameter];
  const values = [];
  const steps = Math.round((meta.sliderMax - meta.sliderMin) / meta.sliderStep);

  for (let index = 0; index <= steps; index += 1) {
    values.push(roundToStep(meta.sliderMin + index * meta.sliderStep, meta.sliderStep));
  }

  return values;
}

function clampFrequency(value) {
  const number = numberOrDefault(value, FREQUENCY_OPTIMIZER.defaultValue);
  return Math.round(
    Math.min(FREQUENCY_OPTIMIZER.max, Math.max(FREQUENCY_OPTIMIZER.min, number)),
  );
}

function frequencyFromSliderPosition(value) {
  const ratio = Math.min(1, Math.max(0, numberOrDefault(value, 0)));
  const minLog = Math.log(FREQUENCY_OPTIMIZER.min);
  const maxLog = Math.log(FREQUENCY_OPTIMIZER.max);
  return clampFrequency(Math.exp(minLog + ratio * (maxLog - minLog)));
}

function sliderPositionFromFrequency(value) {
  const frequency = clampFrequency(value);
  const minLog = Math.log(FREQUENCY_OPTIMIZER.min);
  const maxLog = Math.log(FREQUENCY_OPTIMIZER.max);
  return (Math.log(frequency) - minLog) / (maxLog - minLog);
}

function normalizeRoomModes(candidate) {
  const dimensions = candidate?.dimensions ?? {};
  const visible = candidate?.visible ?? {};
  return {
    order: clampRoomModeOrder(candidate?.order),
    dimensions: {
      width: normalizeRoomDimension(dimensions.width, true),
      depth: normalizeRoomDimension(dimensions.depth, true),
      height: normalizeRoomDimension(dimensions.height, true),
    },
    visible: {
      width: visible.width !== false,
      depth: visible.depth !== false,
      height: visible.height !== false,
    },
  };
}

function clampRoomModeOrder(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(3, Math.max(0, Math.round(number)));
}

function normalizeRoomDimension(value, migrateMillimeters = false) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const centimeters = migrateMillimeters && number > 1000 ? number / 10 : number;
  return centimeters;
}

function roomValueFromControl(input) {
  if (input.dataset.roomAction === "range") {
    const value = roomSliderValue(input.value);
    return value > 0 ? value : null;
  }

  return normalizeRoomDimension(input.value);
}

function roomSliderValue(value) {
  const number = numberOrDefault(value, ROOM_DIMENSION_RANGE.fallback);
  const bounded = Math.min(
    ROOM_DIMENSION_RANGE.max,
    Math.max(ROOM_DIMENSION_RANGE.min, number),
  );
  return roundToStep(bounded, ROOM_DIMENSION_RANGE.step);
}

function chartOverlayShapes() {
  return [state.showOptimizerLine ? optimizerLineShape() : null, ...roomModeLineShapes()].filter(
    Boolean,
  );
}

function optimizerLineShape() {
  return {
    type: "line",
    xref: "x",
    yref: "paper",
    x0: state.optimizeFrequency,
    x1: state.optimizeFrequency,
    y0: 0,
    y1: 1,
    line: {
      color: chartTheme().ink,
      width: 1.5,
      dash: "dash",
    },
  };
}

function roomModeLineShapes() {
  const order = state.roomModes.order;
  if (order === 0) return [];

  const air = airProperties();
  return Object.entries(ROOM_DIMENSIONS).flatMap(([dimension, meta]) => {
    const lengthCentimeters = state.roomModes.dimensions[dimension];
    if (!lengthCentimeters || !state.roomModes.visible[dimension]) return [];

    return Array.from({ length: order }, (_, index) => {
      const modeOrder = index + 1;
      const frequency = roomModeFrequency(lengthCentimeters, modeOrder, air);
      if (frequency < CHART_FREQUENCY.min || frequency > ROOM_MODE_FREQUENCY_MAX) return null;

      return {
        type: "line",
        xref: "x",
        yref: "paper",
        x0: frequency,
        x1: frequency,
        y0: 0,
        y1: 1 / (modeOrder + 1),
        line: {
          color: meta.color,
          width: 2.25,
          dash: "solid",
        },
      };
    }).filter(Boolean);
  });
}

function roomModeFrequency(lengthCentimeters, order, air) {
  const lengthMeters = lengthCentimeters / 100;
  return (order * air.speed) / (2 * lengthMeters);
}

function roundToStep(value, step) {
  if (!step || step >= 1) return Math.round(value / step) * step;
  const precision = Math.ceil(Math.abs(Math.log10(step)));
  return Number((Math.round(value / step) * step).toFixed(precision));
}

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function c(re, im = 0) {
  return { re, im };
}

function cadd(a, b) {
  return c(a.re + b.re, a.im + b.im);
}

function csub(a, b) {
  return c(a.re - b.re, a.im - b.im);
}

function cmul(a, b) {
  return c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

function cdiv(a, b) {
  const denominator = b.re * b.re + b.im * b.im;
  if (denominator < 1e-28) return c(1e12, 0);
  return c(
    (a.re * b.re + a.im * b.im) / denominator,
    (a.im * b.re - a.re * b.im) / denominator,
  );
}

function cabs2(a) {
  return a.re * a.re + a.im * a.im;
}

function csqrt(a) {
  const magnitude = Math.hypot(a.re, a.im);
  const real = Math.sqrt(Math.max((magnitude + a.re) / 2, 0));
  const imaginarySign = a.im < 0 ? -1 : 1;
  const imaginary = imaginarySign * Math.sqrt(Math.max((magnitude - a.re) / 2, 0));
  return c(real, imaginary);
}

function csin(a) {
  return c(
    Math.sin(a.re) * Math.cosh(a.im),
    Math.cos(a.re) * Math.sinh(a.im),
  );
}

function ccos(a) {
  return c(
    Math.cos(a.re) * Math.cosh(a.im),
    -Math.sin(a.re) * Math.sinh(a.im),
  );
}
