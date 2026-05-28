# Multiplex Initial-Condition I/O API Plan

## Goal

Make initial conditions first-class data objects that can be imported, exported, assigned to any subset of simulation tiles, logged reproducibly, and reused for attraction-basin and multistability analysis.

## Proposed Data Model

Use versioned JSON objects with explicit units, schema names, and validation rules.

### Single Initial Condition

```json
{
  "schema": "fish_school_initial_condition_v1",
  "name": "schooling_line_seed_001",
  "params": {"n": 150, "Ia": 1.5, "In": 0.3},
  "fish": {
    "x": [0.0],
    "y": [0.0],
    "theta": [0.0],
    "vx": [],
    "vy": [],
    "w": []
  },
  "predators": {
    "shark": {"x": -25.0, "y": 0.0, "theta": 0.0},
    "whale": {"x": 0.0, "y": -25.0, "theta": 1.5707963267948966}
  },
  "baits": [],
  "goal": null,
  "view": {"follow": true, "centerX": 0.0, "centerY": 0.0, "worldHeight": 40.0},
  "metadata": {
    "source": "manual|random|snapshot|batch",
    "seed": null,
    "ensembleId": null,
    "replicateId": null,
    "notes": ""
  }
}
```

Rules:

- `fish.x`, `fish.y`, and `fish.theta` are required and must have equal length.
- `params.n` is derived from fish array length when omitted or inconsistent.
- `vx`, `vy`, and `w` are optional; missing arrays initialize to zeros.
- Angles are normalized to `[-pi, pi)`.
- Non-finite numbers, mismatched lengths, and unknown schema versions are rejected.

### Multi-Tile Assignment

```json
{
  "schema": "fish_school_ic_assignment_v1",
  "mode": "replace",
  "targets": [
    {"target": "active", "icRef": "seed_001"},
    {"target": "all", "icRef": "shared_seed"},
    {"target": {"simId": 4}, "ic": {"schema": "fish_school_initial_condition_v1"}}
  ]
}
```

Target options:

- `"active"`: focused simulation tile.
- `"all"`: every existing simulation tile.
- `"new"`: create one new simulation tile from the IC.
- `{"simId": n}`: one explicit tile.
- `{"simIds": [1, 3, 7]}`: explicit subset.

Assignment modes:

- `replace`: full state replacement, including fish count.
- `patch`: update provided fields only.
- `perturb`: apply deterministic perturbations to a base IC for basin sweeps.
- `clone_state`: exact current-state duplication for controlled branch experiments.

## Core Implementation Steps

1. Add pure state helpers in `src/javascripts/fish_school_compute_core.js`.

   - `normalizeInitialCondition(input, options)`
   - `validateInitialCondition(ic)`
   - `applyInitialCondition(state, ic, options)`
   - `serializeInitialCondition(state, instanceParams, options)`
   - `makeInitialConditionHash(ic)`

2. Refactor current reset paths to use the new helpers.

   - Keep `random` and `line` as built-in IC generators.
   - Change `createSimulationState(instanceParams, initMode)` to accept `initSpec`.
   - Preserve existing UI behavior by translating dropdown values into generator specs.

3. Add visualizer-level assignment API.

   - `applyInitialConditionToSim(simId, ic, mode)`
   - `applyInitialConditionAssignment(assignment)`
   - `exportInitialConditionFromSim(simId)`
   - `exportInitialConditionBundle(simIds)`

4. Add user-facing I/O.

   - Import JSON file or drag-drop JSON onto a tile.
   - Export active tile IC.
   - Export all tile ICs as a bundle.
   - Apply imported IC to active, all, selected, or new simulation tiles.

5. Extend `.fslog` metadata/events for reproducibility.

   - Add event types:
     - `initial_condition_apply`
     - `initial_condition_export`
     - `initial_condition_generator`
   - Log `simId`, assignment mode, IC hash, source, ensemble ID, replicate ID, and parameter set ID.
   - Store full IC JSON in session `META` only for small ICs; otherwise store hash and external filename.

## Basin And Multistability Hooks

The IC schema should support batch-generated ensembles:

- `ensembleId`: shared basin experiment identifier.
- `replicateId`: replicate within an ensemble.
- `parameterSetId`: link to `(Ia, In, hydro, confinement, predator flags, etc.)`.
- `perturbation`: deterministic offset/noise recipe from a base IC.
- `basinCoordinates`: reduced coordinates used for basin maps, such as initial polarization, milling, radius, or principal-component coordinates.

The phase-diagram analysis can then group by:

- `(Ia, In)`
- `icHash`
- `ensembleId`
- `replicateId`
- final attractor label

This makes it possible to estimate attraction-basin fractions, detect bistability by repeated IC perturbations, and separate parameter-driven transitions from IC-dependent multistability.

## Acceptance Criteria

- Existing random and line initialization continue to work.
- A user can export one tile, import it, and reproduce the same fish positions/headings in another tile.
- A JSON bundle can assign different ICs to multiple simulation tiles in one operation.
- Recordings preserve enough IC metadata to reproduce or audit a run.
- Invalid IC files fail with clear messages and do not partially mutate simulation state.
- The API is pure enough to unit-test outside the browser UI.
