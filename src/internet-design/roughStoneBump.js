import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, UnsignedByteType, Vector2, Vector3 } from 'three'
import { GRADIENT_RANGE, SURFACE_BOUNDS, flintSurface } from './flintSurface.js'

const bounded = (value, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback))

// `bladeFrame` places the baked relief on the model; without one the uniforms
// are still valid and the stone simply shades as its smooth mesh.
export function createRoughStoneUniforms(settings = {}, bladeFrame) {
  return {
    roughStoneDetail: { value: bounded(settings?.detail, 1, 0, 2) },
    roughStoneGrain: { value: bounded(settings?.grain, 0.5, 0, 1) },
    roughStoneOrigin: { value: bladeFrame?.origin.clone() ?? new Vector3() },
    roughStoneU: { value: bladeFrame?.u.clone() ?? new Vector3(1, 0, 0) },
    roughStoneV: { value: bladeFrame?.v.clone() ?? new Vector3(0, 1, 0) },
    roughStoneNormal: { value: bladeFrame?.normal.clone() ?? new Vector3(0, 0, 1) },
    roughStoneMin: { value: new Vector2(SURFACE_BOUNDS.u, SURFACE_BOUNDS.v) },
    roughStoneSize: { value: new Vector2(SURFACE_BOUNDS.width, SURFACE_BOUNDS.height) },
  }
}

/** The flaked surface as one RGBA map: slope (rg), tone (b), roughness (a). */
export function createFlintReliefTexture() {
  const surface = flintSurface()
  const texture = new DataTexture(surface.relief, surface.cols, surface.rows, RGBAFormat, UnsignedByteType)
  texture.colorSpace = NoColorSpace
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

const surfaceVaryings = /* glsl */`
#ifdef USE_BUMPMAP
  varying vec3 vStonePosition;
  varying vec3 vStoneNormal;
#endif
`

const surfaceUniforms = /* glsl */`
  uniform mat3 normalMatrix;
  uniform float roughStoneDetail;
  uniform float roughStoneGrain;
  uniform vec3 roughStoneOrigin;
  uniform vec3 roughStoneU;
  uniform vec3 roughStoneV;
  uniform vec3 roughStoneNormal;
  uniform vec2 roughStoneMin;
  uniform vec2 roughStoneSize;
  #ifdef USE_BUMPMAP
    uniform sampler2D bumpMap;
    uniform float bumpScale;
    vec4 roughStoneRelief;
    float roughStoneFacing;
  #endif
`

// One fetch per fragment. Slopes are stored, not heights, so magnifying the
// map never facets into texels the way a differentiated height map does.
const reliefSample = /* glsl */`
  #ifdef USE_BUMPMAP
    vec3 roughStoneOffset = vStonePosition - roughStoneOrigin;
    vec2 roughStoneUv = (vec2(dot(roughStoneOffset, roughStoneU), dot(roughStoneOffset, roughStoneV)) - roughStoneMin) / roughStoneSize;
    roughStoneRelief = texture2D(bumpMap, roughStoneUv);
    // The two faces carry the relief; the thin margin and the walls cut for
    // the player are left to the mesh.
    roughStoneFacing = abs(dot(normalize(vStoneNormal), roughStoneNormal));
  #endif
`

const reliefNormal = /* glsl */`
  #ifdef USE_BUMPMAP
    vec3 roughStoneMeshNormal = normalize(vStoneNormal);
    vec2 roughStoneCode = roughStoneRelief.rg * 2.0 - 1.0;
    vec2 roughStoneSlope = roughStoneCode * abs(roughStoneCode) * ${GRADIENT_RANGE.toFixed(2)}
      * roughStoneDetail * bumpScale * 2.0;
    // A height h over the blade plane has normal (+-n) - grad(h). Both faces
    // take their normal from the map, so shading is independent of the mesh.
    float roughStoneSide = dot(roughStoneMeshNormal, roughStoneNormal) < 0.0 ? -1.0 : 1.0;
    vec3 roughStoneShaded = normalize(roughStoneNormal * roughStoneSide
      - roughStoneU * roughStoneSlope.x - roughStoneV * roughStoneSlope.y);
    roughStoneShaded = mix(roughStoneMeshNormal, roughStoneShaded, smoothstep(0.2, 0.55, roughStoneFacing));
    normal = normalize(normalMatrix * roughStoneShaded) * faceDirection;
  #endif
`

export function applyRoughStoneBump(shader, uniforms = createRoughStoneUniforms()) {
  Object.assign(shader.uniforms, uniforms)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${surfaceVaryings}`)
    .replace('#include <project_vertex>', /* glsl */`
      #ifdef USE_BUMPMAP
        vStonePosition = transformed;
        vStoneNormal = objectNormal;
      #endif
      #include <project_vertex>
    `)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${surfaceVaryings}\n${surfaceUniforms}`)
    // The stock bump path differentiates a height map through the mesh UVs.
    .replace('#include <bumpmap_pars_fragment>', '')
    .replace('#include <color_fragment>', /* glsl */`
      #include <color_fragment>
      ${reliefSample}
      #ifdef USE_BUMPMAP
        float roughStoneTone = mix(1.0, roughStoneRelief.b * 2.0, roughStoneGrain * 2.0 * smoothstep(0.1, 0.4, roughStoneFacing));
        diffuseColor.rgb *= roughStoneTone;
      #endif
    `)
    .replace('#include <roughnessmap_fragment>', /* glsl */`
      #include <roughnessmap_fragment>
      #ifdef USE_BUMPMAP
        roughnessFactor = clamp(roughnessFactor + (roughStoneRelief.a - 0.5) * 0.9 * smoothstep(0.1, 0.4, roughStoneFacing), 0.08, 1.0);
      #endif
    `)
    .replace('#include <normal_fragment_maps>', reliefNormal)
}

export function roughStoneProgramKey() {
  return 'v2-geological-knapped-flint-relief-v1'
}
