# Nitro Clash — arcade combat racing

A browser arcade combat racer inspired by the *feel* of games like Blur (grid, countdown, drifting, nitro,
weapons, bots and private online races). All names, cars, tracks, UI, music and sound are original.

Stack: three.js 0.179, Rapier 0.17 (compat build), Vite 6 and a Node.js + TypeScript authoritative server
on `ws`. Sound is synthesised live with the Web Audio API.

## Quick start

```bash
npm install
npm run dev:all        # client on http://localhost:5173 + multiplayer server on :8787
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev client only (solo and time trial work without a server) |
| `npm run dev:server` | Multiplayer server with auto-reload (`tsx watch server/main.ts`) |
| `npm run dev:all` | Both of the above together; Ctrl+C stops both |
| `npm run build` | Production frontend in `dist/` (includes the generated `sw.js`) |
| `npm run preview` | Serve `dist/` locally (the only way to try offline mode) |
| `npm run start:server` | Run the multiplayer server for production |
| `npm test` | Type-check, then the vehicle, race and multiplayer suites |
| `npm run test:vehicle` | Handling: acceleration, braking, steering, nitro, drift per car |
| `npm run test:race` | Track generator, race rules, items, bots, finish/DNF |
| `npm run test:multiplayer` | Real server + WebSocket clients: lobby, race, rematch, reconnect, 8 clients |
| `npm run model:check` | Check car GLBs against the vehicle contract ([docs/VEHICLES.md](docs/VEHICLES.md)); no arguments = every car in `public/models` |
| `npm run bench` | Simulation cost and snapshot size for an 8-car race |

## Playing

**Main menu → Play Solo** (race 1–7 bots, Easy/Normal/Hard, 1–5 laps, power-ups on/off, or a
time trial with local records), **Play with Friends** (private room), **Garage**,
**Settings**.

Each race: track intro with the grid (skippable — skipping never changes the start time), 3‑2‑1‑GO,
race, results, then *Race again* / *Rematch*.

### Controls (all remappable in Settings)

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Accelerate / brake & reverse | W / S or ↑ / ↓ | RT / LT | GAS / BRAKE |
| Steer | A / D or ← / → | left stick | ◀ ▶ |
| Handbrake / drift | Space (race), Ctrl | A | DRIFT |
| Nitro | Shift | B | NITRO |
| Use item | E | X | ITEM |
| Look back | Q | LB | — |
| Reset to last checkpoint | R (3 s cooldown) | Y | RESET |
| Change camera (chase → far → hood → cockpit) | C | — | CAM |
| Menu | Esc | Start | II |

During the track intro, E, Enter or Space skips it. The camera choice is saved and also selectable in
Settings. Hood and cockpit are first-person: the car body is hidden. Every car has its own cockpit
(`src/race/cockpit/styles.js`): eye height (van and pickup sit high, Nova low), bonnet in the car's paint,
dashboard colours, steering wheel type (round, flat-bottom, rally dish, wood-rim retro, EV yoke, bus) and
instrument cluster (twin dials, big dial + screen, digital display, three rally dials, EV tablet, retro
cream dials with a centre trio; Hornet RS adds a boost gauge on the pillar). The speedometer, rev counter
(a gearbox imitation) and nitro gauges are live, and the wheel turns the same way you steer. Both show a rear-view mirror at the top of
the screen (a rear camera rendered every second frame into a small texture, drawn mirrored); it can be
turned off in Settings. Q (look back) still works in every mode.
Solo `Esc` pauses the simulation; online `Esc` only opens a local menu — the race keeps running.

### Racing mechanics

* **Launch:** press throttle 0.05–0.45 s before GO for a boost + nitro; holding it from more than 0.6 s
  before GO bogs the engine. Online, the client may claim its press up to 4 ticks (~67 ms) before the server
  received it (latency compensation); anything earlier is clamped.
* **Drift:** handbrake above ~40 km/h while steering. Steering sets the yaw rate and throttle keeps
  momentum (arcade, not a sim). Releasing with throttle after a clean drift gives a small exit boost.
  Drifting refills nitro (14/s, capped at 35 per drift) **only while moving forward along the track**,
  so circling on the spot earns nothing.
* **Nitro:** Shift, capacity 100, per-car burn rate, needs 8 to start, stops when empty.
* **Aiming:** E fires forward; holding Q (look back) while pressing E fires backward. Pulse Shot and Arc
  Missile fly the chosen way (a backward missile homes on the nearest rival behind); a Road Mine is thrown
  26 m ahead (its owner is immune to it for 3 s) or, with Q, dropped behind. Bots aim the same way.
* **Items** (one held at a time, boxes respawn after 6 s, rolls favour cars further back):
  Pulse Shot (straight bolt), Arc Missile (homes on the nearest rival ahead, limited turn rate, cannot pass
  walls), Shock Ring (10 m blast), Road Mine (dropped behind, arms after 0.7 s), Shield (6 s or 60 damage;
  blocks damage *and* push from every weapon, never collision damage), Repair (+35 HP), Nitro Cell (+60).
* **Collisions:** speed loss depends on the angle. A wall scrape at 15° keeps ~90 % of the speed, 45°
  ~80 %, head-on stops the car (`keepGlancingSpeed` in `VehiclePhysics`). Damage only from hard hits
  (impact ≥ 8 m/s), at most 15 per crash and at most once per 0.5 s, so scraping along a wall never wrecks
  a car on its own.
* **Health 0 → wreck:** 1.3 s wreck, respawn at the last checkpoint passed with 35 % of the speed, ghosted
  (no car collisions, no damage) for 1.5 s and until no car overlaps. Flipped for 2.5 s or fallen off → same.
* **Rules:** checkpoints count only in order and only inside the road width; crossing the line backwards
  never counts; wrong-way warning after 1.2 s; ranking = laps + checkpoint + distance along the sector;
  after the first finisher others have 30 s, then DNF. Finished cars become ghosts on a slow lap of honour.
* **No catch-up:** bots get no hidden speed or teleports; they drive the same physics, health, items and
  rules as you. Item rolls favour the back of the field, which is the only balancing.

### Cars

Twelve cars. 0–60 km/h and top speed (without nitro) measured on flat ground with the shared physics:

| Car | Character | 0–60 | Top | Mass | HP |
| --- | --- | --- | --- | --- | --- |
| Nitro GT | Balanced all-rounder | 4.1 s | 128 km/h | 1250 kg | 100 |
| Atlas Hauler | Heavy hitter, wins contact, slow to stop | 4.4 s | 119 km/h | 1650 kg | 145 |
| Pixel Hatch | Quickest launch, sharp steering, fragile | 3.2 s | 121 km/h | 950 kg | 80 |
| Nova Coupe | Highest top speed, twitchy grip | 3.4 s | 144 km/h | 1150 kg | 70 |
| Courier Van | Tough, forgiving, slowest | 4.5 s | 116 km/h | 1500 kg | 150 |
| Dune Jumper | Soft suspension, best in the air | 4.1 s | 125 km/h | 1300 kg | 110 |
| Vandal V8 | Drift king: loosest rear, drifts earn 1.25× nitro | 4.0 s | 132 km/h | 1450 kg | 115 |
| Gravel Fox | Rally: long suspension travel, strong air control | 3.8 s | 126 km/h | 1180 kg | 105 |
| Volt Arrow | Electric: instant launch, drifts earn 1.6× nitro | 3.6 s | 130 km/h | 1350 kg | 95 |
| Kei Bolt | Tiny, sharpest steering, lowest top speed | 3.3 s | 114 km/h | 850 kg | 70 |
| Sundown Roadster | Best grip and handling | 3.6 s | 126 km/h | 1050 kg | 75 |
| Hornet RS | Nitro specialist: strongest boost, burns fast | 3.8 s | 129 km/h | 1200 kg | 90 |

## Architecture

```
shared/        TypeScript used by both the browser and the server
  physics/     Rapier world wrapper, VehiclePhysics (ray-cast vehicle + arcade drift/nitro/air control)
  track/       seeded generator, validation, fallback track, colliders, racing line, presets
  race/        RaceSimulation (rules, laps, items, damage, respawn), bots, combat, events
  net/         protocol (strictly validated messages), compact snapshots
