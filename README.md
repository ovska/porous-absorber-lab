# Porous Absorbers & Boundary-Reflection Labs

A collection of static, interactive acoustics tools. Open any HTML file directly
in a browser; no build step or package installation is required.

## Tools

### [Porous Absorber Efficiency Lab](./index.html)

Compare porous-absorber efficiency from 20 Hz to 20 kHz, including layer
thickness, flow resistivity, air gaps, incidence assumptions, optimization and
optional room-mode overlays.

The calculator uses the Allard & Champoux (1992) empirical characteristic
impedance and propagation-constant form:

- `Zc = rho0 * c0 * [1 + 0.0571 X^-0.754 - j 0.087 X^-0.732]`
- `kc = omega / c0 * [1 + 0.0978 X^-0.700 - j 0.189 X^-0.595]`
- `X = rho0 * f / sigma`

The porous layer and optional air gap are evaluated with transfer matrices
against a rigid backing. Random incidence is estimated by diffuse-field angular
integration up to 78 degrees.

### [Front-Wall SBIR Lab](./sbir.html)

Explore speaker-boundary interference from the front wall. The tool combines
image-source path geometry with optional porous treatment, speaker high-pass
filtering and predicted cancellation frequencies.

### [Desk-Bounce Predictor](./desk.html)

Predict and visualize the first desktop reflection between a nearfield monitor
and the listener. It includes specular, Fresnel-zone and finite-surface
Kirchhoff models; plan and elevation views; response, coverage, excess-delay and
energy-time plots; A/B traces; absorber and directivity controls; and placement
sweeps.

The desk-bounce physics checks can be run by opening [tests.html](./tests.html).

## Runtime notes

The absorber and SBIR tools load Plotly from a CDN for chart interaction. The
desk-bounce tool has no runtime dependencies and works fully offline.

## Disclaimer

Made with Codex 5.6 Sol. Neither 5.6 Sol nor I am a professional acoustician.
