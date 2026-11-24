# Internet Design reference assets

## Versions

- `/internet-design` keeps the original metallic rock player and saved defaults.
- `/internet-design/v2` is the stone-spear variation: an elongated pointed head,
  chipped shoulders and broad flaked faces with a matte geological finish.

The V1 / V2 switch opens each version. V2 has its own **Rock player · V2** DialKit
panel and defaults, with the same playback, square cover crop, video reflection,
cursor lighting, engraved wall, zoom, and sculpting controls. **Reset shape** or
the **Stone spear** preset restores V2's source silhouette. Neither action
changes the original version.

V2's **Finish** folder adds **Flake Scale**, **Detail**, and **Grain**. Its matte
stone uses a real rock height texture with coarse flake and pit relief sampled
in final model coordinates. Detail stays attached and keeps its physical density
when the outer shape is stretched. Texture source and license are recorded in
`v2/README.md`. There are no extra reflection or shadow render passes.

Rock geometry, bump map, and studio lighting are the public assets used by the
reference player at https://xkm.studio/:

- https://xkm.studio/models/marcd_stone_smooth.gltf
- https://xkm.studio/models/stone_nm_1k.jpg
- https://xkm.studio/models/studio_1k_bw.hdr

The Draco decoder files come from the installed `three` package. Keeping these
files local avoids a runtime decoder CDN dependency.

Videos reuse `src/data/feedData.js`, in the Craft grid's visible row order. The
original Craft playback has no color filter; its loading-poster blur is not a
playback effect. Video colors remain unchanged. The rock retains the reference
metallic finish and bump map.

## Stone surface compatibility

The reference bundles Three r144. This project uses r170, whose r158 bump-map
change normalized the view-space surface derivatives. That changes the strength
of the reference's `bumpScale: 0.3` at this model's scale. A material-scoped
`onBeforeCompile` patch restores the r144 derivative calculation for the stone
only, retaining geometry, metalness, roughness, environment lighting, and video
rendering. The existing DialKit Bump control continues to adjust the texture relief.

Stone detail uses triplanar sampling of the **final deformed model positions and
normals**, after both shape edits and the video-window warp. Texture density stays
constant when the rock is pulled, squeezed, or stretched. Rotating or scaling the
whole player keeps the texture attached to it. The original texture is a UV atlas;
sampling its full image would expose flat background and island seams. The shader
instead mirrors a stone-filled 350px interior patch and blends a second rotated
scale to reduce repetition. Its primary density matches the source mesh's roughly
20 texels per model unit. Three projections blend smoothly, with the projection
weights held fixed during bump-height finite differences to avoid false seams.
Anisotropic filtering keeps oblique surfaces clear. No geometry or video UVs are
changed by the material fix.

React Three Fiber 8 also automatically assigns the output color space to RGBA
byte textures on attachment. The reference resets its bump texture to linear
data in a post-attachment effect. We likewise set `NoColorSpace` after attachment,
before rendering. This texture is sampled as bump data (red channel), as on the
reference, even though its RGB image resembles a normal map.

## Light from the video

The screen softly illuminates the inward-facing walls of the rock's recess.
**Rock player → Finish → Screen Glow** controls the amount (0 disables it).
The starting rim spill is 0.62 in V1 and 0.45 in V2.
Nine samples from the existing live video texture approximate a broad area
emitter, with local direction, distance, and facing falloff. Colors use the same
centered cover crop and orientation as the displayed video and are decoded into
linear light before reflecting from the stone. Dark frames emit less light.

The effect follows the actual opening dimensions and sculpted surface, stays
inside the recess, and preserves the stone's fine bump detail. The current view
naturally exposes the top and right inner walls; rotating the rock reveals the
other illuminated walls. It reuses the player's GPU texture with no video
readback, extra lights, shadow maps, or reflection render targets.

**Rock player → Screen Light** controls the faint, video-colored light beams
extending from the opening. **Enabled** toggles them, **Strength** controls their
brightness, **Reach** their distance, **Spread** their widening, and **Haze** the
soft scattering around them. These controls are shared by both versions and are
restored by **Reset everything**. The stronger recess reflection remains under
**Finish → Screen Glow**, independently of the beams.

Research sources:

- https://xkm.studio/_next/static/chunks/pages/index-a28e8910de1499ac.js
- https://github.com/mrdoob/three.js/pull/26899
- https://github.com/mrdoob/three.js/blob/r144/src/renderers/shaders/ShaderChunk/bumpmap_pars_fragment.glsl.js
- https://github.com/mrdoob/three.js/blob/r170/src/renderers/shaders/ShaderChunk/bumpmap_pars_fragment.glsl.js

## Shape editing

Open DialKit's **Rock player → Shape** controls:

- **Width / Height / Depth** change the overall proportions around the video.
- **Presets** switch between Slab, Pebble, Spire, Crescent, and Craggy silhouettes.
- **Form** adds bending, twisting, tapering, skew, bulge, and four diagonal regions;
  together with the cardinal outline controls there are eight directional regions.
