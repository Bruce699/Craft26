# V2 rock surface

V2 no longer loads a texture from this folder. Its surface is baked at load
time by `src/internet-design/flintSurface.js`, which models the point the way
one is knapped: a lens-shaped blank reduced by a sequence of flake removals.
The bake runs in a worker and produces both the mesh's thickness field and one
RGBA relief map (slope in RG, tone in B, roughness in A).

## Unused asset

`rock_face_03_disp_1k.png` is the unmodified 1K displacement map from
[Rock Face 03 on Poly Haven](https://polyhaven.com/a/rock_face_03), which the
previous triplanar V2 material sampled. Nothing references it now; it is kept
only so the earlier look can be restored.

- Photography: Dario Barresi. Processing: Rico Cilliers.
- License: [CC0](https://polyhaven.com/license).
- Source metadata: [official files API](https://api.polyhaven.com/files/rock_face_03).
- Download: [1K PNG displacement](https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/rock_face_03/rock_face_03_disp_1k.png).
- Image: 1024 × 1024, 16-bit grayscale, 1,592,817 bytes.
- Verified source MD5: `5eb2e547a36e322462da3fba4c6125bb`.
