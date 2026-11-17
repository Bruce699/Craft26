import assert from 'node:assert/strict'
import test from 'node:test'
import { ShaderLib, Vector3 } from 'three'
import { applyRoughStoneBump, createRoughStoneUniforms, roughStoneProgramKey } from './roughStoneBump.js'

function standardShader() {
  return { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} }
}

test('relief patch fits the installed standard shader and preserves the screen-glow varying contract', () => {
  const shader = standardShader()
  applyRoughStoneBump(shader)
  for (const varying of ['vStonePosition', 'vStoneNormal']) {
    assert.equal(shader.vertexShader.split(`varying vec3 ${varying};`).length - 1, 1)
    assert.equal(shader.fragmentShader.split(`varying vec3 ${varying};`).length - 1, 1)
  }
  assert.match(shader.vertexShader, /vStonePosition = transformed;/)
  assert.match(shader.vertexShader, /vStoneNormal = objectNormal;/)
  // The stock UV bump path is replaced by one fetch of the baked relief.
  for (const chunk of ['bumpmap_pars_fragment', 'normal_fragment_maps', 'color_fragment', 'roughnessmap_fragment']) {
    assert.equal(ShaderLib.standard.fragmentShader.includes(`#include <${chunk}>`), true)
  }
  assert.equal(shader.fragmentShader.includes('#include <bumpmap_pars_fragment>'), false)
  assert.equal(shader.fragmentShader.includes('#include <normal_fragment_maps>'), false)
  assert.equal(shader.fragmentShader.includes('dHdxy_fwd'), false)
  assert.equal((shader.fragmentShader.match(/texture2D\(bumpMap/g) ?? []).length, 1)
  assert.equal((shader.fragmentShader.match(/uniform sampler2D bumpMap;/g) ?? []).length, 1)
  assert.match(shader.fragmentShader, /normal = normalize\(normalMatrix \* roughStoneShaded\)/)
  assert.match(shader.fragmentShader, /roughnessFactor = clamp/)
  // Keep the common and lighting hooks available to the composing glow patch.
  assert.equal(shader.fragmentShader.includes('#include <common>'), true)
  assert.equal(shader.fragmentShader.includes('#include <lights_fragment_end>'), true)
})

test('material instances get independent uniforms while provided references remain live', () => {
  const frame = { origin: new Vector3(1, 2, 3), u: new Vector3(1, 0, 0), v: new Vector3(0, 1, 0), normal: new Vector3(0, 0, 1) }
  const first = createRoughStoneUniforms({ detail: 0.8, grain: 0.1 }, frame)
  const second = createRoughStoneUniforms()
  const shader = standardShader()
  applyRoughStoneBump(shader, first)
  assert.equal(shader.uniforms.roughStoneDetail, first.roughStoneDetail)
  first.roughStoneDetail.value = 2
  assert.equal(shader.uniforms.roughStoneDetail.value, 2)
  assert.equal(second.roughStoneDetail.value, 1)
  assert.equal(second.roughStoneGrain.value, 0.5)
  assert.notEqual(first.roughStoneDetail, second.roughStoneDetail)
  // The frame is copied: moving the caller's vectors must not move the relief.
  frame.origin.set(9, 9, 9)
  assert.deepEqual(first.roughStoneOrigin.value.toArray(), [1, 2, 3])
})

test('uniform creation bounds malformed parameters without changing the shader variant', () => {
  const uniforms = createRoughStoneUniforms({ detail: -3, grain: 100 })
  assert.equal(uniforms.roughStoneDetail.value, 0)
  assert.equal(uniforms.roughStoneGrain.value, 1)
  assert.equal(createRoughStoneUniforms({ detail: NaN }).roughStoneDetail.value, 1)
  assert.equal(typeof roughStoneProgramKey(), 'string')
  assert.ok(roughStoneProgramKey().includes('geological'))
})
