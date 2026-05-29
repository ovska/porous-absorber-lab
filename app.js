const STORAGE_KEY = "porous-absorber-efficiency-v1";
const HISTORY_LIMIT = 80;
const THETA_LIMIT_RANDOM = (78 * Math.PI) / 180;
const FREQUENCY_OPTIMIZER = {
  min: 20,
  max: 16000,
  defaultValue: 1000,
};

const AIR = {
  density: 1.2041,
  speed: 343.2,
};

const ROOM_DIMENSION_RANGE = {
  min: 200,
  max: 500,
  step: 1,
  fallback: 300,
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
    unit: "Pa.s/m^2",
    sliderMin: 5000,
    sliderMax: 25000,
    sliderStep: 1000,
    fieldMin: 1,
    defaultValue: 10000,
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
  "#aa6c2d",
  "#3f6f55",
  "#7f4fb0",
];

let state = loadState();
let history = [];
let pendingSnapshot = null;
let plotReady = false;

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindGlobalControls();
  populateParameterSelect();
  waitForPlotly();
  render();
});

function cacheElements() {
  els.chart = document.querySelector("#chart");
  els.chartStatus = document.querySelector("#chartStatus");
  els.randomIncidence = document.querySelector("#randomIncidence");
  els.undoButton = document.querySelector("#undoButton");
  els.addAbsorberButton = document.querySelector("#addAbsorberButton");
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

  els.undoButton.addEventListener("click", undo);

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
      state.absorbers.push(
        createAbsorber({
          name: `Absorber ${state.absorbers.length + 1}`,
          thickness: last?.thickness ?? PARAMS.thickness.defaultValue,
          flowResistivity:
            last?.flowResistivity ?? PARAMS.flowResistivity.defaultValue,
          airGap: last?.airGap ?? PARAMS.airGap.defaultValue,
        }),
      );
    });
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
        if (absorber.visible) {
          absorber[parameter] = source[parameter];
        }
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

  els.optimizeFrequencyInput.addEventListener("input", (event) => {
    if (event.target.value === "") return;
    setOptimizeFrequencyIfValid(event.target.value);
  });

  els.optimizeFrequencyInput.addEventListener("change", (event) => {
    setOptimizeFrequency(event.target.value);
  });

  els.optimizeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      optimizeVisibleAbsorbers(button.dataset.optimizeParam);
    });
  });

  els.optimizerLineVisible.addEventListener("change", (event) => {
    state.showOptimizerLine = event.target.value === "true";
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
    visible: overrides.visible ?? true,
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
          visible: absorber.visible !== false,
        }),
      )
    : fallback.absorbers;

  const normalized = {
    randomIncidence: Boolean(candidate?.randomIncidence),
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

function render() {
  syncStaticControls();
  renderCopySourceOptions();
  renderAbsorberList();
  renderChart();
}

function syncStaticControls() {
  els.randomIncidence.checked = state.randomIncidence;
  els.undoButton.disabled = history.length === 0;
  els.copyParameter.value = state.copyParameter;
  els.optimizeFrequencyRange.value = sliderPositionFromFrequency(state.optimizeFrequency);
  els.optimizeFrequencyInput.value = Math.round(state.optimizeFrequency);
  els.optimizerLineVisible.value = String(state.showOptimizerLine);
  els.roomModeOrder.value = String(state.roomModes.order);
}

function renderCopySourceOptions() {
  els.copySource.innerHTML = state.absorbers
    .map((absorber) => `<option value="${absorber.id}">${escapeHtml(absorber.name)}</option>`)
    .join("");
  if (!state.absorbers.some((absorber) => absorber.id === state.copySourceId)) {
    state.copySourceId = state.absorbers[0]?.id ?? null;
  }
  els.copySource.value = state.copySourceId ?? "";
  const hasVisible = state.absorbers.some((absorber) => absorber.visible);
  els.copySource.disabled = state.absorbers.length === 0;
  els.copyParameter.disabled = state.absorbers.length === 0;
  els.applyToVisibleButton.disabled = !hasVisible || state.absorbers.length === 0;
  els.optimizeButtons.forEach((button) => {
    button.disabled = !hasVisible || state.absorbers.length === 0;
  });
}

function setOptimizeFrequency(value) {
  state.optimizeFrequency = clampFrequency(value);
  saveState();
  syncStaticControls();
  renderChart();
}

function setOptimizeFrequencyIfValid(value) {
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < FREQUENCY_OPTIMIZER.min ||
    number > FREQUENCY_OPTIMIZER.max
  ) {
    return;
  }

  state.optimizeFrequency = clampFrequency(number);
  els.optimizeFrequencyInput.value = state.optimizeFrequency;
  els.optimizeFrequencyRange.value = sliderPositionFromFrequency(state.optimizeFrequency);
  saveState();
  renderChart();
}

