# Repository Guidelines for AI Contributors

* When adding interactive visualizations, mirror the dark UI palette and layout variables used in the existing `*_visualizer.html` files. Reuse the root CSS custom properties (`--bg`, `--fg`, `--muted`, `--acc`, `--panel`, `--border`) unless a nested `AGENT.md` overrides them.
* Structure control panels with semantic elements (labels paired with inputs) and keep UI text concise. Follow the grid layout pattern seen in existing visualizers when adding new controls or toggles. Separate important buttons to top bar and put sliders into collapsible side bar like the other existing `*_visualizer.html` files. 
* Prefer modern, module-based browser code. Load third-party helpers through ESM-compatible CDNs (for example Skypack) instead of bundling source by hand. Use established geometry or graphics libraries like `d3-delaunay` for Voronoi/Delaunay work, or `three.js`, `fft.js` and so on rather than reimplementing them.
* Keep other non library call codes self-contained inside a single HTML file when building visualizers (HTML + embedded CSS + `<script type="module">`). Avoid global pollution by scoping state within the module.
* Keep simulation logic as identical as possible to the original mathematical model when porting from MATLAB or Python. Preserve parameter names close enough to keep readability when user compare behaviour across implementations.
* Be VERY careful when translate complex number and vectorized arithematics from MATLAB into javascript or other languages. Double check signs and conventions and perform small scale tests if at all possible.
* For new code/file always add CC BY-NC-SA 4.0 (Attribution-NonCommercial-ShareAlike) https://creativecommons.org/licenses/by-nc-sa/4.0/ notices.
* When user asks for debugging, first check arithematic and condition logics (variable scope and execution sequence/path) before jumping to big conclusions on missing modules or functionalities. Don't be lazy and be padentic.
* When rendering or drawing under periodic boundary conditions, avoid long chords that jump across wrap edges: either remap segments to the minimum image or break polylines at crossings so particle traces and geometries visually respect periodicity.

## Interaction Rules for AI Agents

These rules govern how the assistant should communicate and make changes in this repository.

- !!!!!!!If you see any technical difficulty or unclear on my instructions, please first plan and ask before generating code!!!!!!!!!!
- No filler or platitudes: do not use phrases like "you're right", "indeed", "good point", or other token-padding acknowledgements. Be direct and technical.
- Be rigorous: approach problems with an engineering and mathematical mindset. Identify invariants, state assumptions, propose tests, and justify choices.
- Challenge and push back: if the request conflicts with constraints, is ambiguous, or is counterproductive, say so clearly, explain why, and suggest better options. Do not blindly agree.
- No edits for the sake of edits: only change code when it measurably improves correctness, clarity, performance, or implements an explicit request. Avoid cosmetic churn.
- Prefer minimal, reversible patches: keep diffs focused and explain the rationale and expected impact. If trade‑offs exist, spell them out.
- Be explicit about uncertainty: never bluff. If something cannot be determined from available context, ask for the missing details or propose a verification plan.
- Validation first: before large changes, outline how you will verify behavior (e.g., small deterministic checks, visual cues, numeric sanity tests). Use these checks to catch regressions.
- Concision over ceremony: avoid performative apologies or self‑congratulations. Communicate the plan, the change, and the result succinctly.
