import * as THREE from 'three'

export const screenLightDefaults = Object.freeze({
  enabled: true, strength: 0.22, reach: 32, spread: 0.34, haze: 0.08,
})

export function createScreenLightMaterial(source) {
  return new THREE.ShaderMaterial({
    uniforms: {
      screenGlowVideo: source.screenGlowVideo,
      screenGlowVideoMatrix: source.screenGlowVideoMatrix,
      screenGlowHalfSize: source.screenGlowHalfSize,
      screenGlowReady: source.screenGlowReady,
      beamCamera: { value: new THREE.Vector3() },
      beamStart: { value: 5 },
      beamReach: { value: 32 },
      beamSpread: { value: 0.34 },
      beamStrength: { value: 0.22 },
      beamHaze: { value: 0.08 },
      beamTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      uniform vec2 screenGlowHalfSize;
      uniform float beamStart;
      uniform float beamReach;
      uniform float beamSpread;
      varying vec3 vBeamPoint;
      void main() {
        float depth = mix(beamStart, beamReach, position.z + 0.5);
        vBeamPoint = vec3(position.xy * (screenGlowHalfSize + depth * beamSpread), depth);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(vBeamPoint, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      #include <common>
      uniform sampler2D screenGlowVideo;
      uniform mat3 screenGlowVideoMatrix;
      uniform vec2 screenGlowHalfSize;
      uniform float screenGlowReady;
      uniform vec3 beamCamera;
      uniform float beamStart;
      uniform float beamReach;
      uniform float beamSpread;
      uniform float beamStrength;
      uniform float beamHaze;
      uniform float beamTime;
      varying vec3 vBeamPoint;

      bool clipBeamPlane(vec3 n, float bound, vec3 origin, vec3 direction, inout float nearT, inout float farT) {
        float numerator = bound - dot(n, origin);
        float denominator = dot(n, direction);
        if (abs(denominator) < 0.00001) return numerator >= 0.0;
        float crossing = numerator / denominator;
        if (denominator > 0.0) farT = min(farT, crossing);
        else nearT = max(nearT, crossing);
        return farT > nearT;
      }

      vec3 videoLight(vec2 sourceUv) {
        // Reuse the exact visible crop and orientation of the real player.
        vec2 uv = (screenGlowVideoMatrix * vec3(1.0 - sourceUv.x, sourceUv.y, 1.0)).xy;
        return sRGBTransferEOTF(texture2D(screenGlowVideo, uv)).rgb;
      }

      vec3 softenedVideoLight(vec2 uv) {
        vec3 color = videoLight(clamp(uv, 0.02, 0.98)) * 0.4;
        color += videoLight(clamp(uv + vec2(0.14, 0.09), 0.02, 0.98)) * 0.3;
        color += videoLight(clamp(uv - vec2(0.14, 0.09), 0.02, 0.98)) * 0.3;
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        return max(mix(vec3(luma), color, 1.18), vec3(0.0));
      }

      void main() {
        if (screenGlowReady < 0.5 || beamStrength + beamHaze <= 0.0) discard;
        vec3 direction = normalize(vBeamPoint - beamCamera);
        float nearT = 0.0, farT = 10000.0;
        // Clip the view ray to a rectangular beam expanding from the screen.
        // The first visible air starts beyond the original rock's front lip.
        if (!clipBeamPlane(vec3(1.0, 0.0, -beamSpread), screenGlowHalfSize.x, beamCamera, direction, nearT, farT)
          || !clipBeamPlane(vec3(-1.0, 0.0, -beamSpread), screenGlowHalfSize.x, beamCamera, direction, nearT, farT)
          || !clipBeamPlane(vec3(0.0, 1.0, -beamSpread), screenGlowHalfSize.y, beamCamera, direction, nearT, farT)
          || !clipBeamPlane(vec3(0.0, -1.0, -beamSpread), screenGlowHalfSize.y, beamCamera, direction, nearT, farT)
          || !clipBeamPlane(vec3(0.0, 0.0, 1.0), beamReach, beamCamera, direction, nearT, farT)
          || !clipBeamPlane(vec3(0.0, 0.0, -1.0), -beamStart, beamCamera, direction, nearT, farT)) discard;

        // Keep footage clear: concentrate the atmospheric spill beyond its rim.
        float screenClear = 1.0;
        if (abs(direction.z) > 0.00001) {
          float screenT = -beamCamera.z / direction.z;
          if (screenT > 0.0) {
            vec2 source = (beamCamera + direction * screenT).xy / screenGlowHalfSize;
            screenClear = smoothstep(0.88, 1.18, max(abs(source.x), abs(source.y)));
          }
        }
        if (screenClear < 0.001) discard;

        float stepLength = (farT - nearT) / 12.0;
        vec3 scattered = vec3(0.0);
        float transmission = 1.0;
        for (int i = 0; i < 12; i++) {
          vec3 point = beamCamera + direction * (nearT + (float(i) + 0.5) * stepLength);
          vec2 radius = screenGlowHalfSize + point.z * beamSpread;
          vec2 sourceUv = point.xy / (2.0 * radius) + 0.5;
          float edge = 1.0 - max(abs(point.x) / radius.x, abs(point.y) / radius.y);
          float softEdge = smoothstep(0.0, 0.36, edge);
          float along = clamp((point.z - beamStart) / max(beamReach - beamStart, 0.01), 0.0, 1.0);
          float falloff = smoothstep(0.0, 0.14, along) * pow(1.0 - along, 1.7);
          // Broad, slowly drifting aerosol wisps, with a few softer shafts.
          float thread = sin(sourceUv.x * 22.0 + sourceUv.y * 9.0 + sin(sourceUv.y * 8.0) * 0.7);
          float shafts = pow(max(thread, 0.0), 5.0);
          float wisp = 0.78 + 0.22 * sin(point.x * 0.21 + point.z * 0.18 - beamTime * 0.12)
            * sin(point.y * 0.24 - point.z * 0.11 + beamTime * 0.08);
          float density = (beamHaze * 0.45 + beamStrength * (0.22 + shafts * 0.78))
            * softEdge * falloff * wisp;
          float scatter = 1.0 - exp(-density * stepLength * 0.018);
          scattered += transmission * softenedVideoLight(sourceUv) * scatter;
          transmission *= 1.0 - scatter;
        }
        float phase = 0.65 + 0.35 * pow(abs(direction.z), 6.0);
        gl_FragColor = vec4(scattered * screenClear * phase * 0.62, 0.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    // An emissive air volume: preserve the destination alpha and add its light.
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    toneMapped: false,
  })
}