function enableOptimizerLine() {
  if (state.showOptimizerLine) return;
  state.showOptimizerLine = true;
  saveState();
  syncStaticControls();
  renderChart();
}

function optimizeVisibleAbsorbers(parameter) {
  if (!PARAMS[parameter]) return;

  const visibleAbsorbers = state.absorbers.filter((absorber) => absorber.visible);
  if (!visibleAbsorbers.length) return;

  commit(() => {
    state.showOptimizerLine = true;
    state.optimizeFrequency = clampFrequency(els.optimizeFrequencyInput.value);
    state.absorbers.forEach((absorber) => {
      if (absorber.visible) {
        absorber[parameter] = bestSliderValueForAbsorber(
          absorber,
          parameter,
          state.optimizeFrequency,
          state.randomIncidence,
        );
      }
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
              min="${ROOM_DIMENSION_RANGE.min}"
              max="${ROOM_DIMENSION_RANGE.max}"
              step="${ROOM_DIMENSION_RANGE.step}"
              value="${value ?? ""}"
              data-room-action="number"
              data-room-dimension="${key}"
              inputmode="numeric"
              aria-label="${meta.label} room dimension value in centimeters"
            >
          </span>
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
  input.addEventListener("input", (event) => {
    const dimension = event.target.dataset.roomDimension;
    const value = roomValueFromControl(event.target);
    state.roomModes.dimensions[dimension] = value;
    saveState();
    syncRoomDimensionControl(dimension, value);
    renderChart();
  });

  input.addEventListener("change", (event) => {
    const dimension = event.target.dataset.roomDimension;
    const value = roomValueFromControl(event.target);
    state.roomModes.dimensions[dimension] = value;
    saveState();
    syncRoomDimensionControl(dimension, value);
    renderChart();
  });
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
              min="${meta.fieldMin}"
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
    <article class="absorber-card" data-absorber-id="${absorber.id}" data-visible="${absorber.visible}">
      <header class="absorber-header">
        <span class="trace-swatch" style="background: ${color}" aria-hidden="true"></span>
        <div class="absorber-title-row">
          <input type="text" value="${escapeHtml(absorber.name)}" data-action="name" aria-label="Absorber name">
          <label class="visible-check">
            <input type="checkbox" data-action="visible" ${absorber.visible ? "checked" : ""}>
            <span>Visible</span>
          </label>
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
  card.querySelector('[data-action="name"]').addEventListener("input", (event) => {
    mutateLive(() => {
      findAbsorber(absorberId).name = event.target.value;
    });
    renderCopySourceOptions();
  });
  card.querySelector('[data-action="name"]').addEventListener("change", endPendingChange);
  card.querySelector('[data-action="name"]').addEventListener("blur", endPendingChange);

  card.querySelector('[data-action="visible"]').addEventListener("change", (event) => {
    commit(() => {
      findAbsorber(absorberId).visible = event.target.checked;
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

  card.querySelectorAll('[data-action="range"], [data-action="number"]').forEach((input) => {
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

  const visibleAbsorbers = state.absorbers.filter((absorber) => absorber.visible);
  if (!visibleAbsorbers.length) {
    window.Plotly.react(els.chart, [], chartLayout("No visible absorbers"), chartConfig());
    els.chartStatus.textContent = "No visible absorbers.";
    return;
  }

  const frequencies = logSpace(20, 20000, 280);
  const traces = visibleAbsorbers.map((absorber, index) => {
    const absorption = frequencies.map((frequency) =>
      absorptionCoefficient(frequency, absorber, state.randomIncidence),
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
  return {
    title: emptyTitle
      ? { text: emptyTitle, x: 0.5, font: { size: 18, color: "#60706a" } }
      : undefined,
    autosize: true,
    margin: { l: 62, r: 22, t: 22, b: 58 },
    paper_bgcolor: "rgba(255,255,255,0)",
    plot_bgcolor: "#fbfcfb",
    hovermode: "x unified",
    showlegend: true,
    legend: {
      orientation: "h",
      x: 0,
      y: 1.09,
      bgcolor: "rgba(255,255,255,0.78)",
      bordercolor: "#d8ded7",
      borderwidth: 1,
      font: { size: 12 },
    },
    xaxis: {
      title: "Frequency (Hz)",
      type: "log",
      range: [Math.log10(20), Math.log10(20000)],
      tickvals: [20, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
      ticktext: ["20", "31.5", "63", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"],
      gridcolor: "#e5eae4",
      zeroline: false,
    },
    yaxis: {
      title: "Efficiency / absorption coefficient",
      range: [0, 1.05],
      fixedrange: false,
      gridcolor: "#e5eae4",
      zeroline: false,
    },
    shapes: chartOverlayShapes(),
    uirevision: "absorber-efficiency-lab",
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

function absorptionCoefficient(frequency, absorber, randomIncidence) {
  if (!randomIncidence) {
    return clamp01(absorptionAtAngle(frequency, absorber, 0));
  }

  const samples = 36;
  const dTheta = THETA_LIMIT_RANDOM / samples;
  let weighted = 0;
  let totalWeight = 0;

  for (let index = 0; index < samples; index += 1) {
    const theta = (index + 0.5) * dTheta;
    const weight = 2 * Math.sin(theta) * Math.cos(theta) * dTheta;
    weighted += absorptionAtAngle(frequency, absorber, theta) * weight;
    totalWeight += weight;
  }

  return clamp01(weighted / totalWeight);
}

function absorptionAtAngle(frequency, absorber, theta) {
  const omega = 2 * Math.PI * frequency;
  const z0 = AIR.density * AIR.speed;
  const k0 = omega / AIR.speed;
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.max(Math.cos(theta), 1e-5);

  const { zc, kc } = allardChampouxLayer(frequency, absorber.flowResistivity);
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

function allardChampouxLayer(frequency, flowResistivity) {
  const x = Math.max((AIR.density * frequency) / flowResistivity, 1e-9);
  const z0 = AIR.density * AIR.speed;
  const k0 = (2 * Math.PI * frequency) / AIR.speed;

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

function sliderValueForParam(parameter, value) {
  const meta = PARAMS[parameter];
  const number = numberOrDefault(value, meta.defaultValue);
  const bounded = Math.min(meta.sliderMax, Math.max(meta.sliderMin, number));
  return roundToStep(bounded, meta.sliderStep);
}

function bestSliderValueForAbsorber(absorber, parameter, frequency, randomIncidence) {
  const currentValue = absorber[parameter];
  let bestValue = sliderValueForParam(parameter, currentValue);
  let bestScore = -Infinity;

  sliderValuesForParam(parameter).forEach((value) => {
    const trial = { ...absorber, [parameter]: value };
    const score = absorptionCoefficient(frequency, trial, randomIncidence);
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
  const stepped = roundToStep(centimeters, ROOM_DIMENSION_RANGE.step);
  return Math.min(ROOM_DIMENSION_RANGE.max, Math.max(ROOM_DIMENSION_RANGE.min, stepped));
}

function roomValueFromControl(input) {
  if (input.dataset.roomAction === "range") {
    return roomSliderValue(input.value);
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
      color: "#17211d",
      width: 1.5,
      dash: "dash",
    },
  };
}

function roomModeLineShapes() {
  const order = state.roomModes.order;
  if (order === 0) return [];

  return Object.entries(ROOM_DIMENSIONS).flatMap(([dimension, meta]) => {
    const lengthCentimeters = state.roomModes.dimensions[dimension];
    if (!lengthCentimeters || !state.roomModes.visible[dimension]) return [];

    return Array.from({ length: order }, (_, index) => {
      const modeOrder = index + 1;
      const frequency = roomModeFrequency(lengthCentimeters, modeOrder);
      if (frequency < 20 || frequency > 20000) return null;

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

function roomModeFrequency(lengthCentimeters, order) {
  const lengthMeters = lengthCentimeters / 100;
  return (order * AIR.speed) / (2 * lengthMeters);
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
