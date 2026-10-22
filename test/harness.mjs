// Shared dev harness: loads the real client bundle against a fake React and a
// fake host, so the panel can be exercised (render-check.mjs) and screenshotted
// (preview.mjs) without a browser session.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

/** The bundle's own CSS, pulled out of its source (dev tool only). */
export function cssText() {
  const lines = source.split("\n").filter((line) => /^\s*'\./.test(line) && /\}',\s*$/.test(line));
  return lines.map((line) => line.trim().replace(/,$/, "").slice(1, -1)).join("\n");
}

function makeReact() {
  const stateSlots = [];
  const refSlots = [];
  const effectSlots = [];
  let stateIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const React = {
    createElement(type, props, ...children) {
      const merged = { ...(props || {}) };
      if (children.length > 0) merged.children = children.length === 1 ? children[0] : children;
      return { type, props: merged };
    },
    useState(init) {
      const i = stateIndex++;
      if (!(i in stateSlots)) stateSlots[i] = typeof init === "function" ? init() : init;
      return [stateSlots[i], (next) => { stateSlots[i] = typeof next === "function" ? next(stateSlots[i]) : next; }];
    },
    useRef(init) {
      const i = refIndex++;
      if (!(i in refSlots)) refSlots[i] = { current: init };
      return refSlots[i];
    },
    useEffect(fn, deps) {
      const i = effectIndex++;
      const prev = effectSlots[i];
      if (!prev || !sameDeps(prev.deps, deps)) {
        if (prev && typeof prev.cleanup === "function") prev.cleanup();
        effectSlots[i] = { deps, fn, cleanup: undefined, pending: true };
      }
    },
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
    useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); }
  };
  return {
    React,
    reset() { stateIndex = 0; refIndex = 0; effectIndex = 0; },
    flush() {
      for (const slot of effectSlots) {
        if (!slot || !slot.pending) continue;
        slot.pending = false;
        const out = slot.fn();
        if (typeof out === "function") slot.cleanup = out;
      }
    },
    stateSlots,
    effectSlots
  };
}

/** Load the bundle once; `resolve` builds the initial fake host services. */
export function loadBundle(host) {
  const store = new Map();
  const intervals = [];
  const document = {
    baseURI: "http://127.0.0.1:43129/?token=test",
    head: { appendChild() {} },
    createElement() { return {}; },
    getElementById() { return null; }
  };
  const localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); }
  };
  const setIntervalFake = (fn, ms) => { intervals.push({ fn, ms, id: intervals.length + 1 }); return intervals.length; };
  const clearIntervalFake = (id) => { const entry = intervals.find((candidate) => candidate.id === id); if (entry) entry.dead = true; };

  let registration = null;
  const window = {
    localStorage,
    document,
    setInterval: setIntervalFake,
    clearInterval: clearIntervalFake,
    __ModuleLoader__: { load: (reg) => { registration = reg; } }
  };
  const react = makeReact();
  const sandbox = {
    window,
    document,
    require: (name) => { if (name === "react") return react.React; throw new Error("unexpected require " + name); },
    fetch: host.fetch,
    console,
    URL, Set, Map, JSON, Math, Date, Number, String, Array, Object, Promise, Error, isNaN, parseInt, parseFloat,
    setTimeout, clearTimeout, setInterval: setIntervalFake, clearInterval: clearIntervalFake
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  if (!registration) throw new Error("bundle did not register with __ModuleLoader__");
  const bundle = registration.factory((name) => { if (name === "react") return react.React; throw new Error("bad require " + name); });

  const openedTabs = [];
  const stateListeners = [];
  const sidebar = {
    registerTab(descriptor) { sidebar.tab = descriptor; return () => {}; },
    openTab(seed, scope) { openedTabs.push({ seed, scope }); },
    subscribeState(listener) { stateListeners.push(listener); return () => {}; },
    getSnapshot() { return { sessionId: host.activeSessionId || "session-A", state: undefined, prefs: {} }; },
    hostRouteUrl(path) { return new URL(path, document.baseURI).href; }
  };
  const ctx = {
    get(name) {
      if (name === "sessions") return { list: { subscribe: () => () => {}, getSnapshot: () => host.sessions() } };
      if (name === "jobs") return { state: { subscribe: () => () => {}, getSnapshot: () => host.jobs() }, watchRows: () => () => {} };
      if (name === "betterSidebar") return sidebar;
      return undefined;
    },
    plugin(plugin) { plugin.apply({ betterSidebar: sidebar }); },
    effect(fn) { fn(); }
  };
  bundle.apply(ctx);

  return {
    react,
    sidebar,
    ctx,
    openedTabs,
    stateListeners,
    store,
    intervals,
    async fire(period) {
      for (const entry of intervals.filter((candidate) => !candidate.dead && candidate.ms === period)) entry.fn();
      await new Promise((resolve) => setTimeout(resolve, 30));
    },
    render(props) {
      react.reset();
      const element = sidebar.tab.component(props);
      return typeof element.type === "function" ? element.type(element.props) : element;
    },
    pump(props) { const tree = this.render(props); react.flush(); return tree; }
  };
}

// ---------- virtual tree -> HTML ----------
const escapeHtml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function styleText(style) {
  if (!style) return "";
  return Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => key.replace(/[A-Z]/g, (char) => "-" + char.toLowerCase()) + ":" + value)
    .join(";");
}

const ATTR_SKIP = new Set(["children", "ref", "key"]);
const kebab = (key) => key.replace(/[A-Z]/g, (char) => "-" + char.toLowerCase());

/** Every expandable row header's onClick, in render order. */
export function collectRowToggles(node, found = []) {
  if (node == null || typeof node === "string" || typeof node === "number") return found;
  if (Array.isArray(node)) { node.forEach((child) => collectRowToggles(child, found)); return found; }
  if (typeof node.type === "function") return collectRowToggles(node.type(node.props), found);
  if (node.props) {
    if (node.props.className === "wg-rhead" && typeof node.props.onClick === "function") found.push(node.props.onClick);
    collectRowToggles(node.props.children, found);
  }
  return found;
}

export function toHtml(node) {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return escapeHtml(node);
  if (Array.isArray(node)) return node.map(toHtml).join("");
  if (typeof node.type === "function") return toHtml(node.type(node.props));
  const props = node.props || {};
  const attrs = [];
  for (const [key, value] of Object.entries(props)) {
    if (ATTR_SKIP.has(key) || typeof value === "function" || value === undefined || value === null || value === false) continue;
    if (key === "className") attrs.push('class="' + escapeHtml(value) + '"');
    else if (key === "style") attrs.push('style="' + styleText(value) + '"');
    else attrs.push(kebab(key) + '="' + escapeHtml(value) + '"');
  }
  const open = "<" + node.type + (attrs.length ? " " + attrs.join(" ") : "");
  const inner = toHtml(props.children);
  return open + ">" + inner + "</" + node.type + ">";
}
