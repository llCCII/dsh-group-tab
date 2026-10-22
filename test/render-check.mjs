// Offline harness: runs the real client bundle against a fake React + fake host
// data, so the panel's runtime logic (lineage, fold→feed diff, jobs) is exercised
// without a browser. Not shipped; run with: node test/render-check.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { collectRowToggles } from "./harness.mjs";

const code = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

// ---------- fake React ----------
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
    const shouldRun = !prev || !sameDeps(prev.deps, deps);
    if (shouldRun) {
      if (prev && typeof prev.cleanup === "function") prev.cleanup();
      effectSlots[i] = { deps, fn, cleanup: undefined, pending: true };
    }
  },
  useMemo(fn) { return fn(); },
  useCallback(fn) { return fn; },
  useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); }
};

// ---------- fake DOM ----------
const store = new Map();
const styleTags = new Map();
const document = {
  baseURI: "http://127.0.0.1:43129/?token=test",
  head: { appendChild(tag) { styleTags.set(tag.id, tag); } },
  createElement() { return {}; },
  getElementById(id) { return styleTags.get(id) || null; }
};
const localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); }
};

// ---------- fake host data ----------
const startedAt = Date.now();
const sessions = {
  byId: {
    "session-A": { id: "session-A", displayTitle: "测试对话", running: true },
    "session-B": { id: "session-B", displayTitle: "子代理 · 核验链接", origin: "subagent", parentId: "session-A", running: true },
    "session-C": { id: "session-C", displayTitle: "别的对话", running: false }
  }
};
const jobsSnapshot = {
  rows: {
    "session-A": [{ id: "pwsh-4", kind: "pwsh", label: "curl -L https://example.com/x.zip", status: "running", startedAt: startedAt - 30000, owner: "session-A" }]
  },
  observed: {}
};
const baseLive = {
  "session-A": {
    summary: { counts: [{ kind: "commands", count: 2 }], running: "commands", runningDetail: "curl -L https://example.com/x.zip" },
    text: "我先看看这个仓库是不是真有那个包。",
    lastEventTime: Date.now()
  },
  "session-B": {
    running: true,
    summary: { counts: [{ kind: "webFetch", count: 1 }], running: "webFetch", runningDetail: "https://gh-proxy.com/README.md" },
    text: "正在核验 README。",
    lastEventTime: Date.now() - 500
  }
};
let liveOverride = { live: baseLive };
const fetchCalls = [];
function fetchStub(url) {
  fetchCalls.push(url);
  if (String(url).endsWith("git.models")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, value: { recent: [{ provider: "deepseek-official", model: "deepseek-flash" }], providers: [] } })
    });
  }
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, value: liveOverride }) });
}

// ---------- controllable timers ----------
const intervals = [];
const fakeSetInterval = (fn, ms) => { intervals.push({ fn, ms, id: intervals.length + 1 }); return intervals.length; };
const fakeClearInterval = (id) => { const entry = intervals.find((candidate) => candidate.id === id); if (entry) entry.dead = true; };
async function fireIntervals(period) {
  for (const entry of intervals.filter((candidate) => !candidate.dead && candidate.ms === period)) entry.fn();
  await new Promise((resolve) => setTimeout(resolve, 30));
}

