import * as THREE from 'three'

let grainTexture

function getWallGrainTexture() {
  if (grainTexture) return grainTexture
  const side = 256
  const height = new Float32Array(side * side)
  const pixels = new Uint8Array(side * side * 4)
  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295
  }
  const noise = (x, y, cells) => {
    const ix = Math.floor(x), iy = Math.floor(y)
    let u = x - ix, v = y - iy
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v)
    const a = hash(ix % cells, iy % cells), b = hash((ix + 1) % cells, iy % cells)
    const c = hash(ix % cells, (iy + 1) % cells), d = hash((ix + 1) % cells, (iy + 1) % cells)
    return a + (b - a) * u + (c + (d - c) * u - a - (b - a) * u) * v
  }
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    height[y * side + x] = noise(x / side * 16, y / side * 16, 16) * 0.45
      + noise(x / side * 64, y / side * 64, 64) * 0.35
      + noise(x / side * 128, y / side * 128, 128) * 0.2
  }
  const sample = (x, y) => height[((y + side) % side) * side + (x + side) % side]
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const k = (y * side + x) * 4
    const dx = (sample(x + 1, y) - sample(x - 1, y)) * 1.8
    const dy = (sample(x, y + 1) - sample(x, y - 1)) * 1.8
    const length = Math.hypot(dx, dy, 1)
    pixels[k] = Math.round((-dx / length * 0.5 + 0.5) * 255)
    pixels[k + 1] = Math.round((-dy / length * 0.5 + 0.5) * 255)
    pixels[k + 2] = Math.round((1 / length * 0.5 + 0.5) * 255)
    pixels[k + 3] = Math.round(height[y * side + x] * 255)
  }
  grainTexture = new THREE.DataTexture(pixels, side, side, THREE.RGBAFormat)
  grainTexture.name = 'Continuous wall stone grain'
  grainTexture.colorSpace = THREE.NoColorSpace
  grainTexture.wrapS = grainTexture.wrapT = THREE.RepeatWrapping
  grainTexture.magFilter = THREE.LinearFilter
  grainTexture.minFilter = THREE.LinearMipmapLinearFilter
  grainTexture.generateMipmaps = true
  grainTexture.needsUpdate = true
  return grainTexture
}

