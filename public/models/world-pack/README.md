# World pack

Original self-contained GLB assets. Metres, Y up. Ground surfaces are at Y=0; decorative paint is offset a few millimetres to prevent z-fighting. No external textures.

Grass: repeat every 160 m on X/Z. Road: repeat every 160 m on Z; 40 m asphalt plus two 8 m shoulders. Road dash and curb periods divide tile length.

Plaza clearances refer to central driving space. Decorative structures remain outside it; overhead cables are above vehicle height. GalleryFace_0 through GalleryFace_4 are blank image surfaces.

Kits use spaced display layouts. Extract named groups and reset their position to place them independently; their local origins are at ground level. Jump_01 and Jump_02 have local ground origins. Border_0 through Border_7 share the world-centre origin and form an inner radius of 320 m; keep their transforms together. InnerFloor is separate.

Knockable props are separate files with geometric-centre origins and fewer than 1000 triangles each. GLB contains visuals; add colliders, rigid bodies and physics materials in the game.

Rebuild and validate with node scripts/build-world-pack.mjs. See manifest.json for dimensions and triangle counts.