server/        Node + ws: rooms, lobby state machine, 60 Hz authoritative races, reconnect
src/           browser client
  game/        top-level flow (Loading → Menu → … → Results)
  race/        local & online sessions, view, HUD, camera, effects, engine audio
  core/ ui/ audio/ net/ scenes/
```

**Tracks** come from one `TrackDefinition` (`shared/track/generator.ts` + `layouts.ts`,
`GENERATOR_VERSION = 2`), 2.1–3.2 km long in a ±440 m world. Every seed picks a **layout** and a **theme**:

| Layout | What it is |
| --- | --- |
| `loop` | 12–17 control points with 2–3 hairpins |
| `figure8` | crosses itself once on an overpass: the deck clears the road below by 8.5 m (validated ≥ 6.5 m), 150 m ramps, pillars kept off the lower road |
| `island` | islets in the sea joined by two bridges over open water |

Themes (visual only): meadow, desert, snow, dusk city, island. 24 named tracks fix both (every layout ×
theme combination, listed in `shared/track/presets.ts`); "🎲 Random map" (Solo and lobby host) picks one of
them, and any other code gets its own layout and theme, so new codes keep giving new circuits. Each track has elevation, a jump crest with a straight landing, 18 m road,
checkpoints every ~70 m, 8 grid slots on a flat straight, 4 rows of item boxes and a braking-aware racing
line. Road and barrier colliders, the visual mesh, bot paths and checkpoints are all built from it.
`validateTrack` checks continuity, minimum radius, self-clearance, world bounds, grades, landing straight,
grid, checkpoint order, pickups and the racing line; failing seeds retry deterministically
(`seed|attempt`, up to 60 tries; none of 120 random seeds needed the fallback) and finally fall back to a
hand-placed circuit. On an overpass, checkpoints and item boxes stay off the crossing, the car locator
weighs height so a car below is never placed on the deck, and barriers under a deck stop 1.4 m below the
road so the road beneath is open. Same seed + generator version → same track (tested by fingerprint). Online, the server sends the full definition so clients can never disagree.

**Multiplayer** is server-authoritative. Clients send only inputs (`[seq, tick, throttle, steer, buttons]`,
30 Hz batches); the server runs physics at 60 Hz and sends 20 Hz snapshots with the last applied input
`ack`. The local car is predicted in a client-side Rapier world and reconciled (rewind to the server state
for `ack`, replay newer inputs, blend small errors, snap big ones); rivals are drawn at their extrapolated
*present* position (latest snapshot moved forward by latency, at most 250 ms, then smoothed; jumps over 6 m
snap), so on screen they sit where the server collides them instead of 100 ms behind. For local contact
they are dynamic bodies with the rival's real mass, reset to the snapshot every frame, so a bump shares
momentum as it does on the server; the replay during reconciliation ignores them (their past positions are
unknown, and the server state already contains those contacts). Client and server
physics are not assumed to match bit-for-bit — the server state always wins. The server never trusts
positions, speed, damage, laps or finish claims from a client, consumes at most one input per tick, buffers up
to 4 queued inputs to absorb network jitter and drops anything beyond that (no speed-hacking by flooding).
The HUD ping is the median of the last 10 round trips.

**Lobby:** 6-character room codes (collision-checked) shown large with a QR code of the invite link
`?room=CODE` (copy link / copy code buttons; on `localhost` the page says to open it via the LAN address so
a phone can scan it), car cards with stats (the 3D car behind updates on pick), 2–8 slots, bots fill empty
slots (optional), ready/unready, host-only settings (track, laps, bot difficulty, slots, items), locked
during a race. Room states: lobby → loading → racing → finished → lobby. The host is only a lobby
moderator; races run on the server. Host leaves the lobby → the next connected player becomes host.

**Disconnects:** the HUD shows the connection state; the car is driven by a bot meanwhile. The client
resumes with a token kept in `sessionStorage` (never in the URL) and gets the room, race setup, start time
and a full snapshot. Defaults: 20 s grace in the lobby, 60 s in a race; after the race deadline the human is
DNF (the bot finishes the car). Empty rooms and their physics worlds are freed.

**Hardening:** strict per-message validation, 8 KB message limit, per-connection rate limit (90/s, burst
180, sustained abuse closes the socket), at most 12 sockets per IP (`MAX_CONNECTIONS_PER_IP`; set
`TRUST_PROXY=1` behind your own proxy so `X-Forwarded-For` is used), sockets that do not say hello within
10 s are closed, 3 room creations per player per minute, a 3 s cooldown between race starts in a room,
a bounded track cache, nickname validation and optional `ALLOWED_ORIGINS`. A failed race build returns the
room to its lobby. Queued inputs are trimmed to 2 after a network burst so steering latency recovers.
Origin checks are a convenience, not authentication — rooms are private by code only. Track generation and
all rooms share one Node thread; very busy servers would need worker threads (not implemented).

## Performance and heat

* **Graphics quality** (Settings): Low = 1× pixel ratio, no shadows, no bloom; Medium (default on desktop)
  = 1.25×, 1024 shadow map, bloom; High = 1.5×, 2048 shadows, bloom and depth of field in the garage and
  intro. Touch devices default to Low.
* **Frame rate** (Settings): 30 fps, 60 fps (default) or Unlimited in races. Menus, garage and lobby always
  run at 30 fps.
* Models are optimised once at load (`src/modelOptimizer.js`): car meshes are merged per material (wheels
  merged separately so they still spin), the grass tile's 12,800-triangle colour grid is baked into a
  texture on a 2-triangle quad, and wheel tread lugs are hidden on cars more than 12 m from the camera
  (always on Low). Only the four world-pack models the race uses are loaded.
* The renderer asks for the browser's *default* GPU, not the high-performance one, so laptops can stay on
  the integrated GPU. Canvas MSAA is off because the post chain renders offscreen, and the speed-blur pass
  is skipped when it is not visible.

## Offline

`npm run build` emits `sw.js` with a content-hash version and a precache list of the whole app (HTML,
JS chunks including Rapier's inlined WASM, CSS, models). After one online visit, **solo and time trial load
and run with no network**; the Friends screen reports that online play needs a server
instead of spinning. New versions install in the background and are offered from the main menu
("Update ready · restart"), never activated mid-race. Settings, the chosen car and time-trial records are
in `localStorage` under versioned keys (`bruno-race:settings` v3, `bruno-race:records` v1; the key names are
kept from the project's earlier name so existing saves still load).

## Deployment

The frontend is static; the multiplayer server is a long-running Node process. Static hosting alone cannot
run online races.

1. **Server** (any VM/container host with WebSockets):
   ```bash
   npm ci --omit=dev
   PORT=8787 ALLOWED_ORIGINS=https://race.example.com npm run start:server
   ```
   or `docker build -t nitro-clash-server . && docker run -p 8787:8787 -e ALLOWED_ORIGINS=… nitro-clash-server`.
   Health check: `GET /health` → `{"ok":true,"protocol":1,…}`. WebSocket path: `/ws`.
2. **TLS:** put the server behind a reverse proxy so pages on `https://` can use `wss://`. Example (nginx):
   ```nginx
   location /ws {
     proxy_pass http://127.0.0.1:8787;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
     proxy_read_timeout 120s;
   }
   location /health { proxy_pass http://127.0.0.1:8787; }
   ```
   (Caddy: `reverse_proxy /ws* 127.0.0.1:8787` handles upgrades automatically.)