// The wall is one opaque material, including the recessed lettering. Only its
// normals change at glyphs: no cutout, separate letter color, or cast shadow.
export function createWallSurface(maps) {
  const grainMap = getWallGrainTexture()
  const uniforms = {
    wallWornNormal: { value: maps.wornNormalMap },
    wallGrainMap: { value: grainMap },
    wallArtworkRepeat: { value: new THREE.Vector2(1, 1) },
    wallArtworkOffset: { value: new THREE.Vector2() },
    wallGrainRepeat: { value: new THREE.Vector2(1, 1) },
    wallWear: { value: 0.6 },
    wallGrain: { value: 0.35 },
    wallReflection: { value: 0.035 },
    wallLightPosition: { value: new THREE.Vector3(0, 60, 100) },
    wallFocus: { value: new THREE.Vector2() },
    wallLightColor: { value: new THREE.Color('#ffffff') },
    wallLightIntensity: { value: 5 },
    wallRadius: { value: 48 },
    wallSoftness: { value: 0.55 },
    wallContrast: { value: 2.2 },
  }
  return {
    uniforms,
    grainMap,
    cacheKey: () => 'continuous-carved-wall-v4-far-depth',
    onBeforeCompile(shader) {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWallWorldPosition;')
        .replace('#include <project_vertex>', `
          vWallWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
          #include <project_vertex>
          // Shade the wall only where foreground geometry left the depth buffer clear.
          gl_Position.z = gl_Position.w;
        `)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', /* glsl */`
          #include <common>
          uniform sampler2D wallWornNormal;
          uniform sampler2D wallGrainMap;
          uniform vec2 wallArtworkRepeat;
          uniform vec2 wallArtworkOffset;
          uniform vec2 wallGrainRepeat;
          uniform float wallWear;
          uniform float wallGrain;
          uniform float wallReflection;
          varying vec3 vWallWorldPosition;
          uniform vec3 wallLightPosition;
          uniform vec2 wallFocus;
          uniform vec3 wallLightColor;
          uniform float wallLightIntensity;
          uniform float wallRadius;
          uniform float wallSoftness;
          uniform float wallContrast;
        `)
        .replace('#include <normal_fragment_maps>', /* glsl */`
          float wallCarvingResponse = 0.0;
          vec3 wallCarvedNormal = nonPerturbedNormal;
          vec3 wallFlatNormal = nonPerturbedNormal;
          #ifdef USE_NORMALMAP_TANGENTSPACE
            vec2 artworkUv = (vNormalMapUv - 0.5) * wallArtworkRepeat + 0.5 + wallArtworkOffset;
            float insideArtwork = step(0.0, artworkUv.x) * step(artworkUv.x, 1.0)
              * step(0.0, artworkUv.y) * step(artworkUv.y, 1.0);
            vec3 cleanNormal = texture2D(normalMap, artworkUv).xyz * 2.0 - 1.0;
            vec3 wornNormal = texture2D(wallWornNormal, artworkUv).xyz * 2.0 - 1.0;
            vec3 mapN = normalize(mix(cleanNormal, wornNormal, wallWear));
            mapN = mix(vec3(0.0, 0.0, 1.0), mapN, insideArtwork);
            // Classify only the engraving slopes, before adding wall grain.
            // Subtract the RGBA8 neutral-normal bias so flat letter interiors
            // receive exactly the same lighting response as the surrounding wall.
            vec2 carvingGradient = max(abs(mapN.xy) - vec2(0.005), vec2(0.0)) * abs(normalScale);
            wallCarvingResponse = smoothstep(0.01, 0.1, length(carvingGradient));
            mapN.xy *= normalScale;
            wallCarvedNormal = normalize(tbn * normalize(mapN));
            vec3 stoneGrain = texture2D(wallGrainMap, vNormalMapUv * wallGrainRepeat).xyz * 2.0 - 1.0;
            wallFlatNormal = normalize(tbn * normalize(vec3(stoneGrain.xy * wallGrain * 0.4, 1.0)));
            mapN.xy += stoneGrain.xy * wallGrain * 0.4;
            normal = normalize(tbn * normalize(mapN));
          #endif
        `)
        .replace('#include <lights_fragment_end>', /* glsl */`
          #include <lights_fragment_end>
          float radius = max(wallRadius, 0.001);
          float beamDistance = length(vWallWorldPosition.xy - wallFocus);
          float beam = 1.0 - smoothstep(radius * (1.0 - clamp(wallSoftness, 0.1, 1.0)), radius, beamDistance);
          vec3 lightDirection = normalize((viewMatrix * vec4(wallLightPosition, 1.0)).xyz + vViewPosition);

          // A one-sided tangential gate lights only bevels facing the source.
          // Normalize the tangents so a nearly frontal source still reveals
          // direction; ambient light cannot draw a persistent glyph outline.
          vec3 bevelTangent = wallCarvedNormal - nonPerturbedNormal * dot(wallCarvedNormal, nonPerturbedNormal);
          vec3 lightTangent = lightDirection - nonPerturbedNormal * dot(lightDirection, nonPerturbedNormal);
          float side = max(dot(bevelTangent / max(length(bevelTangent), 0.0001), lightTangent / max(length(lightTangent), 0.0001)), 0.0);
          float carvingLight = beam * wallCarvingResponse * pow(side, 1.5) * wallContrast;

          // Flat-wall fill is computed from grain alone, never the carved
          // normals. Back-facing cuts therefore match the surrounding wall.
          vec3 flatFill = wallLightColor * wallLightIntensity * material.diffuseColor * RECIPROCAL_PI
            * max(dot(wallFlatNormal, lightDirection), 0.0) * clamp(wallReflection, 0.0, 1.0) * beam;
          reflectedLight.directDiffuse = reflectedLight.directDiffuse * carvingLight + flatFill;
          reflectedLight.directSpecular *= carvingLight;
          reflectedLight.indirectDiffuse = vec3(0.0);
          reflectedLight.indirectSpecular = vec3(0.0);
          // At/outside the beam both reflected channels are exactly zero.
          // Identical unmasked emissive radiance is the wall's sole dark base.
        `)
    },
  }
}
