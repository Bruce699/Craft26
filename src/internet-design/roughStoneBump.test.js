import assert from 'node:assert/strict'
import test from 'node:test'
import { ShaderLib } from 'three'
import { applyRoughStoneBump, createRoughStoneUniforms, roughStoneProgramKey } from './roughStoneBump.js'

function standardShader() {
  return { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} }
}

test('rough patch fits the installed standard shader and preserves the screen-glow varying contract', () => {
  const shader = standardShader()
  applyRoughStoneBump(shader)
  for (const varying of ['vStonePosition', 'vStoneNormal']) {
    assert.equal(shader.vertexShader.split(`varying vec3 ${varying};`).length - 1, 1)
    assert.equal(shader.fragmentShader.split(`varying vec3 ${varying};`).length - 1, 1)
  }
  assert.match(shader.vertexShader, /vStonePosition = transformed;/)
  assert.match(shader.vertexShader, /vStoneNormal = objectNormal;/)
  assert.equal(shader.fragmentShader.includes('#include <bumpmap_pars_fragment>'), false)
  assert.equal((shader.fragmentShader.match(/vec2 dHdxy_fwd\(/g) ?? []).length, 1)
  assert.match(shader.fragmentShader, /vec3 vSigmaX = dFdx\( surf_pos\.xyz \);/)
  assert.match(shader.fragmentShader, /roughnessFactor = clamp/)
  // Keep the common and lighting hooks available to the composing glow patch.
  assert.equal(shader.fragmentShader.includes('#include <common>'), true)
  assert.equal(shader.fragmentShader.includes('#include <lights_fragment_end>'), true)
})

test('material instances get independent uniforms while provided references remain live', () => {
  const first = createRoughStoneUniforms({ flakeScale: 1.7, detail: 0.8, grain: 0.1 })
  const second = createRoughStoneUniforms()
  const shader = standardShader()
  applyRoughStoneBump(shader, first)
  assert.equal(shader.uniforms.roughStoneFlakeScale, first.roughStoneFlakeScale)
  first.roughStoneFlakeScale.value = 2
  assert.equal(shader.uniforms.roughStoneFlakeScale.value, 2)
  assert.equal(second.roughStoneFlakeScale.value, 1)
  assert.equal(second.roughStoneGrain.value, 0.12)
  assert.notEqual(first.roughStoneDetail, second.roughStoneDetail)
})

test('uniform creation bounds malformed parameters without changing the shader variant', () => {
  const uniforms = createRoughStoneUniforms({ flakeScale: NaN, detail: -3, grain: 100 })
  assert.equal(uniforms.roughStoneFlakeScale.value, 1)
  assert.equal(uniforms.roughStoneDetail.value, 0)
  assert.equal(uniforms.roughStoneGrain.value, 1)
  assert.equal(typeof roughStoneProgramKey(), 'string')
  assert.ok(roughStoneProgramKey().includes('geological'))
})
