import * as THREE from 'three'

const clamp = THREE.MathUtils.clamp
const limit = (v, lo, hi, fallback = 0) => clamp(Number.isFinite(v) ? v : fallback, lo, hi)
const EPS = 1e-7
const cell = 4
const key = (x, y) => (x + 512) * 1024 + y + 512

// Index the editable stock once. Moving the opening only examines nearby faces.
function stockIndex(geo, f) {
  const p = geo.attributes.position, n = geo.attributes.normal, faces = geo.index.array
  const vertices = [], bins = new Map(), v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(f.center)
    vertices.push([v.dot(f.u), v.dot(f.v), v.dot(f.normal), n.getX(i), n.getY(i), n.getZ(i), i])
  }
  for (let t = 0; t < faces.length; t += 3) {
    const a = vertices[faces[t]], b = vertices[faces[t + 1]], c = vertices[faces[t + 2]]
    for (let x = Math.floor(Math.min(a[0], b[0], c[0]) / cell); x <= Math.floor(Math.max(a[0], b[0], c[0]) / cell); x++) {
      for (let y = Math.floor(Math.min(a[1], b[1], c[1]) / cell); y <= Math.floor(Math.max(a[1], b[1], c[1]) / cell); y++) {
        const k = key(x, y)
        if (!bins.has(k)) bins.set(k, [])
        bins.get(k).push(t)
      }
    }
  }
  function depths(x, y) {
    let front = -Infinity, back = Infinity
    for (const t of bins.get(key(Math.floor(x / cell), Math.floor(y / cell))) ?? []) {
      const a = vertices[faces[t]], b = vertices[faces[t + 1]], c = vertices[faces[t + 2]]
      const bx = b[0]-a[0], by = b[1]-a[1], cx = c[0]-a[0], cy = c[1]-a[1]
      const det = bx*cy - by*cx
      if (Math.abs(det) < EPS) continue
      const u = ((x-a[0])*cy-(y-a[1])*cx)/det, v = (bx*(y-a[1])-by*(x-a[0]))/det
      if (u < -EPS || v < -EPS || u+v > 1+EPS) continue
      const z = a[2] + u*(b[2]-a[2]) + v*(c[2]-a[2])
      front = Math.max(front,z); back = Math.min(back,z)
    }
    return [front,back]
  }
  return { vertices, faces, bins, depths }
}

function clip(poly, axis, value, sign) {
  const inside = [], outside = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i+1)%poly.length]
    const da = (a[axis]-value)*sign, db = (b[axis]-value)*sign
    ;(da >= 0 ? inside : outside).push(a)
    if ((da < 0) === (db < 0)) continue
    const t = da / (da-db), v = a.slice(0,6).map((n,j) => n+t*(b[j]-n))
    v[axis] = value
    inside.push(v); outside.push(v)
  }
  return [inside,outside]
}