// ---------- load the real bundle ----------
let registration = null;
const window = {
  localStorage,
  document,
  setInterval: fakeSetInterval,
  clearInterval: fakeClearInterval,
  __ModuleLoader__: { load: (reg) => { registration = reg; } }
};
const sandbox = {
  window,
  document,
  require: (name) => { if (name === "react") return React; throw new Error("unexpected require " + name); },
  fetch: fetchStub,
  console,
  URL, Set, Map, JSON, Math, Date, Number, String, Array, Object, Promise, Error, isNaN, parseInt, parseFloat,
  setTimeout, clearTimeout, setInterval: fakeSetInterval, clearInterval: fakeClearInterval
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
if (!registration) throw new Error("bundle did not register with __ModuleLoader__");

const bundle = registration.factory((name) => { if (name === "react") return React; throw new Error("bad require " + name); });

// ---------- fake ctx / sidebar ----------
let registered = null;
const openedTabs = [];
const stateListeners = [];
const betterSidebar = {
  registerTab(descriptor) { registered = descriptor; return () => {}; },
  openTab(seed, scope) { openedTabs.push({ seed, scope }); },
  subscribeState(listener) { stateListeners.push(listener); return () => {}; },
  getSnapshot() { return { sessionId: "session-A", state: undefined, prefs: {} }; },
  hostRouteUrl(path) { return new URL(path, "http://127.0.0.1:43129/").href; }
};
const ctx = {
  get(name) {
    if (name === "sessions") return { list: { subscribe: () => () => {}, getSnapshot: () => sessions } };
    if (name === "jobs") return { state: { subscribe: () => () => {}, getSnapshot: () => jobsSnapshot }, watchRows: () => () => {} };
    if (name === "betterSidebar") return betterSidebar;
    return undefined;
  },
  plugin(plugin) { plugin.apply({ betterSidebar }); },
  effect(fn) { fn(); }
};
bundle.apply(ctx);
if (!registered) throw new Error("tab was not registered");
console.log("registered tab:", registered.id, "| title:", typeof registered.title === "function" ? registered.title() : registered.title);
for (const listener of stateListeners) listener(); // the shell publishes the active session
console.log("tabs opened on boot:", openedTabs.map((entry) => entry.scope && entry.scope.sessionId).join(",") || "-");
await fireIntervals(4000);
console.log("auto-open calls:", openedTabs.length, openedTabs.map((entry) => entry.scope && entry.scope.sessionId).join(",") || "-");

// ---------- render loop ----------
let tree = null;
function render() {
  stateIndex = 0; refIndex = 0; effectIndex = 0;
  const element = registered.component({ ctx, scope: { sessionId: "session-A" }, tab: { id: registered.id }, visible: true });
  tree = typeof element.type === "function" ? element.type(element.props) : element;
  return tree;
}
function flushEffects() {
  for (const slot of effectSlots) {
    if (!slot || !slot.pending) continue;
    slot.pending = false;
    const out = slot.fn();
    if (typeof out === "function") slot.cleanup = out;
  }
}
async function pump(times = 2) {
  for (let i = 0; i < times; i += 1) {
    render();
    flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
function textOf(node) {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node.type === "function") return textOf(node.type(node.props));
  if (node.props) {
    const children = node.props.children;
    return node.props.text != null ? String(node.props.text) + textOf(children) : textOf(children);
  }
  return "";
}
// Collect the expandable row headers (their onClick flips the expanded set).
function expandAll() {
  for (const toggle of collectRowToggles(tree)) toggle({});
}

await pump(1);
await fireIntervals(2000);
await pump(2);
const first = textOf(tree);
console.log("\n--- collapsed ---\n" + first);

expandAll();
await pump(2);
const firstOpen = textOf(tree);
console.log("\n--- expanded ---\n" + firstOpen);

liveOverride = {
  live: {
    "session-A": baseLive["session-A"],
    "session-B": { running: false, text: "核验完了：找到 README。", lastEventTime: Date.now() }
  }
};
await fireIntervals(2000);
await fireIntervals(1000);
await pump(2);
const second = textOf(tree);
console.log("\n--- after child finishes (expanded) ---\n" + second);

jobsSnapshot.rows["session-A"] = [{ ...jobsSnapshot.rows["session-A"][0], status: "completed", finishedAt: Date.now() }];
await fireIntervals(1000);
await pump(2);
const third = textOf(tree);
console.log("\n--- after job settles (expanded) ---\n" + third);

// ---------- awaiting: the one member that blocks the tree sorts first ----------
liveOverride = {
  live: {
    "session-A": { ...baseLive["session-A"], running: false, summary: { counts: [] } },
    "session-B": { running: true, summary: { running: "questions", runningDetail: "批准 write?" }, text: "要你拍板", lastEventTime: Date.now() }
  }
};
sessions.byId["session-B"].running = true;
await fireIntervals(2000);
await fireIntervals(1000);
await pump(2);
expandAll();
await pump(2);
const waiting = textOf(tree);
console.log("\n--- awaiting ---\n" + waiting);

// ---------- idle: with nobody running the 2s poll must stop ----------
sessions.byId["session-A"].running = false;
sessions.byId["session-B"].running = false;
liveOverride = { live: { "session-A": { running: false, summary: { counts: [] }, text: "都结束了", lastEventTime: Date.now() } } };
await fireIntervals(2000);
await fireIntervals(1000);
await pump(3);
const idleText = textOf(tree);
const idleBaseline = fetchCalls.length;
await fireIntervals(2000);
await fireIntervals(2000);
await fireIntervals(1000);
const idleAfter = fetchCalls.length;
console.log("\n--- idle ---\n" + idleText);
console.log("polls while idle:", idleAfter - idleBaseline);

console.log("\nfetch calls:", fetchCalls.length, "| first call:", fetchCalls[0]);
console.log("localStorage keys:", [...store.keys()]);
const checks = [
  ["roster shows the main agent", first.includes("主代理")],
  ["roster shows the child by title", first.includes("子代理 · 核验链接")],
  ["collapsed row shows what it is doing", first.includes("跑命令 · curl") && first.includes("抓网页 · https://gh-proxy")],
  ["collapsed row shows the model", first.includes("deepseek-flash")],
  ["collapsed row shows the eta", first.includes("剩余 ~") || first.includes("时长未知")],
  ["collapsed row hides the event log", !first.includes("收工")],
  ["expanded shows the model route", firstOpen.includes("deepseek-official / deepseek-flash")],
  ["expanded shows the background job", firstOpen.includes("后台任务") && firstOpen.includes("curl -L https://example.com/x.zip")],
  ["child text arrives in the expanded log", second.includes("核验完了：找到 README")],
  ["child finish is announced", second.includes("收工")],
  ["job settlement is announced", third.includes("后台任务结束")],
  ["durations were recorded", store.has("dsh-workgroup:durations")],
  ["header counts running members", first.includes("个成员在干活")],
  ["model was fetched per session", fetchCalls.some((url) => String(url).endsWith("git.models"))],
  ["poll hit the sidebar route path", String(fetchCalls[0]).endsWith("/sidebar/api/subagents.live")],
  ["boot open targeted the active session", openedTabs.length >= 1 && openedTabs[0].scope.sessionId === "session-A"],
  ["second open targeted the tree root", openedTabs.some((entry) => entry.scope.sessionId === "session-A")],
  ["awaiting member is called out in the header", waiting.includes("个在等你")],
  ["awaiting member is badged", waiting.includes("核验链接!")],
  ["idle panel announces it stopped polling", idleText.includes("空闲不轮询")],
  ["idle panel issues no polls", idleAfter === idleBaseline]
];
let failed = 0;
for (const [label, ok] of checks) {
  console.log((ok ? "  PASS " : "  FAIL ") + label);
  if (!ok) failed += 1;
}
console.log(failed === 0 ? "\nALL CHECKS PASSED" : "\n" + failed + " CHECK(S) FAILED");
process.exit(failed === 0 ? 0 : 1);
