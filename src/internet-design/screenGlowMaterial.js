import * as THREE from 'three'
import { applyReferenceStoneBump, referenceStoneProgramKey } from './referenceStoneBump'
import { applyRoughStoneBump, createRoughStoneUniforms, roughStoneProgramKey } from './roughStoneBump'

// Approximate a small area emitter using the displayed video itself. There is
// no video readback, extra light, reflection render target, or geometry pass.
export function createScreenGlowMaterial(frame, version = 1) {
  const roughUniforms = version === 2 ? createRoughStoneUniforms() : {}
  const uniforms = {
    ...roughUniforms,
    screenGlowVideo: { value: null },
    screenGlowVideoMatrix: { value: new THREE.Matrix3() },
    screenGlowCenter: { value: frame.center.clone() },
    screenGlowU: { value: frame.u.clone() },
    screenGlowV: { value: frame.v.clone() },
    screenGlowNormal: { value: frame.normal.clone() },
    screenGlowHalfSize: { value: new THREE.Vector2(frame.halfWidth, frame.halfHeight) },
    screenGlowBandScale: { value: 1 },
    screenGlowStrength: { value: 0.22 },
    screenGlowReady: { value: 0 },
  }

  return {
    uniforms,
    cacheKey: () => `${version === 2 ? roughStoneProgramKey() : referenceStoneProgramKey()}-video-area-glow-v2`,
    onBeforeCompile(shader) {
      if (version === 2) applyRoughStoneBump(shader, roughUniforms)
      else applyReferenceStoneBump(shader)
      Object.assign(shader.uniforms, uniforms)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', /* glsl */`
          #include <common>
          uniform sampler2D screenGlowVideo;
          uniform mat3 screenGlowVideoMatrix;
          uniform vec3 screenGlowCenter;
          uniform vec3 screenGlowU;
          uniform vec3 screenGlowV;
          uniform vec3 screenGlowNormal;
          uniform vec2 screenGlowHalfSize;
          uniform float screenGlowBandScale;
          uniform float screenGlowStrength;
          uniform float screenGlowReady;
        `)
      // Insert after the patched bump declarations, where model-space varyings
      // and the source-normal helpers are available to the fragment functions.
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', /* glsl */`
        #ifdef USE_BUMPMAP
          vec3 screenGlowRadiance() {
            if (screenGlowReady < 0.5 || screenGlowStrength <= 0.0) return vec3(0.0);
            vec3 relative = vStonePosition - screenGlowCenter;
            vec2 local = vec2(dot(relative, screenGlowU), dot(relative, screenGlowV));
            float depth = dot(relative, screenGlowNormal);
            vec3 surfaceNormal = normalize(vStoneNormal);
            vec2 q = abs(local) - screenGlowHalfSize;
            float rectangleDistance = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0);
            float band = max(screenGlowBandScale, 0.45);
            float edgeMask = smoothstep(-2.2 * band, -1.2 * band, rectangleDistance)
              * (1.0 - smoothstep(0.25 * band, 0.85 * band, rectangleDistance));
            float depthMask = smoothstep(0.0, 0.18, depth) * (1.0 - smoothstep(4.5, 5.5, depth));
            float sideMask = 1.0 - smoothstep(0.65, 0.92, abs(dot(surfaceNormal, screenGlowNormal)));
            vec3 inward = -screenGlowU * local.x - screenGlowV * local.y;
            inward /= max(length(inward), 0.0001);
            float inwardMask = smoothstep(0.1, 0.6, dot(surfaceNormal, inward));
            float rimMask = edgeMask * depthMask * sideMask * inwardMask;
            if (rimMask < 0.0001) return vec3(0.0);

            vec3 radiance = vec3(0.0);
            float cellArea = 4.0 * screenGlowHalfSize.x * screenGlowHalfSize.y / 9.0;
            // Nine broad samples soften the frame into reflected illumination,
            // while nearby parts of the video contribute more to each wall.
            for (int y = 0; y < 3; y++) {
              for (int x = 0; x < 3; x++) {
                vec2 displayUv = vec2(0.2 + float(x) * 0.3, 0.2 + float(y) * 0.3);
                vec3 emitter = screenGlowCenter
                  + screenGlowU * ((displayUv.x - 0.5) * 2.0 * screenGlowHalfSize.x)
                  + screenGlowV * ((displayUv.y - 0.5) * 2.0 * screenGlowHalfSize.y);
                vec3 ray = emitter - vStonePosition;
                float distanceSquared = max(dot(ray, ray), 0.0001);
                vec3 direction = ray * inversesqrt(distanceSquared);
                float receiver = max(dot(surfaceNormal, direction), 0.0);
                float emitterFacing = max(dot(screenGlowNormal, -direction), 0.0);
                float weight = receiver * emitterFacing * cellArea * RECIPROCAL_PI / (distanceSquared + cellArea);
                // Visible-right frame U opposes the original screen mesh U.
                // Then apply the SAME crop/flip/rotation as the real player.
                vec2 meshUv = vec2(1.0 - displayUv.x, displayUv.y);
                vec2 videoUv = (screenGlowVideoMatrix * vec3(meshUv, 1.0)).xy;
                vec3 videoColor = sRGBTransferEOTF(texture2D(screenGlowVideo, videoUv)).rgb;
                radiance += videoColor * weight;
              }
            }
            return radiance * rimMask * screenGlowStrength;
          }
        #endif
        void main() {
      `)
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', /* glsl */`
        #include <lights_fragment_end>
        #ifdef USE_BUMPMAP
          float screenMicroRelief = 0.75 + 0.25 * max(dot(normal, nonPerturbedNormal), 0.0);
          reflectedLight.indirectSpecular += screenGlowRadiance()
            * mix(vec3(0.45), material.specularColor, 0.35) * screenMicroRelief;
        #endif
      `)
    },
  }
}