3. **Frontend:** `VITE_SERVER_URL=wss://race-server.example.com/ws npm run build`, then upload `dist/`
   to any static host. Without `VITE_SERVER_URL` the client uses the page's host on port 8787.
   Players can also set a server URL in Settings.
4. **Playing with a friend on another device:** the server must be reachable from their network — on a LAN
   run `npm run dev:all` and open `http://<your-LAN-IP>:5173` on both devices; over the internet use a public
   host/port (or a tunnel) for the server and share the invite link.

`docker compose up --build` (after `npm run build`) runs the server and an nginx copy of `dist/` on
`http://localhost:8080` for an end-to-end local check. See `.env.example` for every variable.

## Verified results

Run on an Apple M2 laptop, Chrome, Node 24 (2026‑10‑24):

* `npm test`: type-check clean, 32/32 tests (9 vehicle, 16 race, 7 multiplayer).
* Browser, solo: loading → menu → setup → intro → countdown → race → results → *Race again*, 6 cars,
  60 fps (display-capped) in a race; GPU geometry/texture counts stable across 4 race→menu cycles; JS heap
  returns to ~60 MB after GC.
* Browser, online: two separate browser contexts, invite link join, ready, synced start, both cars visible,
  identical results on both, rematch without reload, page reload mid-race resumes the same race with
  human control restored (bot drove meanwhile).
