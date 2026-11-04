# V2 rock surface

`rock_face_03_disp_1k.png` is the unmodified 1K displacement map from
[Rock Face 03 on Poly Haven](https://polyhaven.com/a/rock_face_03).

- Photography: Dario Barresi. Processing: Rico Cilliers.
- License: [CC0](https://polyhaven.com/license).
- Source metadata: [official files API](https://api.polyhaven.com/files/rock_face_03).
- Download: [1K PNG displacement](https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/rock_face_03/rock_face_03_disp_1k.png).
- Image: 1024 × 1024, 16-bit grayscale, 1,592,817 bytes.
- Verified source MD5: `5eb2e547a36e322462da3fba4c6125bb`.

V2 reads this as linear height data (`NoColorSpace`) through the material's
`bumpMap`, using triplanar projection on the final sculpted surface. Repeat
wrapping and mipmapped filtering retain the natural weathered clusters without
stretching the original model's UV atlas. It adds no geometry or rendering pass.
