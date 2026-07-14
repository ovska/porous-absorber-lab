const STORAGE_KEY = "back-wall-sbir-lab-v1";
const ABSORBER_LAB_STORAGE_KEY = "porous-absorber-efficiency-v1";

const AIR = {
  pressure: 101325,
  gasConstant: 287.05,
  temperatureC: 20,
};

const CHART = {
  minFrequency: 20,
  maxFrequency: 5000,
  samples: 1400,
  minDb: -36,
  maxDb: 8,
};

const PARAMS = {
  cabinetDepth: {
    defaultValue: 350,
    unit: "mm",
  },
  rearDistance: {
    defaultValue: 300,
    unit: "mm",
  },
  flowResistivity: {
    defaultValue: 10000,
    unit: "Pa·s/m²",
  },
  absorberDepth: {
    defaultValue: 100,
    unit: "mm",
  },
  airGap: {
    defaultValue: 0,
    unit: "mm",
  },
};

const FREQUENCY_TICKS = [20, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 5000];
const FREQUENCY_TICK_TEXT = ["20", "31.5", "63", "125", "250", "500", "1k", "2k", "4k", "5k"];

let state = loadState();
let plotReady = false;
let chartRevision = 0;
let renderFrame = null;

const els = {};

applyThemeAttribute();

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindControls();
  syncControls();
  waitForPlotly();
});

function cacheElements() {
  els.chart = document.querySelector("#chart");
  els.chartStatus = document.querySelector("#chartStatus");
  els.effectiveDistance = document.querySelector("#effectiveDistance");
  els.darkMode = document.querySelector("#darkMode");
  els.resetAllButton = document.querySelector("#resetAllButton");
  els.absorberLabButton = document.querySelector("#absorberLabButton");

  Object.keys(PARAMS).forEach((parameter) => {
    els[parameter] = document.querySelector(`#${parameter}`);
    els[`${parameter}Value`] = document.querySelector(`#${parameter}Value`);
  });
}

function bindControls() {
  Object.keys(PARAMS).forEach((parameter) => {
    els[parameter].addEventListener("input", (event) => {
      state[parameter] = Number(event.target.value);
      saveState();
      syncControls();
      scheduleChartRender();
    });
  });

  els.darkMode.addEventListener("change", () => {
    state.theme = els.darkMode.checked ? "dark" : "light";
    saveState();
    saveSharedTheme();
    applyThemeAttribute();
    renderChart();
  });

  els.resetAllButton.addEventListener("click", () => {
    const theme = state.theme;
    state = createDefaultState();
    state.theme = theme;
    chartRevision += 1;
    saveState();
    syncControls();
    renderChart();
  });

  els.absorberLabButton.addEventListener("click", () => {
    window.location.href = "./index.html";
  });
}

function createDefaultState() {
  return {
    cabinetDepth: PARAMS.cabinetDepth.defaultValue,
    rearDistance: PARAMS.rearDistance.defaultValue,
    flowResistivity: PARAMS.flowResistivity.defaultValue,
    absorberDepth: PARAMS.absorberDepth.defaultValue,
    airGap: PARAMS.airGap.defaultValue,
    theme: sharedTheme() ?? preferredTheme(),
  };
}

function loadState() {
  const fallback = createDefaultState();

  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (!stored || typeof stored !== "object") return fallback;

    Object.keys(PARAMS).forEach((parameter) => {
      const value = Number(stored[parameter]);
      if (Number.isFinite(value)) fallback[parameter] = value;
    });

    fallback.theme = normalizeTheme(stored.theme);
  } catch {
    // The defaults keep the calculator usable when storage is unavailable.
  }

  return fallback;
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in strict browser modes.
  }
}

function sharedTheme() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(ABSORBER_LAB_STORAGE_KEY));
    return stored?.theme === "dark" || stored?.theme === "light" ? stored.theme : null;
  } catch {
    return null;
  }
}

