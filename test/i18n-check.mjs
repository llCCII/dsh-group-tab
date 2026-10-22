import { readFileSync } from "node:fs";
import vm from "node:vm";
const code = readFileSync("lib/client.js", "utf8");
let reg = null;
const React = { createElement: (t, p) => ({ t, p }), useState: (v) => [v, () => {}], useRef: (v) => ({ current: v }), useEffect: () => {}, useMemo: (f) => f(), useCallback: (f) => f, useSyncExternalStore: (s, g) => g() };
const sandbox = {
  window: { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, __ModuleLoader__: { load: (r) => { reg = r } } },
  document: { baseURI: "http://x/" },
  navigator: { language: "en-US" },
  require: () => React, fetch: () => Promise.resolve({}), console,
  URL, Set, Map, JSON, Math, Date, Number, String, Array, Object, Promise, Error, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const bundle = reg.factory(() => React);
let descriptor = null;
const ctx = { get: (n) => ({ list: { subscribe: () => () => {}, getSnapshot: () => ({ byId: {} }) } }), plugin: (p) => p.apply({ betterSidebar: { registerTab: (d) => { descriptor = d; return () => {} }, openTab() {}, subscribeState: () => () => {}, getSnapshot: () => ({}) , hostRouteUrl: (p) => "http://x/" + p } }), effect: (f) => f() };
bundle.apply(ctx);
console.log("title:", descriptor.title(), "| desc:", descriptor.description());
