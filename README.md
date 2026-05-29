# Porous Absorber Efficiency Lab

A static interactive web app for comparing porous absorber absorption efficiency
from 20 Hz to 20 kHz.

Open `index.html` in a browser. Plotly is loaded from the CDN for hover labels,
legend interaction, pan, and zoom.

Sliders snap over focused working ranges, while the numeric fields can hold
values outside those slider ranges.

The optimizer uses a logarithmic frequency slider with integer-Hz input, scans
snapped slider-range values for the chosen parameter, and applies the best
target-frequency result to every visible absorber in one undoable action.
The optimizer marker can be shown in the graph and turns on when the optimizer
slider or buttons are used. The chart can also overlay axial room modes through
3rd order from width, depth, and height dimensions entered in centimeters.

The calculator uses the Allard & Champoux (1992) empirical characteristic
impedance and propagation constant form:

- `Zc = rho0 * c0 * [1 + 0.0571 X^-0.754 - j 0.087 X^-0.732]`
- `kc = omega / c0 * [1 + 0.0978 X^-0.700 - j 0.189 X^-0.595]`
- `X = rho0 * f / sigma`

The porous layer and optional air gap are evaluated with transfer matrices
against a rigid backing. Random incidence is estimated by diffuse-field angular
integration up to 78 deg.
