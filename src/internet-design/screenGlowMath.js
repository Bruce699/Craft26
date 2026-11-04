const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback

// CPU reference for the player's VideoTexture transform: centered cover crop,
// rotation PI, and negative Y repeat. Input is the original screen mesh UV;
// clamp to its edges before calling when sampling the nearest visible edge.
export function coverVideoUv(screenMeshUv, videoAspect, frameAspect) {
  const frame = positive(frameAspect, 1)
  const source = positive(videoAspect, frame)
  const u = screenMeshUv?.x ?? screenMeshUv?.[0]
  const v = screenMeshUv?.y ?? screenMeshUv?.[1]
  const x = Number.isFinite(u) ? u : 0.5
  const y = Number.isFinite(v) ? v : 0.5
  const cropX = Math.min(1, frame / source)
  const cropY = Math.min(1, source / frame)
  return [0.5 - (x - 0.5) * cropX, 0.5 + (y - 0.5) * cropY]
}

// Match Three's sRGBTransferEOTF for a video sampler. Custom uniforms do not
// receive DECODE_VIDEO_TEXTURE automatically, so GPU glow sampling must decode
// before adding radiance to the stone's linear-light material calculation.
export function srgbToLinear(value) {
  const channel = clamp(Number.isFinite(value) ? value : 0, 0, 1)
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

export function decodeVideoColor(srgbRgb) {
  return [
    srgbToLinear(srgbRgb?.r ?? srgbRgb?.[0]),
    srgbToLinear(srgbRgb?.g ?? srgbRgb?.[1]),
    srgbToLinear(srgbRgb?.b ?? srgbRgb?.[2]),
  ]
}
