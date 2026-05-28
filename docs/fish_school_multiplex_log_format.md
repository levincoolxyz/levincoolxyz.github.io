# Fish School Multiplex Log Format

`fish_school_multiplex_visualizer.html` records binary `.fslog` files with JSON metadata/events and binary frame snapshots.

## Versioning

- `format`: `fish_school_multiplex_log_v3`
- `schemaVersion`: `2`
- `eventVocabulary`: `fish_school_multiplex_event_v1`
- `frameSchema`: `fish_school_multiplex_frame_v2`

The repository is not maintaining pre-initialization log compatibility. New parsers target `v3` recordings and use `pi` for the PNAS rotational order parameter.

## Container Layout

The file is a sequence of chunks:

1. 4-byte ASCII chunk type
2. 4-byte little-endian unsigned payload length
3. payload bytes

Chunk types:

- `META`: UTF-8 JSON metadata or summary objects
- `EVNT`: UTF-8 JSON event records
- `FRAM`: binary frame snapshot payload

## `META` Payload

Initial `META` contains session metadata such as:

- `format`
- `createdAt`
- `fps`
- `dt`
- `maxBytes`
- `video`
- `prebuffer`
- `eventVocabulary`
- `frameSchema`
- `docs`

Final `META` summary contains:

- `type`: `summary`
- `frames`
- `events`
- `bytes`

## `EVNT` Payload

Each event is UTF-8 JSON with at least:

- `tSec`: elapsed seconds from the page session start. A recording may include prebuffered frames whose `tSec` is earlier than the button press.
- `type`: event type string

Formalized event vocabulary (`fish_school_multiplex_event_v1`):

- `play_set`
  - fields: `playing`
- `armed_set`
  - fields: `tool`, `active`
- `flag_set`
  - fields: `key`, `active`
- `goal_clear_all`
  - fields: none
- `bait_clear_all`
  - fields: none
- `instance_params`
  - fields: `simId`, `reason`, `n`, `Ia`, `In`, `respawn`
- `bait_add`
  - fields: `simId`, `x`, `y`
- `goal_set`
  - fields: `simId`, `x`, `y`
- `sim_reset`
  - fields: `simId`, `reason`, `n`, `Ia`, `In`
- `sim_add`
  - fields: `simId`, `reason`, `sourceSimId`, `n`, `Ia`, `In`
- `sim_remove`
  - fields: `simId`
- `hydro_set`
  - fields: `hydro`, `shell`, `range`, `rCut`
- `reset_all`
  - fields: `n`, `Ia`, `In`
- `record_start_from_buffer`
  - fields: `bufferedStartSec`, `recordPressedSec`, `prebufferSeconds`, `prebufferFrameLimit`, `prebufferFrames`, `prebufferBytes`, `video`
- `recording_stop`
  - fields: `reason`
- `thread_mode_set`
  - fields: `simId`, `mode`, `reason`
- `thread_backend_set`
  - fields: `simId`, `mode`, `backend`, `reason`
- `worker_error`
  - fields: `simId`, `mode`, `backend`, `message`

Unknown future event fields should be preserved rather than discarded.

The current browser recorder keeps a rolling 480-frame state buffer at 4 Hz, corresponding to about two minutes. Pressing the record button starts the saved `.fslog` with that buffer and injects `instance_params` context events at `bufferedStartSec` so downstream phase analysis has parameter assignments for prebuffered frames. Video/WebM recording is intentionally disabled; rendered movies should be regenerated from `.fslog` data when needed.

## `FRAM` Payload

`FRAM` is little-endian binary with the following layout:

1. `float64 tSec`
2. `uint32 simCount`
3. repeated `simCount` times:
   - `uint32 simId`
   - `uint32 n`
   - `uint32 flags`
   - `float32 pol`
   - `float32 pi` as the normalized angular momentum order parameter `Π`
   - `float32 fish[3*n]` as interleaved `(x, y, theta)`
   - `float32 shark[3]` as `(x, y, theta)` or `NaN` when disabled
   - `float32 whale[3]` as `(x, y, theta)` or `NaN` when disabled

`flags` bit layout:

- bit `0`: shark enabled
- bit `1`: whale enabled

Derived booleans:

- `sharkOn = (flags & 1) ~= 0`
- `whaleOn = (flags & 2) ~= 0`

## CSV Exports

The reference parsers export:

- `events.csv`: one row per `EVNT`
- `frame_summary.csv`: one row per `(frame, sim)`
- `predators.csv`: one row per `(frame, sim)` predator state
- `fish_state.csv`: one row per fish state sample, optional because it can be large

The frame summary field `pol` corresponds to the PNAS polarization order parameter
`P = |mean_j p_j|`. The frame summary field `pi` corresponds to the PNAS rotational
order parameter `Π = |mean_j ((r_j - r_c) x rdot_j) / (|r_j - r_c| |rdot_j|)|`.

## Reference Parsers

- Python: `tools/fish_school_log_parser.py`
- MATLAB: `tools/fish_school_log_parser.m`

Both parsers:

- preserve unknown event fields
- parse current `v3` recordings
- expose structured in-memory data
- support CSV export