* Browser, mobile emulation (844×390, touch): HUD layout, multi-touch gas + steer at once, `pointercancel`
  releases inputs.
* Production build offline: server stopped + network offline → app loads from the service worker, solo race
  runs, Friends screen shows the server message.
* Server (`npm run bench`, 8 hard bots, items on): 0.24 ms per 60 Hz tick average, 0.49 ms p99 (2026‑10‑26,
  longer v2 tracks); snapshots ~1.2 KB (≈24 KB/s per client); race setup ~366 KB once, compressed on the wire.

**Not verified:** real phones/tablets (only Chrome device emulation), Safari/Firefox, the Docker image
(Docker was not installed on the test machine), deployment behind a real TLS proxy, and long sessions with
real network loss beyond the automated reconnect test. Treat performance on other devices as unknown.

## Known limitations

* Online prediction covers your own car; rivals are extrapolated, so at high latency a rival that
  brakes or turns hard can show a small correction.
* Bots overtake and avoid traffic but are not perfect in every pile-up; stuck bots reverse, then reset.
* Only procedurally generated circuits (24 named tracks plus any code); no hand-modelled tracks. The
  rear-view mirror adds a second scene render (every other frame) in hood and cockpit views.
* Engine sounds are synthesised, not recorded.
* `npm audit` was clean on 2026‑10‑24 (after `npm audit fix` moved Vite to 6.4.5). Do not expose the Vite dev server (`npm run dev`, `host: true`) on untrusted networks; use a production build.

## Assets and licences

New and redesigned cars follow [docs/VEHICLES.md](docs/VEHICLES.md) (contract, Astra prompts, workflow). All 3D models are generated by scripts in `scripts/`: the twelve cars by
`npm run model:cars` (`scripts/build-cars.mjs`, designs in `scripts/cars/`, 5.6k–7.1k triangles each), the
world pack by `model:world`; textures are drawn on canvases at runtime; all audio is synthesised in `src/audio/`.
No third-party art, music or sound files are shipped. Code libraries keep their own licences
(three.js MIT, Rapier Apache-2.0, ws MIT, Vite MIT, qrcode-generator MIT).