export function createSpearOpening(base) {
  const stock = base.geometry
  // The scan's measured UV tangent is slightly skew to its averaged normal.
  // An orthonormal basis makes section intersections map back onto the exact
  // original triangle plane, including when a cut splits a long triangle.
  const f = { ...base.frame, u: base.frame.v.clone().cross(base.frame.normal).normalize() }
  const geometry = new THREE.BufferGeometry(), screenGeometry = new THREE.PlaneGeometry(1,1)
  // The reference video's U direction opposes the blade's visible-right axis.
  const uv = screenGeometry.attributes.uv
  for (let i=0;i<uv.count;i++) uv.setX(i,1-uv.getX(i))
  const screenTemplate = screenGeometry.attributes.position.clone()
  const frame = { ...f, center: f.center.clone() }
  const world = (x,y,z) => f.center.clone().addScaledVector(f.u,x).addScaledVector(f.v,y).addScaledVector(f.normal,z)
  const bevel = 0.28
  let index, half, x, y, floor, settings = {}
  function fit() {
    const w = limit(settings.width,0.4,2,1), h = limit(settings.height,0.4,2,1)
    const requestedHalf = Math.sqrt(f.halfWidth*f.halfHeight*w*h)
    // Leave solid stone beyond all corners and behind the floor. Test the
    // actual sculpted stock, including the notches, rather than its bounding box.
    for (let step=0;step<=24;step++) {
      const travel = Math.max(0,1-step/16)
      half = requestedHalf * (1-Math.max(0,step-16)*0.085)
      x = limit(settings.offsetX,-10,10)*travel
      y = limit(settings.offsetY,-14,18)*travel
      let front = Infinity, back = -Infinity
      for (let j=-2;j<=2;j++) for(let i=-2;i<=2;i++) {
        const [hi,lo] = index.depths(x+i*(half+0.8)/2,y+j*(half+0.8)/2)
        front = Math.min(front,hi); back = Math.max(back,lo)
      }
      if (front-back > 1.65) { floor=front-0.85; return true }
    }
    return false
  }
  function refresh() {
    index ??= stockIndex(stock,f)
    if (!fit()) { geometry.copy(stock); screenGeometry.setDrawRange(0,0); return }
    screenGeometry.setDrawRange(0,6)
    frame.center.copy(world(x,y,floor))
    const sp=screenGeometry.attributes.position
    for(let i=0;i<sp.count;i++) {
      const point=world(x+screenTemplate.getX(i)*2*(half-bevel),y+screenTemplate.getY(i)*2*(half-bevel),floor)
      sp.setXYZ(i,point.x,point.y,point.z)
      screenGeometry.attributes.normal.setXYZ(i,f.normal.x,f.normal.y,f.normal.z)
    }
    sp.needsUpdate=true; screenGeometry.attributes.normal.needsUpdate=true
    screenGeometry.computeBoundingBox(); screenGeometry.computeBoundingSphere()
    const positions=[], normals=[], fresh=[], removed=new Set(), candidates=new Set()
    const planes=[[0,x-half,1],[0,x+half,-1],[1,y-half,1],[1,y+half,-1],[2,floor,1]]
    for(let cx=Math.floor((x-half)/cell);cx<=Math.floor((x+half)/cell);cx++)
      for(let cy=Math.floor((y-half)/cell);cy<=Math.floor((y+half)/cell);cy++)
        for(const t of index.bins.get(key(cx,cy))??[]) candidates.add(t)
    const add=v=>{
      if (v[6]!==undefined) return v[6]
      const i=stock.attributes.position.count+positions.length/3, p=world(v[0],v[1],v[2])
      positions.push(p.x,p.y,p.z); normals.push(v[3],v[4],v[5]); v[6]=i; return i
    }
    const fan=poly=>{ for(let i=1;i+1<poly.length;i++) fresh.push(add(poly[0]),add(poly[i]),add(poly[i+1])) }
    const {vertices,faces}=index
    for(const t of candidates) {
      let poly=[vertices[faces[t]],vertices[faces[t+1]],vertices[faces[t+2]]]
      if(planes.some(([a,v,s])=>poly.every(p=>(p[a]-v)*s<=0))) continue
      const retained=[]
      for(const plane of planes) {
        const [inside,outside]=clip(poly,...plane)
        if(outside.length>=3) retained.push(outside)
        poly=inside
        if(poly.length<3) break
      }
      if(poly.length<3) continue
      removed.add(t); retained.forEach(fan)
      // Extrude only the exposed cross section inward, ending exactly at the
      // player. There is no outer bezel and no change to uncut surface normals.
      for(let i=0;i<poly.length;i++) {
        const a=poly[i], b=poly[(i+1)%poly.length]
        for(const [axis,v,sign] of planes.slice(0,4)) {
          if(Math.abs(a[axis]-v)>EPS||Math.abs(b[axis]-v)>EPS) continue
          const n=(axis===0?f.u:f.v).clone().multiplyScalar(sign)
          // A narrow worn chamfer recedes into the stock. Its outer edge
          // shares the blade normal; the inner edge blends into the cut wall.
          const shoulder = p => {
            const blended = new THREE.Vector3(p[3],p[4],p[5]).add(n).normalize()
            return [x+(p[0]-x)*(half-bevel)/half, y+(p[1]-y)*(half-bevel)/half,
              Math.max(floor,p[2]-0.45), blended.x,blended.y,blended.z]
          }
          const innerA=shoulder(a), innerB=shoulder(b)
          const top=p=>p.slice(0,6)
          const bottom=p=>[p[0],p[1],floor,n.x,n.y,n.z]
          fan([top(a),top(b),innerB,innerA])
          fan([innerA,innerB,bottom(innerB),bottom(innerA)])
        }
      }
    }
    const indices=[]
    for(let i=0;i<faces.length;i+=3) if(!removed.has(i)) indices.push(faces[i],faces[i+1],faces[i+2])
    for(const i of fresh) indices.push(i)
    geometry.dispose()
    for (const [name,extra] of [['position',positions],['normal',normals]]) {
      const orig=stock.attributes[name].array, dst=new Float32Array(orig.length+extra.length)
      dst.set(orig); dst.set(extra,orig.length); geometry.setAttribute(name,new THREE.BufferAttribute(dst,3))
    }
    geometry.setIndex(indices)
    geometry.boundingBox=stock.boundingBox.clone(); geometry.boundingSphere=stock.boundingSphere.clone()
  }
  refresh()
  return {
    geometry, screenGeometry, frame, anchor:base.anchor, aspect:1,
    get window(){return {width:(half-bevel)/f.halfWidth,height:(half-bevel)/f.halfHeight}},
    setWindow(s){settings=s;refresh()},
    apply(shape,strokes){base.apply(shape,strokes);index=null;refresh()},
    sculpt(stroke){base.sculpt(stroke);index=null;refresh()},
    protectionAt(p){const q=p.clone().sub(frame.center);return Math.abs(q.dot(f.u))<=half+0.5 && Math.abs(q.dot(f.v))<=half+0.5 ? 1 : base.protectionAt(p)},
    toCanonical:p=>p.clone(), radiusToCanonical:r=>r,
    dispose(){geometry.dispose();screenGeometry.dispose();base.dispose()},
  }
}
