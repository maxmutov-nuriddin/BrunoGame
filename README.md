# Nitro Clash — arcade combat racing

A browser arcade combat racer inspired by the *feel* of games like Blur (grid, countdown, drifting, nitro,
weapons, bots and private online races). All names, cars, tracks, UI, music and sound are original.

Stack: three.js 0.179, Rapier 0.17 (compat build), Vite 6, TypeScript shared simulation, and serverless
online play (WebRTC between players, Firebase for finding rooms and accounts). Sound is synthesised live
with the Web Audio API.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173 — solo, and online between tabs of this browser
```

No server to run: online rooms are hosted in a player's browser and found through Firebase
(see [Online play and deployment](#online-play-and-deployment)). Without Firebase settings, `npm run dev`
still lets you try online play between tabs of the same browser.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev client |
| `npm run build` | Production build in `dist/` (includes the generated `sw.js`) — upload to Netlify |
| `npm run preview` | Serve `dist/` locally (the only way to try offline mode) |
| `npm test` | Type-check, then the vehicle, race, lobby, peer-link and multiplayer suites |
| `npm run test:vehicle` | Handling: acceleration, braking, steering, nitro, drift per car |
| `npm run test:race` | Track generator, race rules, items, bots, finish/DNF, barriers at 300 km/h |
| `npm run test:multiplayer` | The game host with in-memory links: lobby, race, rematch, reconnect, 8 clients, quick play |
| `npm run model:cars` | Rebuild the car GLBs (meshopt-compressed) from `scripts/cars/` |
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
  before GO bogs the engine. Online, the client may claim its press up to 4 ticks (~67 ms) before the host
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

**Promo car.** Phantom E (electric hypercar, 0–100 in 1.0 s, 300 km/h) is hidden from the garage, the lobby
and the bots. Redeeming its promo code in Settings → Promo code unlocks it on that device (stored in
localStorage) and, with Firebase, on the player's account. Only a salted SHA-256 hash of the code is in
the source (`src/core/promo.js`). Online, the host does not check unlocks, so it is not anti-cheat.

## Architecture

```
shared/        TypeScript used by the browser and the tests
  physics/     Rapier world wrapper, VehiclePhysics (ray-cast vehicle + arcade drift/nitro/air control)
  track/       seeded generator, validation, fallback track, colliders, racing line, presets
  race/        RaceSimulation (rules, laps, items, damage, respawn), bots, combat, events
  net/         protocol (strictly validated messages), compact snapshots
  host/        HostServer: rooms, lobby state machine, 60 Hz authoritative races, reconnect —
               runs in the hosting player's browser (and in tests)
  lobby/       lobby directory contract and quick-play matching (10 s held seats)
src/           browser client
  game/        top-level flow (Loading → Menu → … → Results)
  race/        local & online sessions, view, HUD, camera, effects, engine audio
  net/         NetClient (one session over any link), OnlineService, AccountSync,
               backend/ (Firebase or the dev stand-in), p2p/ (WebRTC links, host session)
  core/ ui/ audio/ scenes/
