# Nitro Clash — vehicle spec and Astra prompts

Twelve cars: the six existing ones redesigned to one consistent, professional style, plus six new
classes. Every GLB must pass `npm run model:check -- path/to/car.glb` before it goes into
`public/models/`.

## 1. Technical contract (the game code depends on this)

| Rule | Value |
| --- | --- |
| Units / axes | 1 unit = 1 m, +Y up, **front of the car faces −Z** |
| Origin | centre of the chassis (not the ground) |
| Size | width ≤ 2.3 m, length 3.4–4.8 m (aim 4.0), height ≤ 2.2 m |
| Wheel nodes | `Wheel_0` front-left (−0.97, −0.28, −1.30), `Wheel_1` front-right (0.97, −0.28, −1.30), `Wheel_2` rear-left (−0.97, −0.28, 1.30), `Wheel_3` rear-right (0.97, −0.28, 1.30); tolerance 0.25 m |
| Wheel | radius 0.35 m; each wheel is its own node with the tyre + rim under it, pivot at the axle centre (it spins about X) |
| Materials | body paint material named **`Paint`** (the game will recolour it per player); tail lights named **`BrakeLights`** (the game brightens it when braking) |
| Budget | **≤ 25 000 triangles** per car (hard limit 40 000); tyre tread in the texture/normal map, not geometry |
| Textures | ≤ 1024 px, PBR (base colour, metal/rough, normal), embedded in the GLB |
| No | logos, badges, readable text, real number plates, real car brands or copies of real models, copies of Blur cars |

`npm run model:check` verifies everything above except the "No" row and the PBR look.

**Current state (2026‑10‑26):** all twelve cars exist as code-generated models (`npm run model:cars`,
designs in `scripts/cars/designs.mjs`) that pass the check at 5.6k–7.1k triangles. They are a stylized
baseline: an Astra model that passes the check can replace any of them by dropping the GLB into
`public/models/` under the same file name, with no code change. `npm test` fails if any roster car's GLB is
missing or breaks the contract.

## 2. Shared style block (paste before every car prompt)

> Stylized premium low-poly racing car for a browser arcade combat racer. Clean confident silhouette
> readable from 30 metres, smooth bevelled panels, chunky proportions slightly exaggerated (wide stance,
> large wheels, short overhangs). PBR materials: glossy clear-coat body paint as one separate material,
> dark satin trim, tinted glass, chrome or machined alloy rims, matte rubber tyres with tread in the
> texture. Emissive white headlights, emissive red tail lights as a separate material, small blue-glowing
> nitro exhaust tips. Original design, no logos, no text, no badges, no number plates, not based on any
> real car. Game-ready: about 20k triangles, four separate wheel objects pivoted at the axle centre,
> front of the car facing negative Z, origin at the chassis centre, real-world scale about 4 m long and
> 1.9 m wide.

## 3. The twelve cars

Handling numbers are tuned in `shared/vehicles.ts` once the models are in; "Role" is what each car must
feel like and look like.

### Redesigns (keep id and file name)

| # | Name (id → file) | Role | Car prompt (after the style block) | Paint |
| --- | --- | --- | --- | --- |
| 1 | Nitro GT (`bruno-gt` → `bruno-gt.glb`) | Balanced all-rounder | Modern two-door sports coupe, balanced proportions, sculpted side intakes, fastback roof, small lip spoiler, twin central exhaust. | electric red |
| 2 | Atlas Hauler (`atlas-hauler` → `atlas-hauler.glb`) | Heavy hitter | Short-bed heavy pickup truck, raised body, steel push bar on the front, boxed fender flares, roof light bar, rugged all-terrain tyres. **Width ≤ 2.3 m including flares.** | olive green |
| 3 | Pixel Hatch (`pixel-hatch` → `pixel-hatch.glb`) | Quick launch, sharp steering | Compact three-door hot hatch, short and tall, flared arches, roof spoiler, wide grille, playful rounded lights. | sunny yellow |
| 4 | Nova Coupe (`nova-coupe` → `nova-coupe.glb`) | Highest top speed, fragile | Low mid-engine wedge supercar, very low nose, canopy-style cockpit, long rear deck with active wing, side air channels. | pearl white with cyan accents |
| 5 | Courier Van (`courier-van` → `courier-van.glb`) | Tough, forgiving, slow | Short-wheelbase delivery van, boxy rounded shape, sliding side door, roof rack, reinforced bumpers. **Height ≤ 2.1 m including the rack.** | tangerine orange |
| 6 | Dune Jumper (`dune-jumper` → `dune-jumper.glb`) | Best in the air | Two-seat off-road buggy, exposed tube roll cage, long-travel suspension arms visible, big knobby tyres, roof spotlights. **Width ≤ 2.3 m including tyres.** | sand beige with black cage |

### New classes

| # | Name (id → file) | Role | Car prompt (after the style block) | Paint |
| --- | --- | --- | --- | --- |
| 7 | Vandal V8 (`vandal-v8` → `vandal-v8.glb`) | Drift king, rear-wheel drive, heavy nose | Classic-inspired muscle coupe, long bonnet with a raised power bulge, short rear deck, wide rear tyres, side exhaust pipes. | deep purple |
| 8 | Gravel Fox (`gravel-fox` → `gravel-fox.glb`) | Rally: grip on jumps and rough landings | Rally hatchback, roof scoop, mud flaps, four extra round lamps on the bonnet, raised suspension, gravel tyres. | white with orange stripes |
| 9 | Volt Arrow (`volt-arrow` → `volt-arrow.glb`) | Electric: instant launch, drift refills more nitro | Sleek electric fastback, closed smooth front with a thin light bar, flush handles, aero wheel covers, glowing blue underbody line. | graphite grey |
| 10 | Kei Bolt (`kei-bolt` → `kei-bolt.glb`) | Tiny, agile, fragile | Tiny boxy city micro car, tall cabin, very short bonnet, small wheels pushed to the corners, cute round lights. **Length 3.4–3.6 m.** | mint green |
| 11 | Sundown Roadster (`sundown-roadster` → `sundown-roadster.glb`) | Best grip and handling, low health | Open-top two-seat roadster, low windscreen, twin roll hoops behind the seats, long elegant bonnet, retro round headlights. | cherry red |
| 12 | Hornet RS (`hornet-rs` → `hornet-rs.glb`) | Nitro specialist: strongest boost, burns fast | Street-tuned compact coupe, huge rear wing, wide body kit, front splitter, big visible nitro tanks behind the rear window. | black with yellow accents |

## 4. Workflow per car

1. Generate in Astra with *style block + car prompt*, export GLB.
2. If Astra cannot name nodes or materials, rename them in Blender: the four wheel objects to `Wheel_0..3`,
   the body paint material to `Paint`, the tail-light material to `BrakeLights`. Apply scale, put the origin
   at the chassis centre, and export glTF with +Y up and the front facing −Z.
3. Run `npm run model:check -- path/to/vandal-v8.glb`. Fix every `error`; try to fix every `warn`.
4. Copy the file into `public/models/` under the name in the table. New cars also need an entry in
   `shared/vehicles.ts` (id, name, role, file, handling).