function saveSharedTheme() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(ABSORBER_LAB_STORAGE_KEY));
    if (!stored || typeof stored !== "object") return;
    stored.theme = state.theme;
    window.localStorage.setItem(ABSORBER_LAB_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Theme synchronization is optional.
  }
}

function preferredTheme() {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function normalizeTheme(value) {
  if (value === "dark" || value === "light") return value;
  return sharedTheme() ?? preferredTheme();
}

function applyThemeAttribute() {
  if (document.documentElement) {
    document.documentElement.dataset.theme = state.theme;
  }
}

function syncControls() {
  Object.entries(PARAMS).forEach(([parameter, meta]) => {
    const input = els[parameter];
    const value = clampToInput(input, state[parameter]);
    state[parameter] = value;
    input.value = value;
    els[`${parameter}Value`].textContent = `${formatNumber(value)} ${meta.unit}`;
  });

  els.darkMode.checked = state.theme === "dark";
  els.effectiveDistance.textContent = `${formatDistance(driverToSurfaceDistance())} driver to absorber face`;
}

function clampToInput(input, value) {
  const min = Number(input.min);
  const max = Number(input.max);
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function scheduleChartRender() {
  if (renderFrame !== null) return;
  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = null;
    renderChart();
  });
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

function renderChart() {
  if (!plotReady || !els.chart) return;

  const frequencies = logSpace(
    CHART.minFrequency,
    CHART.maxFrequency,
    CHART.samples,
  );
  const results = frequencies.map(responseAtFrequency);
  const nulls = findResponseNulls(frequencies, results).slice(0, 6);
  const theme = chartTheme();

  const traces = [
    {
      x: frequencies,
      y: results.map((result) => displayDb(result.responseDb)),
      type: "scatter",
      mode: "lines",
      name: "Result at listener",
      line: {
        color: theme.response,
        width: 3,
      },
      customdata: results.map((result) => [
        result.responseDb,
        result.reflectionDb,
        result.absorptionPercent,
      ]),
      hovertemplate:
        "<b>Result at listener</b><br>%{x:.0f} Hz<br>%{customdata[0]:.1f} dB<br>reflection %{customdata[1]:.1f} dB<br>surface absorption %{customdata[2]:.0f}%<extra></extra>",
    },
    {
      x: frequencies,
      y: results.map((result) => displayDb(result.reflectionDb)),
      type: "scatter",
      mode: "lines",
      name: "Back-wall reflection",
      line: {
        color: theme.reflection,
        width: 2,
        dash: "dot",
      },
      customdata: results.map((result) => result.absorptionPercent),
      hovertemplate:
        "<b>Back-wall reflection</b><br>%{x:.0f} Hz<br>%{y:.1f} dB<br>surface absorption %{customdata:.0f}%<extra></extra>",
    },
    {
      x: nulls.map((entry) => entry.frequency),
      y: nulls.map((entry) => Math.max(CHART.minDb + 0.7, displayDb(entry.responseDb))),
      type: "scatter",
      mode: "markers",
      name: "Modeled nulls",
      showlegend: false,
      marker: {
        color: theme.ink,
        size: 9,
        symbol: "x",
      },
      customdata: nulls.map((entry) => [entry.responseDb, entry.reflectionDb]),
      hovertemplate:
        "<b>Modeled null</b><br>%{x:.0f} Hz<br>%{customdata[0]:.1f} dB<br>reflection %{customdata[1]:.1f} dB<extra></extra>",
    },
  ];

  window.Plotly.react(els.chart, traces, chartLayout(theme), chartConfig());

  els.chartStatus.textContent = nulls.length
    ? `Modeled nulls: ${nulls.map((entry) => formatFrequency(entry.frequency)).join(" · ")}`
    : "No modeled SBIR nulls between 20 Hz and 5 kHz.";
}

function chartLayout(theme) {
  const compactTicks = window.innerWidth <= 640;

  return {
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
      range: [Math.log10(CHART.minFrequency), Math.log10(CHART.maxFrequency)],
      tickvals: compactTicks
        ? [20, 63, 125, 250, 500, 1000, 2000, 5000]
        : FREQUENCY_TICKS,
      ticktext: compactTicks
        ? ["20", "63", "125", "250", "500", "1k", "2k", "5k"]
        : FREQUENCY_TICK_TEXT,
      gridcolor: theme.grid,
      zeroline: false,
    },
    yaxis: {
      title: "Level relative to flat direct sound (dB)",
      range: [CHART.minDb, CHART.maxDb],
      dtick: 6,
      gridcolor: theme.grid,
      zeroline: true,
      zerolinecolor: theme.lineStrong,
      zerolinewidth: 1.5,
    },
    uirevision: `back-wall-sbir-lab-${chartRevision}`,
  };
}

