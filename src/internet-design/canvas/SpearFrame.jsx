import React, { useSyncExternalStore } from 'react'
import InternetDesign from '../InternetDesign'
import { controls } from './twombly-controls'
import { rockVersions } from '../rockVersions'
import { lightingDefaults } from '../backdropControls'

// Register only in the V2 frame, keeping its controls out of other canvas screens.
let panel
export default function SpearFrame() {
  const { finish } = rockVersions[2]
  panel ??= controls('Stone spear', {
    playerOpening: {
      sizePercent: [100, 50, 120, 1],
      position: { type: 'pad', x: [0, -10, 10], y: [0, -14, 18] },
    },
    stoneAngle: { turn: [0, -180, 180, 1], tilt: [0, -90, 90, 1], roll: [0, -180, 180, 1] },
    wideView: {
      lightAngle: [64, 35, 78, 1],
      brightness: [1, 0.45, 1.5, 0.05],
      pointerTilt: false,
    },
    surface: {
      relief: [finish.bump, 0, 1, 0.01],
      roughness: [finish.roughness, 0.5, 1, 0.01],
      stoneColor: finish.color,
    },
    lettering: {
      followCursor: lightingDefaults.followCursor,
      revealRadius: [lightingDefaults.wallRadius, 10, 140, 1],
    },
  })
  const { playerOpening, stoneAngle, wideView, surface, lettering } = useSyncExternalStore(panel.subscribe, panel.get, panel.get)
  return <InternetDesign version={2} sceneOverrides={{
    opening: { size: playerOpening.sizePercent, horizontal: playerOpening.position.x, vertical: playerOpening.position.y },
    stone: { rotationX: stoneAngle.tilt, rotationY: stoneAngle.turn, rotationZ: stoneAngle.roll, pointerTilt: wideView.pointerTilt, bump: surface.relief, roughness: surface.roughness, color: surface.stoneColor },
    lighting: { wideAngle: wideView.lightAngle, wideBrightness: wideView.brightness,
      wallFollowsCursor: lettering.followCursor, wallRadius: lettering.revealRadius },
  }} />
}
