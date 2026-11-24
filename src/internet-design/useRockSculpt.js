import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

const Z_AXIS = new THREE.Vector3(0, 0, 1)

export function useRockSculpt({ deformer, shape, videoWindow, sculpt, apiRef, meshRef, cursorRef, onStrokeCountChange }) {
  const { gl, camera, size } = useThree()
  const [revision, setRevision] = useState(0)
  const historyRef = useRef([])
  const draggingRef = useRef(null)
  const gestureSerial = useRef(0)
  const blockedClickUntil = useRef(0)
  const shapeRef = useRef(shape)
  const sculptRef = useRef(sculpt)
  shapeRef.current = shape
  sculptRef.current = sculpt
  const shapeKey = JSON.stringify(shape)
  const windowKey = `${videoWindow.width},${videoWindow.height},${videoWindow.offsetX},${videoWindow.offsetY}`
  const scratch = useMemoScratch()

  const notify = useCallback(() => {
    onStrokeCountChange?.(historyRef.current.length)
    setRevision((value) => value + 1)
  }, [onStrokeCountChange])

  const finishStroke = useCallback(() => {
    const active = draggingRef.current
    if (!active) return
    if (active.mode === 'grab' || active.mode === 'stretch') applyDragPoint(active, active.pending)
    draggingRef.current = null
    blockedClickUntil.current = performance.now() + 300
    if (active.strokes.length) {
      historyRef.current.push(active.strokes)
      notify()
    }
    try { active.target.releasePointerCapture(active.pointerId) } catch { /* Already released by the browser. */ }
    if (cursorRef.current) cursorRef.current.visible = false
  }, [notify, cursorRef, deformer])

  const rebuild = useCallback(() => {
    deformer.apply(shapeRef.current, historyRef.current.flat())
    notify()
  }, [deformer, notify])

  const undo = useCallback(() => {
    finishStroke()
    if (!historyRef.current.length) return
    historyRef.current.pop()
    rebuild()
  }, [finishStroke, rebuild])

  const clear = useCallback(() => {
    finishStroke()
    historyRef.current = []
    rebuild()
  }, [finishStroke, rebuild])

  useImperativeHandle(apiRef, () => ({ undo, clear }), [undo, clear])

  useLayoutEffect(() => {
    finishStroke()
    deformer.apply(shapeRef.current, historyRef.current.flat())
    notify()
  }, [deformer, shapeKey, finishStroke, notify])

  useLayoutEffect(() => {
    finishStroke()
    if (cursorRef.current) cursorRef.current.visible = false
    deformer.setWindow(videoWindow)
    notify()
  }, [deformer, windowKey, finishStroke, notify, cursorRef])

  useEffect(() => {
    if (!sculpt.enabled) finishStroke()
    if (cursorRef.current) cursorRef.current.visible = false
  }, [sculpt.enabled, finishStroke, cursorRef])

  useEffect(() => { finishStroke() }, [size.width, size.height, finishStroke])

  useEffect(() => {
    const canvas = gl.domElement
    const finishPointer = (event) => {
      if (draggingRef.current?.pointerId === event.pointerId) finishStroke()
    }
    canvas.addEventListener('pointercancel', finishPointer)
    canvas.addEventListener('lostpointercapture', finishPointer)
    window.addEventListener('pointerup', finishPointer)
    window.addEventListener('blur', finishStroke)
    return () => {
      canvas.removeEventListener('pointercancel', finishPointer)
      canvas.removeEventListener('lostpointercapture', finishPointer)
      window.removeEventListener('pointerup', finishPointer)
      window.removeEventListener('blur', finishStroke)
      const active = draggingRef.current
      draggingRef.current = null
      if (active) {
        try { active.target.releasePointerCapture(active.pointerId) } catch { /* Capture already ended. */ }
      }
    }
  }, [gl, finishStroke])

  function updateCursor(point, normal) {
    const cursor = cursorRef.current
    if (!cursor || !sculptRef.current.enabled) return
    cursor.visible = true
    cursor.position.copy(point).addScaledVector(normal, 0.08)
    cursor.quaternion.setFromUnitVectors(Z_AXIS, normal)
    const requestedRadius = sculptRef.current.brushSize
    const mappedRadius = deformer.radiusToCanonical(requestedRadius, point)
    const limitedRadius = THREE.MathUtils.clamp(mappedRadius, 1, 18)
    cursor.scale.setScalar(requestedRadius * limitedRadius / Math.max(mappedRadius, 1e-8))
    cursor.material.color.set(deformer.protectionAt(point) > 0.99 ? '#737373' : '#e3e3e3')
  }

  function stamp(point, active) {
    if (deformer.protectionAt(point) > 0.999) return
    const settings = sculptRef.current
    // History belongs to the original rock coordinates. Resizing the window must
    // not move earlier strokes or reinterpret their radius during Undo/replay.
    const stroke = {
      point: deformer.toCanonical(point).toArray(),
      radius: THREE.MathUtils.clamp(deformer.radiusToCanonical(settings.brushSize, point), 1, 18),
      strength: settings.strength,
      mode: settings.mode,
    }
    deformer.sculpt(stroke)
    active.strokes.push(stroke)
  }

  function applyDragPoint(active, point) {
    const current = deformer.toCanonical(point)
    const previous = deformer.toCanonical(active.previous)
    const delta = current.sub(previous)
    if (delta.lengthSq() < 0.000001) return
    const stroke = {
      point: active.anchor, radius: active.radius,
      strength: sculptRef.current.strength, mode: active.mode,
      delta: delta.toArray(), gestureId: active.gestureId,
    }
    deformer.sculpt(stroke)
    active.strokes.push(stroke)
    active.previous.copy(point)
    active.lastTime = performance.now()
  }

  function pointerDown(event) {
    if (!sculptRef.current.enabled || event.button !== 0 || draggingRef.current) return
    event.stopPropagation()
    const mesh = meshRef.current
    if (!mesh) return
    const point = mesh.worldToLocal(event.point.clone())
    if (deformer.protectionAt(point) > 0.999) return
    const normal = event.face?.normal.clone() ?? Z_AXIS.clone()
    const active = {
      pointerId: event.pointerId,
      target: event.target,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), event.point),
      previous: point.clone(),
      pending: point.clone(),
      normal,
      lastTime: performance.now(),
      mode: sculptRef.current.mode,
      gestureId: ++gestureSerial.current,
      anchor: deformer.toCanonical(point).toArray(),
      radius: THREE.MathUtils.clamp(deformer.radiusToCanonical(sculptRef.current.brushSize, point), 1, 18),
      strokes: [],
    }
    draggingRef.current = active
    event.target.setPointerCapture(event.pointerId)
    if (active.mode !== 'grab' && active.mode !== 'stretch') stamp(point, active)
    updateCursor(point, normal)
  }

  function pointerMove(event) {
    if (!sculptRef.current.enabled) return
    event.stopPropagation()
    const mesh = meshRef.current
    if (!mesh) return
    const active = draggingRef.current
    if (!active) {
      const point = mesh.worldToLocal(scratch.local.copy(event.point))
      updateCursor(point, event.face?.normal ?? Z_AXIS)
      return
    }
    if (active.pointerId !== event.pointerId) return
    const now = performance.now()
    if (active.mode === 'grab' || active.mode === 'stretch') {
      // A fixed view plane makes the selected region follow the hand even when
      // the surface moves away from its original ray intersection.
      if (!event.ray.intersectPlane(active.plane, scratch.world)) return
      const point = mesh.worldToLocal(scratch.local.copy(scratch.world))
      active.pending.copy(point)
      updateCursor(point, active.normal)
      if (now - active.lastTime < 24) return
      applyDragPoint(active, point)
      return
    }
    // Follow the real curved surface while hit; captured off-mesh intersections
    // contain old points that no longer lie on the fresh pointer ray.
    const surfaceHit = event.intersections.find((hit) => hit.object === mesh && event.ray.distanceSqToPoint(hit.point) < 1e-8)
    if (surfaceHit) {
      scratch.world.copy(surfaceHit.point)
      if (surfaceHit.face) active.normal.copy(surfaceHit.face.normal)
    } else if (!event.ray.intersectPlane(active.plane, scratch.world)) return
    const point = mesh.worldToLocal(scratch.local.copy(scratch.world))
    updateCursor(point, active.normal)
    const distance = active.previous.distanceTo(point)
    const spacing = Math.max(0.3, sculptRef.current.brushSize * 0.12)
    if (now - active.lastTime < 35 || distance < spacing) return
    const steps = Math.min(8, Math.max(1, Math.ceil(distance / spacing)))
    for (let step = 1; step <= steps; step++) {
      scratch.stamp.lerpVectors(active.previous, point, step / steps)
      stamp(scratch.stamp, active)
    }
    active.previous.copy(point)
    active.lastTime = now
  }

  function pointerUp(event) {
    const active = draggingRef.current
    if (!active || active.pointerId !== event.pointerId) return
    event.stopPropagation()
    if ((active.mode === 'grab' || active.mode === 'stretch') && meshRef.current && event.ray.intersectPlane(active.plane, scratch.world)) {
      active.pending.copy(meshRef.current.worldToLocal(scratch.local.copy(scratch.world)))
    }
    finishStroke()
  }

  function pointerOut() {
    if (!draggingRef.current && cursorRef.current) cursorRef.current.visible = false
  }

  function blockScreen(event) {
    if (!sculptRef.current.enabled) return
    event.stopPropagation()
    if (cursorRef.current) cursorRef.current.visible = false
  }

  return {
    revision,
    draggingRef,
    blockScreen: sculpt.enabled ? blockScreen : undefined,
    canExpand: () => !sculptRef.current.enabled && performance.now() > blockedClickUntil.current,
    events: sculpt.enabled ? { onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerUp, onPointerOut: pointerOut } : {},
  }
}

function useMemoScratch() {
  const ref = useRef(null)
  if (!ref.current) ref.current = { world: new THREE.Vector3(), local: new THREE.Vector3(), stamp: new THREE.Vector3() }
  return ref.current
}
