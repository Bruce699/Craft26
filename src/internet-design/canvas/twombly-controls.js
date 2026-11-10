// Twombly controls: live design values, shown beside the frame on a Twombly canvas and moved by everyone there.
// Added by twombly controls; leave this file as it is. Outside Twombly nothing shows and values stay as the code has them.
//
//   const card = controls('Card', {radius: [12, 0, 48], tint: '#3366ff', shadow: true});
//   card.get().radius          the values, nested as the config is; the same object until one changes
//   card.subscribe(listener)   hears every change; returns a function that stops it
const KEY = '__twomblyControls';
const labelOf = key => key.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase());
const stepFor = span => span <= 1 ? 0.01 : span <= 10 ? 0.1 : span <= 200 ? 1 : 10;
const isColor = v => /^(#[\da-f]{3,8}$|(rgba?|hsla?|oklch|oklab|lab|lch|color)\()/i.test(v.trim());
const optionValue = o => typeof o === 'string' ? o : o.value;
const copy = v => v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;

function parse(config, prefix, defaults, runs) {
 const list = [];
 for (const [key, v] of Object.entries(config)) {
  if (key === '_collapsed') continue;
  const path = prefix ? prefix + '.' + key : key, label = (v && v.label) || labelOf(key), add = (c, value) => { list.push({path, label, ...c}); defaults[path] = copy(value); };
  if (Array.isArray(v) && typeof v[0] === 'number') add({type: 'slider', min: v[1], max: v[2], step: v[3] ?? stepFor(v[2] - v[1])}, v[0]);
  else if (typeof v === 'number') { const top = v >= 0 && v <= 1 ? 1 : Math.abs(v) * 3 || 100, min = v < 0 ? -top : 0; add({type: 'slider', min, max: top, step: stepFor(top - min)}, v); }
  else if (typeof v === 'boolean') add({type: 'toggle'}, v);
  else if (typeof v === 'string') add({type: isColor(v) ? 'color' : 'text'}, v);
  else if (!v || typeof v !== 'object') continue;
  else if (v.type === 'spring' || v.type === 'easing') add({type: 'transition'}, v);
  else if (v.type === 'select') add({type: 'select', options: v.options}, v.default ?? optionValue(v.options[0]));
  else if (v.type === 'color') add({type: 'color'}, v.default);
  else if (v.type === 'text') add({type: 'text', placeholder: v.placeholder}, v.default ?? '');
  else if (v.type === 'image') add({type: 'image', options: v.options}, v.default ?? '');
  else if (v.type === 'pad') add({type: 'pad', pad: {x: v.x, y: v.y}}, {x: v.x[0], y: v.y[0]});
  else if (v.type === 'action') { list.push({type: 'action', path, label}); if (v.run) runs[path] = v.run; }
  else list.push({type: 'folder', path, label, defaultOpen: !v._collapsed, children: parse(v, path, defaults, runs)});
 }
 return list;
}
const flatten = (list, out = {}) => { for (const c of list) { out[c.path] = c; if (c.children) flatten(c.children, out); } return out; };
function fits(c, value, start) {
 if (!c || c.type === 'folder' || c.type === 'action' || typeof value !== typeof start || value === null) return undefined;
 return c.type === 'slider' ? (Number.isFinite(value) ? Math.min(c.max, Math.max(c.min, value)) : undefined) : value;
}
function nest(values) {
 const out = {};
 for (const [path, value] of Object.entries(values)) { const keys = path.split('.'), last = keys.pop(); let at = out; for (const k of keys) at = at[k] ||= {}; at[last] = value; }
 return out;
}

function createStore() {
 const panels = new Map(), everyone = new Set();
 const tellAll = () => { for (const fn of [...everyone]) fn(); };
 const changed = p => { p.snapshot = null; for (const fn of [...p.listeners]) fn(); };
 const valuesOf = p => ({...p.defaults, ...p.moved});
 return {
  register(name, config) {
   const shape = JSON.stringify(config), defaults = {}, runs = {}, had = panels.get(name);
   if (had && had.shape === shape) { parse(config, '', defaults, runs); had.runs = runs; return had; }
   const controls = parse(config, '', defaults, runs), byPath = flatten(controls), moved = {};
   for (const [path, value] of Object.entries(had?.moved || {})) { const v = fits(byPath[path], value, defaults[path]); if (v !== undefined) moved[path] = v; }
   const p = Object.assign(had || {id: name, name, listeners: new Set()}, {shape, controls, byPath, defaults, moved, runs, snapshot: null});
   panels.set(name, p);
   if (had) changed(p);
   tellAll();
   return p;
  },
  read: p => p.snapshot ||= nest(valuesOf(p)),
  remove(name) { if (panels.delete(name)) tellAll(); },
  getPanels: () => [...panels.values()].map(({id, name, controls}) => ({id, name, controls})),
  getValues: id => { const p = panels.get(id); return p ? valuesOf(p) : {}; },
  updateValues(id, values) {
   const p = panels.get(id); if (!p) return;
   for (const [path, value] of Object.entries(values)) { const v = fits(p.byPath[path], value, p.defaults[path]); if (v !== undefined) p.moved[path] = v; }
   changed(p);
  },
  resetValues(id) { const p = panels.get(id); if (p) { p.moved = {}; changed(p); } },
  triggerAction(id, path) { panels.get(id)?.runs[path]?.(); },
  subscribe(id, fn) { const p = panels.get(id); p?.listeners.add(fn); return () => p?.listeners.delete(fn); },
  subscribeGlobal(fn) { everyone.add(fn); return () => everyone.delete(fn); },
 };
}

export function controls(name, config) {
 if (typeof window === 'undefined') {
  const defaults = {}; parse(config, '', defaults, {});
  const values = nest(defaults);
  return {get: () => values, subscribe: () => () => {}, remove() {}};
 }
 const store = window[KEY] ||= createStore(), panel = store.register(name, config);
 return {
  get: () => store.read(panel),
  subscribe(fn) { panel.listeners.add(fn); return () => panel.listeners.delete(fn); },
  remove: () => store.remove(name),
 };
}
