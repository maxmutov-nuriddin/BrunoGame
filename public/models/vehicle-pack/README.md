# Vehicle pack

Six original procedural models. Each GLB is self-contained, with PBR materials and no external textures.

Coordinates: metres, +Y up, -Z forward, ground at Y=0. Wheel_0/1 are front left/right; Wheel_2/3 are rear left/right. Each wheel has its own centre pivot and rotates around local X. Steering requires a parent pivot around Y. Collider, mass and suspension settings must be tuned per vehicle; GLB stores the visuals, not a physics engine. Dimensions and wheel configuration are in manifest.json.

Rebuild and validate: `node scripts/build-vehicle-pack.mjs`.