```

**Tracks** come from one `TrackDefinition` (`shared/track/generator.ts` + `layouts.ts`,
`GENERATOR_VERSION = 2`), 2.1–3.2 km long in a ±440 m world. Every seed picks a **layout** and a **theme**:

| Layout | What it is |
| --- | --- |
| `loop` | 12–17 control points with 2–3 hairpins |
| `figure8` | crosses itself once on an overpass: the deck clears the road below by 8.5 m (validated ≥ 6.5 m), 150 m ramps, pillars kept off the lower road |
| `island` | islets in the sea joined by two bridges over open water |

Themes (visual only): meadow, desert, snow, dusk city, island. 40 named tracks fix both (every layout ×
theme combination, listed in `shared/track/presets.ts`); "🎲 Random map" (Solo and lobby host) picks one of
them, and any other code gets its own layout and theme, so new codes keep giving new circuits. Each track has elevation, a jump crest with a straight landing, 18 m road,
checkpoints every ~70 m, 8 grid slots on a flat straight, 4 rows of item boxes and a braking-aware racing
line. Road and barrier colliders, the visual mesh, bot paths and checkpoints are all built from it.
`validateTrack` checks continuity, minimum radius, self-clearance, world bounds, grades, landing straight,
grid, checkpoint order, pickups and the racing line; failing seeds retry deterministically
(`seed|attempt`, up to 60 tries; none of 120 random seeds needed the fallback) and finally fall back to a
hand-placed circuit. On an overpass, checkpoints and item boxes stay off the crossing, the car locator
weighs height so a car below is never placed on the deck, and barriers under a deck stop 1.4 m below the
road so the road beneath is open. Same seed + generator version → same track (tested by fingerprint). Online, the host sends the full definition so clients can never disagree.

**Multiplayer** is host-authoritative and serverless. The player who creates a room runs the same
authoritative `HostServer` (`shared/host/`) in their browser that a dedicated server would run; guests link
to it peer-to-peer over WebRTC data channels (a reliable channel for lobby and race setup, an unordered
no-retransmit one for snapshots and inputs). There is no TURN server: when a direct link cannot open within
8 s (strict NATs), that guest's traffic goes through the Firebase Realtime Database instead (slower, but it
works). The host player itself connects through an in-page loopback link. Messages, prediction and
reconciliation are unchanged from the server design: guests send only inputs (`[seq, tick, throttle,
steer, buttons]`, 30 Hz batches); the host runs physics at 60 Hz and sends 20 Hz snapshots with the last
applied input `ack`. Each guest predicts its own car in a client-side Rapier world, drawn between physics
ticks, and reconciles to the host (rewind to `ack`, replay newer inputs; position and rotation errors are
blended out, big ones snap; tolerances widen with speed). Rivals are drawn at their extrapolated present
with velocity blending, so a new snapshot bends their path instead of jerking it. The client clock is
slewed toward each new estimate rather than jumping. The host never trusts positions, speed, damage, laps
or finish claims from a guest and validates every message with the strict parser. Press F3 in a race for
FPS, ping, replays per second and the last correction size.

**Quick play (Play Online):** Start looks in the lobby directory (Firestore) for an open public room with a
free seat and holds that seat for 10 s. "Ready" links to its host and takes the seat; letting it lapse frees
the seat and stops your search. With nothing to join, your browser opens a public room and waits. With 3
players in, a 15 s countdown lets more join (up to 8, no bots), then the race starts and the room is locked
and delisted. After the race, "Find next race" searches again (`shared/lobby/quickPlay.ts`, protocol v3).

**Lobby:** 6-character room codes shown large with a QR code of the invite link `?room=CODE`, car cards
with stats, 2–8 slots, bots fill empty slots (optional), ready/unready, host-only settings (track, laps,
bot difficulty, slots, items), locked during a race. The room lives in the host's browser: the lobby tells
the host to keep the tab open, and when the host leaves or closes it, guests are told the host left and
return to the online screen. The host's race loop runs on a worker timer, so it keeps going in a
background tab.

**Disconnects:** a guest's car is bot-driven while it is away; the guest re-links and resumes with a token
kept in `sessionStorage` (also after a page reload) and gets the room, race setup, start time and a full
snapshot. 20 s grace in the lobby, 60 s in a race, then DNF.

**Accounts (Firebase):** everyone plays signed in anonymously; Settings → Account → "Sign in with Google"
links Google to the same account, so name, chosen car and promo unlocks follow the player to other devices
(`src/net/AccountSync.js`). Security rules (`firestore.rules`, `database.rules.json`) let players change
only their own profile and lobby entry, reserve only their own seat, read their own mail, and add an
unlocked car only through an existing promo code document.

**Hardening:** strict per-message validation, 8 KB limit for guest messages, per-link rate limit (90/s,
burst 180, sustained abuse closes the link), only the host's own connection can create rooms, 3 room
creations per minute, a 3 s cooldown between race starts. Peer-to-peer means the host's browser is trusted
for its own room: fine for friends and casual quick play, not for ranked play (there is no leaderboard).

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
and run with no network**; the online screens say that online races need internet. New versions install in the background and are offered from the main menu
("Update ready · restart"), never activated mid-race. Settings, the chosen car and time-trial records are
in `localStorage` under versioned keys (`bruno-race:settings` v3, `bruno-race:records` v1; the key names are
kept from the project's earlier name so existing saves still load).

## Online play and deployment

The whole game is a static site (Netlify); online play needs a free Firebase project and nothing else.

1. **Firebase project** (console.firebase.google.com):
   * Authentication → Sign-in method: enable **Anonymous** and **Google**.
   * Create a **Firestore** database and a **Realtime Database**.
   * Project settings → Your apps → add a **Web app** and copy its config into `.env` (see `.env.example`):
     `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
     `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_APP_ID`. These identify the project; they are not secrets.
   * Deploy the rules: `npx firebase-tools deploy --only firestore:rules,database` (uses `firebase.json`).
   * Authentication → Settings → Authorized domains: add your Netlify domain.
   * Promo codes on accounts: add a Firestore document `promoCodes/<hash>` with field `vehicleId`, where
     `<hash>` is `promoHash(code)` from `src/core/promo.js` (salted SHA-256). Codes built into
     `PROMO_HASHES` also work offline, on the device only.
