# Repository Guidelines for AI Contributors

* When adding interactive visualizations, mirror the dark UI palette and layout variables used in the existing `*_visualizer.html` files. Reuse the root CSS custom properties (`--bg`, `--fg`, `--muted`, `--acc`, `--panel`, `--border`) unless a nested `AGENT.md` overrides them.
* Prefer modern, module-based browser code. Load third-party helpers through ESM-compatible CDNs (for example Skypack) instead of bundling source by hand. Use established geometry libraries like `d3-delaunay` for Voronoi/Delaunay work rather than reimplementing them.
* Keep simulation logic close to the original mathematical model when porting from MATLAB or Python. Preserve parameter names (such as `Ip`, `In`, `dt`, `If`) so the behaviour remains comparable across implementations.
* Structure control panels with semantic elements (labels paired with inputs) and keep UI text concise. Follow the grid layout pattern seen in existing visualizers when adding new controls or toggles.
* Keep code self-contained inside a single HTML file when building demos (HTML + embedded CSS + `<script type="module">`). Avoid global pollution by scoping state within the module.
