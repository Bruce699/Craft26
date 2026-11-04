import { ShaderChunk } from 'three'

const bounded = (value, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback))

export function createRoughStoneUniforms(settings = {}) {
  return {
    roughStoneFlakeScale: { value: bounded(settings?.flakeScale, 1, 0.25, 4) },
    roughStoneDetail: { value: bounded(settings?.detail, 1, 0, 2) },
    roughStoneGrain: { value: bounded(settings?.grain, 0.12, 0, 1) },
  }
}

const surfaceVaryings = /* glsl */`
#ifdef USE_BUMPMAP
  varying vec3 vStonePosition;
  varying vec3 vStoneNormal;
#endif
`

const surfaceUniforms = /* glsl */`
  uniform float roughStoneFlakeScale;
  uniform float roughStoneDetail;
  uniform float roughStoneGrain;
`

const surfaceHeight = /* glsl */`
  vec3 roughStoneTextureSamples( vec3 point ) {
    // The CC0 Rock Face 03 displacement supplies real weathered rock clusters.
    // One 1K tile spans 24 model units, not an atlas or screen-space noise.
    vec3 q = point / (24.0 * max(roughStoneFlakeScale, 0.25));
    return vec3(
      texture2D(bumpMap, q.zy + vec2(0.17, 0.43)).r,
      texture2D(bumpMap, q.xz + vec2(0.61, 0.29)).r,
      texture2D(bumpMap, q.xy + vec2(0.37, 0.73)).r
    );
  }

  vec3 roughStoneTextureWeights() {
    vec3 weights = pow(abs(normalize(vStoneNormal)), vec3(4.0));
    return weights / max(dot(weights, vec3(1.0)), 0.00001);
  }

  vec3 roughStoneHash( vec3 cell ) {
    vec3 h = fract( (cell + vec3(13.7, 7.1, 23.9)) * vec3(0.06711056, 0.00583715, 0.753731) );
    h += dot( h, h.zxy + 31.17 );
    return fract( (h + vec3(0.31, 0.57, 0.83)) * h.yzx * 7.13 );
  }

  float roughStoneNoise( vec3 point ) {
    vec3 cell = floor(point), f = fract(point);
    f = f * f * (3.0 - 2.0 * f);
    float a = roughStoneHash(cell).x;
    float b = roughStoneHash(cell + vec3(1.0, 0.0, 0.0)).x;
    float c = roughStoneHash(cell + vec3(0.0, 1.0, 0.0)).x;
    float d = roughStoneHash(cell + vec3(1.0, 1.0, 0.0)).x;
    float e = roughStoneHash(cell + vec3(0.0, 0.0, 1.0)).x;
    float f1 = roughStoneHash(cell + vec3(1.0, 0.0, 1.0)).x;
    float g = roughStoneHash(cell + vec3(0.0, 1.0, 1.0)).x;
    float h = roughStoneHash(cell + vec3(1.0, 1.0, 1.0)).x;
    return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
      mix(mix(e, f1, f.x), mix(g, h, f.x), f.y), f.z);
  }

  float roughStoneFlakes( vec3 point ) {
    vec3 q = vec3(
      dot(point, vec3(0.8660254, 0.5, 0.0)),
      dot(point, vec3(-0.3535534, 0.6123724, 0.7071068)),
      dot(point, vec3(0.3535534, -0.6123724, 0.7071068))
    ) / (11.0 * max(roughStoneFlakeScale, 0.25)) + vec3(5.7, 1.9, 9.3);
    // Gentle, much larger-scale drift avoids a repeated polygon grid without
    // turning the broad faces into small noisy bumps.
    vec2 drift = vec2(
      roughStoneNoise(q * 0.45 + vec3(3.1, 7.4, 1.8)),
      roughStoneNoise(q * 0.45 + vec3(8.6, 2.2, 6.7))
    ) - 0.5;
    q.xy += drift * 0.18;
    vec3 cell = floor(q);
    float nearest = 100.0, second = 100.0, fractureMark = 0.0;
    for (int z = -1; z <= 1; z++) {
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec3 neighbor = cell + vec3(float(x), float(y), float(z));
          vec3 cellRandom = roughStoneHash(neighbor);
          vec3 center = neighbor + mix(vec3(0.16), vec3(0.84), cellRandom);
          // A polyhedral distance produces broad, planar flakes rather than
          // rounded noise bumps. Cell boundaries become sparse chisel seams.
          float distance = dot(abs(center - q), vec3(0.7, 0.52, 0.42));
          if (distance < nearest) { second = nearest; nearest = distance; fractureMark = cellRandom.y; }
          else second = min(second, distance);
        }
      }
    }
    float fracture = (1.0 - smoothstep(0.018, 0.07, second - nearest))
      * smoothstep(0.75, 0.9, fractureMark);
    return (0.6 - nearest) * 2.2 - fracture * 0.06;
  }

  float roughStoneHeight( vec3 point ) {
    float flakes = roughStoneFlakes(point);
    float pitting = smoothstep(0.62, 0.9, roughStoneNoise(point * 1.1 + vec3(2.3, 8.7, 4.1)));
    float layers = roughStoneNoise(point * 0.43 + vec3(8.1, 1.7, 6.4)) - 0.5;
    // Grain is intentionally much smaller than the broad flake and pit relief.
    float grain = (roughStoneNoise(point * 5.3) - 0.5) * 0.012 * roughStoneGrain;
    return (flakes - pitting * pitting * 0.2 + layers * 0.025) * roughStoneDetail + grain;
  }

  vec2 dHdxy_fwd() {
    float height = roughStoneHeight(vStonePosition);
    vec3 samples = roughStoneTextureSamples(vStonePosition);
    vec3 weights = roughStoneTextureWeights();
    // Differentiate samples before blending, keeping projection weights fixed.
    // Otherwise changing vertex normals can create false triplanar seam ridges.
    vec2 scannedGradient = vec2(dot(dFdx(samples), weights), dot(dFdy(samples), weights));
    return bumpScale * (scannedGradient * 4.0 * roughStoneDetail
      + vec2(dFdx(height), dFdy(height)) * 0.12);
  }
`

// Retain the physical world-space gradient response used by the V1 material.
const proceduralBump = ShaderChunk.bumpmap_pars_fragment
  .replace('normalize( dFdx( surf_pos.xyz ) )', 'dFdx( surf_pos.xyz )')
  .replace('normalize( dFdy( surf_pos.xyz ) )', 'dFdy( surf_pos.xyz )')
  .replace(/vec2 dHdxy_fwd\(\)\s*\{[\s\S]*?\n\s*\}/, surfaceHeight)

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
    .replace('#include <bumpmap_pars_fragment>', proceduralBump)
    .replace('#include <color_fragment>', /* glsl */`
      #include <color_fragment>
      #ifdef USE_BUMPMAP
        float roughStoneVariation = dot(roughStoneTextureSamples(vStonePosition), roughStoneTextureWeights()) - 0.5;
        diffuseColor.rgb *= 1.0 + roughStoneVariation * 0.45 * min(roughStoneDetail, 1.5);
      #endif
    `)
    .replace('#include <roughnessmap_fragment>', /* glsl */`
      #include <roughnessmap_fragment>
      #ifdef USE_BUMPMAP
        roughnessFactor = clamp(roughnessFactor + roughStoneVariation * 0.1 * min(roughStoneDetail, 1.5), 0.04, 1.0);
      #endif
    `)
}

export function roughStoneProgramKey() {
  return 'v2-geological-stone-rock-face03-v5'
}