2. **Netlify:** build command `npm run build`, publish directory `dist` (see `netlify.toml`); add the same
   `VITE_FIREBASE_*` variables under Site settings → Environment variables.
3. **Free-tier limits** (Spark plan): Firestore 50k reads / 20k writes a day, Realtime Database 100
   simultaneous connections and 10 GB a month. Direct WebRTC races use neither while racing; only relayed
   guests (no direct link) send race traffic through the Realtime Database.

## Verified results

Run on an Apple M2 laptop, Chrome, Node 24 (2026‑10‑24):

* `npm test`: type-check clean, 42/42 tests (9 vehicle, 17 race, 4 lobby, 3 peer-link, 9 multiplayer)
  (2026‑10‑27, serverless).
* Browser, solo: loading → menu → setup → intro → countdown → race → results → *Race again*, 6 cars,
  60 fps (display-capped); simulation 0.56 ms per frame for 6 cars (was 6 ms before hard CCD was limited
  to fast cars).
* Browser, online without Firebase (dev stand-in, two tabs, 2026‑10‑27): friends room by invite link over a
  direct WebRTC link, race with snapshots every 50 ms; quick play offer → Ready → seat taken; with WebRTC
  blocked in the guest tab, the relay carried the lobby and a full race; host leaving sends guests back with
  "The host has left the game".
* Browser, mobile emulation (844×390, touch): HUD layout, multi-touch gas + steer at once, `pointercancel`
  releases inputs.
* Production build offline: network offline → app loads from the service worker, solo race runs.
* `npm run bench` (8 hard bots, items on): snapshots ~1.2 KB (≈24 KB/s per guest); race setup ~430 KB once
  (chunked over data channels and the relay).

**Not verified:** the Firebase backend against a real project (no project was available: the directory,
mailbox, accounts and rules are written to the documented APIs but untested), WebRTC between two different
networks, real phones/tablets, Safari/Firefox, and long sessions with real network loss. Treat these as
unknown until tried.

## Known limitations

* Online prediction covers your own car; rivals are extrapolated, so at high latency a rival that
  brakes or turns hard can show a small correction.
* A room lives in its host's browser: if the host leaves or closes the tab, the room ends for everyone
  (no host migration). The host has zero latency and runs the authoritative simulation.
* No TURN server: guests behind strict NATs use the Realtime Database relay, which adds latency.
* Bots overtake and avoid traffic but are not perfect in every pile-up; stuck bots reverse, then reset.
* Only procedurally generated circuits (40 named tracks plus any code); no hand-modelled tracks. The
  rear-view mirror adds a second scene render (every other frame) in hood and cockpit views.
* Engine sounds are synthesised, not recorded.
* `npm audit` was clean on 2026‑10‑24 (after `npm audit fix` moved Vite to 6.4.5). Do not expose the Vite dev server (`npm run dev`, `host: true`) on untrusted networks; use a production build.

## Assets and licences

New and redesigned cars follow [docs/VEHICLES.md](docs/VEHICLES.md) (contract, Astra prompts, workflow). All 3D models are generated by scripts in `scripts/`: the twelve cars by
`npm run model:cars` (`scripts/build-cars.mjs`, designs in `scripts/cars/`, 5.6k–7.1k triangles each), the
world pack by `model:world`; textures are drawn on canvases at runtime; all audio is synthesised in `src/audio/`.
No third-party art, music or sound files are shipped. Code libraries keep their own licences
(three.js MIT, Rapier Apache-2.0, Firebase JS SDK Apache-2.0, Vite MIT, qrcode-generator MIT; build-only: glTF-Transform MIT, meshoptimizer MIT).

Promo kod: PHANTOM-EJMU-438D-N32F