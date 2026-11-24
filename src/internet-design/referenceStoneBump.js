import { ShaderChunk } from 'three'

// Keep the reference's physical surface-gradient response (Three r144), but
// evaluate detail on the final sculpted surface instead of the original UVs.
// This applies after both the body deformation and the video-window warp.
const referenceBump = ShaderChunk.bumpmap_pars_fragment
  .replace('normalize( dFdx( surf_pos.xyz ) )', 'dFdx( surf_pos.xyz )')
  .replace('normalize( dFdy( surf_pos.xyz ) )', 'dFdy( surf_pos.xyz )')

const surfaceVaryings = /* glsl */`
#ifdef USE_BUMPMAP
  varying vec3 vStonePosition;
  varying vec3 vStoneNormal;
#endif
`

const surfaceHeight = /* glsl */`
  // The reference image is an atlas, not a repeating texture. Only sample a
  // stone-filled interior rectangle; never its flat background or island edges.
  // Mirroring makes the tile continuous without modifying the original asset.
  float stoneTile( vec2 p ) {
    vec2 tile = 1.0 - abs( mod( p, 2.0 ) - 1.0 );
    vec2 uv = vec2( 0.5625, 0.21875 ) + tile * 0.21875;
    return texture2D( bumpMap, uv ).r;
  }

  float stonePlane( vec2 p ) {
    // A second rotated, incommensurate scale breaks up mirrored repetitions.
    vec2 rotated = mat2( 0.8, -0.6, 0.6, 0.8 ) * p;
    return stoneTile( p ) * 0.72 + stoneTile( rotated * 1.91 + vec2( 0.37, 1.13 ) ) * 0.28;
  }

  float stoneHeight( vec3 p, vec3 weights ) {
    // Match the source mesh's roughly 20 texture pixels per model unit. This
    // density stays fixed as regions are stretched or compressed.
    vec3 q = p * 0.06;
    return dot( vec3(
      stonePlane( q.zy + vec2( 1.17, 0.43 ) ),
      stonePlane( q.xz + vec2( 0.23, 1.71 ) ),
      stonePlane( q.xy + vec2( 1.43, 0.79 ) )
    ), weights );
  }

  vec2 dHdxy_fwd() {
    // Keep projection weights fixed across the finite differences to avoid
    // false bump ridges caused solely by changing surface-normal directions.
    vec3 weights = pow( abs( normalize( vStoneNormal ) ), vec3( 4.0 ) );
    weights /= max( dot( weights, vec3( 1.0 ) ), 0.00001 );
    float height = stoneHeight( vStonePosition, weights );
    return bumpScale * vec2(
      stoneHeight( vStonePosition + dFdx( vStonePosition ), weights ) - height,
      stoneHeight( vStonePosition + dFdy( vStonePosition ), weights ) - height
    );
  }
`

const triplanarBump = referenceBump.replace(
  /vec2 dHdxy_fwd\(\)\s*\{[\s\S]*?\n\s*\}/,
  surfaceHeight,
)

export function applyReferenceStoneBump(shader) {
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
    .replace('#include <common>', `#include <common>\n${surfaceVaryings}`)
    .replace('#include <bumpmap_pars_fragment>', triplanarBump)
}

export function referenceStoneProgramKey() {
  return 'xkm-stone-r144-triplanar-bump-v2'
}