function chartTheme() {
  const styles = getComputedStyle(document.documentElement);
  const isDark = document.documentElement.dataset.theme === "dark";

  return {
    ink: styles.getPropertyValue("--ink").trim(),
    line: styles.getPropertyValue("--line").trim(),
    lineStrong: styles.getPropertyValue("--line-strong").trim(),
    grid: styles.getPropertyValue("--grid").trim(),
    chartBg: styles.getPropertyValue("--chart-bg").trim(),
    legendBg: styles.getPropertyValue("--legend-bg").trim(),
    response: isDark ? "#4fb7b2" : "#116a68",
    reflection: isDark ? "#ef9e80" : "#b84d37",
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

function responseAtFrequency(frequency) {
  const air = airProperties();
  const reflection = surfaceReflectionCoefficient(frequency, air);
  const waveNumber = (2 * Math.PI * frequency) / air.speed;
  const extraPathPhase = -2 * waveNumber * driverToSurfaceDistance();
  const propagation = c(Math.cos(extraPathPhase), Math.sin(extraPathPhase));
  const reflectedAtListener = cmul(reflection, propagation);
  const summedPressure = cadd(c(1), reflectedAtListener);
  const reflectionMagnitude = cabs(reflection);

  return {
    responseMagnitude: cabs(summedPressure),
    responseDb: amplitudeToDb(cabs(summedPressure)),
    reflectionDb: amplitudeToDb(reflectionMagnitude),
    absorptionPercent: 100 * clamp01(1 - reflectionMagnitude ** 2),
  };
}

function surfaceReflectionCoefficient(frequency, air) {
  const z0 = air.density * air.speed;
  const k0 = (2 * Math.PI * frequency) / air.speed;
  let matrix = identityMatrix();

  const porousDepth = state.absorberDepth / 1000;
  if (porousDepth > 0) {
    const { zc, kc } = allardChampouxLayer(
      frequency,
      state.flowResistivity,
      air,
    );
    matrix = multiplyMatrices(matrix, layerMatrix(kc, zc, porousDepth));
  }

  const gapDepth = state.airGap / 1000;
  if (gapDepth > 0) {
    matrix = multiplyMatrices(matrix, layerMatrix(c(k0), c(z0), gapDepth));
  }

  if (Math.hypot(matrix.c.re, matrix.c.im) < 1e-14) {
    return c(1);
  }

  const surfaceImpedance = cdiv(matrix.a, matrix.c);
  return cdiv(csub(surfaceImpedance, c(z0)), cadd(surfaceImpedance, c(z0)));
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

function layerMatrix(waveNumber, impedance, depth) {
  const phase = cmul(waveNumber, c(depth));
  const cosine = ccos(phase);
  const sine = csin(phase);
  const jSine = cmul(c(0, 1), sine);

  return {
    a: cosine,
    b: cmul(cmul(c(0, 1), impedance), sine),
    c: cdiv(jSine, impedance),
    d: cosine,
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

function findResponseNulls(frequencies, results) {
  const candidates = [];

  for (let index = 1; index < frequencies.length - 1; index += 1) {
    const previous = results[index - 1].responseMagnitude;
    const current = results[index].responseMagnitude;
    const next = results[index + 1].responseMagnitude;

    if (current <= previous && current < next) {
      const frequency = refineNullFrequency(
        frequencies[index - 1],
        frequencies[index + 1],
      );
      candidates.push({
        frequency,
        ...responseAtFrequency(frequency),
      });
    }
  }

  return candidates.filter((candidate, index) => {
    if (index === 0) return true;
    return candidate.frequency / candidates[index - 1].frequency > 1.01;
  });
}

function refineNullFrequency(lowerFrequency, upperFrequency) {
  const goldenRatio = (Math.sqrt(5) - 1) / 2;
  let lower = Math.log(lowerFrequency);
  let upper = Math.log(upperFrequency);
  let left = upper - goldenRatio * (upper - lower);
  let right = lower + goldenRatio * (upper - lower);
  let leftValue = responseAtFrequency(Math.exp(left)).responseMagnitude;
  let rightValue = responseAtFrequency(Math.exp(right)).responseMagnitude;

  for (let iteration = 0; iteration < 32; iteration += 1) {
    if (leftValue < rightValue) {
      upper = right;
      right = left;
      rightValue = leftValue;
      left = upper - goldenRatio * (upper - lower);
      leftValue = responseAtFrequency(Math.exp(left)).responseMagnitude;
    } else {
      lower = left;
      left = right;
      leftValue = rightValue;
      right = lower + goldenRatio * (upper - lower);
      rightValue = responseAtFrequency(Math.exp(right)).responseMagnitude;
    }
  }

  return Math.exp((lower + upper) / 2);
}

function airProperties() {
  const kelvin = AIR.temperatureC + 273.15;
  return {
    density: AIR.pressure / (AIR.gasConstant * kelvin),
    speed: 331.3 * Math.sqrt(kelvin / 273.15),
  };
}

function driverToSurfaceDistance() {
  return (state.cabinetDepth + state.rearDistance) / 1000;
}

function amplitudeToDb(amplitude) {
  return 20 * Math.log10(Math.max(amplitude, 1e-6));
}

function displayDb(value) {
  return Math.max(CHART.minDb, Math.min(CHART.maxDb, value));
}

function logSpace(min, max, count) {
  const start = Math.log10(min);
  const end = Math.log10(max);
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    return 10 ** (start + (end - start) * ratio);
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatDistance(meters) {
  return `${meters.toFixed(2)} m`;
}

function formatFrequency(frequency) {
  if (frequency >= 1000) {
    return `${(frequency / 1000).toFixed(frequency >= 2000 ? 1 : 2)} kHz`;
  }
  return `${Math.round(frequency)} Hz`;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function c(re, im = 0) {
  return { re, im };
}

function cadd(left, right) {
  return c(left.re + right.re, left.im + right.im);
}

function csub(left, right) {
  return c(left.re - right.re, left.im - right.im);
}

function cmul(left, right) {
  return c(
    left.re * right.re - left.im * right.im,
    left.re * right.im + left.im * right.re,
  );
}

function cdiv(left, right) {
  const denominator = right.re * right.re + right.im * right.im;
  if (denominator < 1e-30) return c(1e30, 0);
  return c(
    (left.re * right.re + left.im * right.im) / denominator,
    (left.im * right.re - left.re * right.im) / denominator,
  );
}

function cabs(value) {
  return Math.hypot(value.re, value.im);
}

function ccos(value) {
  return c(
    Math.cos(value.re) * Math.cosh(value.im),
    -Math.sin(value.re) * Math.sinh(value.im),
  );
}

function csin(value) {
  return c(
    Math.sin(value.re) * Math.cosh(value.im),
    Math.cos(value.re) * Math.sinh(value.im),
  );
}
