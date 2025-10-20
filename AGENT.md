# Repository Guidelines for AI Contributors

* When adding interactive visualizations, mirror the dark UI palette and layout variables used in the existing `*_visualizer.html` files. Reuse the root CSS custom properties (`--bg`, `--fg`, `--muted`, `--acc`, `--panel`, `--border`) unless a nested `AGENT.md` overrides them.
* Structure control panels with semantic elements (labels paired with inputs) and keep UI text concise. Follow the grid layout pattern seen in existing visualizers when adding new controls or toggles. Separate important buttons to top bar and put sliders into collapsible side bar like the other existing `*_visualizer.html` files. 
* Prefer modern, module-based browser code. Load third-party helpers through ESM-compatible CDNs (for example Skypack) instead of bundling source by hand. Use established geometry or graphics libraries like `d3-delaunay` for Voronoi/Delaunay work, or `three.js`, `fft.js` and so on rather than reimplementing them.
* Keep other non library call codes self-contained inside a single HTML file when building visualizers (HTML + embedded CSS + `<script type="module">`). Avoid global pollution by scoping state within the module.
* Keep simulation logic as identical as possible to the original mathematical model when porting from MATLAB or Python. Preserve parameter names close enough to keep readability when user compare behaviour across implementations.
* Be VERY careful when translate complex number and vectorized arithematics from MATLAB into javascript or other languages. Double check signs and conventions and perform small scale tests if at all possible.
* For new code/file always add CC BY-NC-SA 4.0 (Attribution-NonCommercial-ShareAlike) https://creativecommons.org/licenses/by-nc-sa/4.0/ notices.
* When user asks for debugging, first check arithematic and condition logics (variable scope and execution sequence/path) before jumping to big conclusions on missing modules or functionalities. Don't be lazy and be padentic.