- **Outline** adjusts each side independently, edge angularity, and asymmetry.
- **Surface** adjusts broad ridges and dents; their scales change feature size.
- **Seed** changes the coherent variation. **New organic shape** creates a new
  combination of these controls while keeping the current material and playback.
- **Reset shape** restores the configured starting shape and clears brush edits.

The pencil button in the player toolbar enables direct sculpting. **Grab** drags
the selected region with the pointer; **Stretch** elongates it; **Push** makes a
broad inward dent. **Pull**, **Dent**, and **Smooth** provide surface brushes.
**Rock player → Sculpt** contains the larger brush size and strength controls.
Undo a complete stroke with the toolbar button, DialKit's
**Undo stroke**, or Cmd/Ctrl+Z. Escape exits sculpting. **Clear brush edits** keeps
the procedural shape; **Reset everything** restores all configured defaults.

Sculpting temporarily stops pointer tilt and freezes the camera during each
stroke. The video is centered on its own fixed anchor. A protected region follows
the actual tilted aperture and extends through the recess walls and collar.
Neither procedural controls nor brush edits can move those vertices. The stone's
UVs remain intact for the video and source asset, while the stone detail uses
deformation-independent projection. Seam normals are reconciled after deformation.
Continuous, seeded fields and bounded edits retain the original surface character.

## Video window

The starting window is square (1:1). Wider videos are cropped equally at the
sides to fill it; portrait videos crop vertically, without stretching.

**Rock player → Video Window** controls the opening independently of the outer
rock. Adjust **Aspect Ratio**, **Width**, or **Height**; they stay synchronized.
The square, 16:9, and 9:16 buttons provide quick starting proportions. Changing
the ratio retains the current window area where the available space permits.

The video surface and surrounding stone recess resize together around the fixed
center. Large windows fit inside the current stone outline. Playback uses a
centered cover crop at the actual window ratio, so the video fills the opening
with its proportions preserved. Resizing keeps the outer shape and existing
brush history; **Reset video window** restores only the configured starting opening.

## Engraved Figma wall and shared light

The background uses the original vector from Figma file
`QlJpNHbgxxDORGuoqwR35J`, node `15:494`, saved locally as
`figma/new-stone-age.svg` (1931 × 684). Its letterforms, positions, and aspect ratio
are preserved. Only the baked lighting is replaced with scene lighting.

On first load, `backdropRelief.js` rasterizes the vector once at 2048px and builds
clean and worn inset-bevel normals. The maps are cached across component mounts.
One opaque wall plane uses the same color, roughness, metalness, and fine stone
grain inside and outside the lettering. Only its normals change at the cuts.
There are no separate floating letters, animation, or whole-word drop shadows.
The artwork can be moved or scaled within this continuous wall without revealing
a panel edge. All normal maps remain linear after React Three Fiber attaches them.

**Wear** blends toward softened, unevenly eroded cuts and patchy shallow areas;
the Figma letterforms and their layout stay intact. **Grain** controls the same
fine surface detail across the entire wall. Both are live GPU adjustments with
no texture regeneration. No extruded letter geometry or shadow-map passes are used.

One cursor-driven point light illuminates both the rock and the lettering. Both
the light and wall reveal follow the current pointer on the next rendered frame,
without easing or trailing. The saved **Smoothing** value applies only to edits
of light distance, height, and range. The studio HDR supplies adjustable ambient
fill for the rock. Light intensity starts at 40 and can be adjusted from 0 to 40
in DialKit. The carving has no HDR or ambient contribution: a soft, localized
pool follows the same current cursor, revealing only bevels facing the source.
Its falloff reaches exactly zero, so all unlit carving returns to the identical
dark wall base instead of retaining an outline. Flat-wall fill uses grain-only
normals and cannot reveal the letterforms from their back-facing edges.

The flat wall uses minimal reflection by default, with a stable dark base.
The engraved bevels remain responsive to the shared cursor light. **Wall Reflection**
controls how much lighting reaches the flat surface independently of the cuts.

Open **Rock player → Backdrop** for visibility, color, scale, horizontal/vertical
offset, depth, relief, metalness, roughness, wear, grain, and wall reflection.
**Lighting** controls cursor following, intensity, distance from the scene, cursor
range, vertical offset, color, smoothing, and ambient fill. **Wall Radius**,
**Wall Softness**, and **Carving Contrast** tune the localized reveal without
regenerating textures. **Reset everything**
restores these controls along with the existing saved player and shape defaults.

The rock starts collapsed. Clicking it or using **Expand player** moves only the
rock toward the camera until the video center reaches 200% of its collapsed
apparent size. Each transition takes 1.2 seconds with `cubic-bezier(0.5, 0, 0, 1)`;
a second click or Escape reverses smoothly from the current position. Camera
position, camera zoom, wall framing, and wall lighting remain unchanged during
this move. Sculpt strokes never trigger zoom and pause an active approach while
the brush plane is captured. Reduced motion skips the transition.
