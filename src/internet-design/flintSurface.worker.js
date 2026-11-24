import { bakeFlintSurface } from './flintSurface.js'

const baked = bakeFlintSurface()
self.postMessage(baked, [baked.field.buffer, baked.relief.buffer])
