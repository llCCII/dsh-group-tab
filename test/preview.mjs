// Renders the real panel to static HTML (dark busy / dark empty / light busy) so
// the layout can be screenshotted and reviewed. Dev tool only.
//   node test/preview.mjs <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectRowToggles, cssText, loadBundle, toHtml } from "./harness.mjs";

const outDir = process.argv[2] || join(process.cwd(), ".preview");
mkdirSync(outDir, { recursive: true });

const T0 = Date.now();
function scenarioBusy() {
  const sessions = {
    byId: {
      "session-A": { id: "session-A", displayTitle: "把「工作群」做成实时面板", running: true },
      "session-B": { id: "session-B", displayTitle: "子代理 · 核验链接", origin: "subagent", parentId: "session-A", running: true },
      "session-C": { id: "session-C", displayTitle: "子代理 · 下载资源", origin: "subagent", parentId: "session-A", running: true },
      "session-D": { id: "session-D", displayTitle: "子代理 · 写测试", origin: "subagent", parentId: "session-A", running: true }
    }
  };
  const jobs = {
    rows: {
      "session-A": [{ id: "pwsh-4", kind: "pwsh", label: "curl -L https://gh-proxy.com/…/Filee.zip", status: "running", progress: "62%  ·  91 MB / 147 MB", startedAt: T0 - 84000, owner: "session-A" }]
    },
    observed: {}
  };
  const live = {
    "session-A": {
      summary: { counts: [{ kind: "commands", count: 6 }], running: "commands", runningDetail: "curl -L https://gh-proxy.com/…/Filee.zip" },
      text: "镜像通了，先下大包，同时让两个人去核验来源。",
      lastEventTime: T0 - 400
    },
    "session-B": {
      running: true,
      summary: { counts: [{ kind: "webFetch", count: 3 }], running: "webFetch", runningDetail: "https://raw.githubusercontent.com/…/SKILL.md" },
      text: "README 拿到了，正在比对 frontmatter。",
      lastEventTime: T0 - 900
    },
    "session-C": {
      running: true,
      summary: { counts: [{ kind: "read", count: 2 }], running: "read", runningDetail: "D:\\py\\skills\\model-routing\\SKILL.md" },
      text: "路由表读完了，开始拆免费车道。",
      lastEventTime: T0 - 1800
    },
    "session-D": {
      running: true,
      summary: { counts: [{ kind: "write", count: 1 }], running: "write", runningDetail: "test/render-check.mjs" },
      text: "先把断言写出来。",
      lastEventTime: T0 - 3000
    }
  };
  return { sessions, jobs, live: { live } };
}

function scenarioEmpty() {
  return {
    sessions: { byId: { "session-A": { id: "session-A", displayTitle: "空对话", running: false } } },
    jobs: { rows: {}, observed: {} },
    live: { live: { "session-A": { text: "", lastEventTime: T0 - 60000 } } }
  };
}

async function build(fixture) {
  let current = fixture();
  let liveValue = current.live;
  const runtime = loadBundle({
    fetch: (url) => {
      if (String(url).endsWith("git.models")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ok: true, value: { recent: [{ provider: "deepseek-official", model: "deepseek-flash" }], providers: [] } })
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, value: liveValue }) });
    },
    sessions: () => current.sessions,
    jobs: () => current.jobs,
    activeSessionId: "session-A"
  });
  const props = { ctx: runtime.ctx, scope: { sessionId: "session-A" }, tab: { id: "dsh-group-tab:group" }, visible: true };

  if (fixture === scenarioBusy) {
    // realistic clock + a couple of finished runs so the ETA reads "本机历史中位"
    runtime.store.set("dsh-workgroup:started", JSON.stringify({
      "session-A": T0 - 83000,
      "session-B": T0 - 52000,
      "session-C": T0 - 21000,
      "session-D": T0 - 96000
    }));
    runtime.store.set("dsh-workgroup:durations", JSON.stringify({ child: [96000, 118000, 104000, 131000], job: [180000] }));
  }

  // first paint + poll
  let tree = runtime.pump(props);
  for (const listener of runtime.stateListeners) listener();
  await runtime.fire(2000);
  tree = runtime.pump(props);

  if (fixture === scenarioBusy) {
    // child D finishes, B changes its line, A starts a new command
    current.sessions.byId["session-D"].running = false;
    liveValue = {
      live: {
        "session-A": { ...fixture().live.live["session-A"], summary: { counts: [], running: "edit", runningDetail: "lib/client.js" }, text: "样式重写完了，正在回归测试。" },
        "session-B": { ...fixture().live.live["session-B"], text: "核验完了：README 与 npm 包都对得上。" },
        "session-C": fixture().live.live["session-C"],
        "session-D": { running: false, text: "12 项断言全过。", lastEventTime: T0 - 1000 }
      }
    };
    await runtime.fire(2000);
    tree = runtime.pump(props);
    await runtime.fire(1000);
    tree = runtime.pump(props);
    // show one row expanded (the second member) so the screenshot covers both states
    const toggles = collectRowToggles(tree);
    if (toggles.length > 1) toggles[1]({});
    tree = runtime.pump(props);
  }
  return toHtml(tree);
}

const darkTokens = `
:root{--dsw-alias-bg-base:#1b1b1f;--dsw-alias-bg-layer-1:#232328;--dsw-alias-bg-layer-2:#2c2c33;--dsw-alias-bg-overlay:#2a2a30;--dsw-alias-border-l1:#34343c;--dsw-alias-border-l2:#464650;--dsw-alias-brand-primary:#4d8dff;--dsw-alias-label-primary:#e9e9ef;--dsw-alias-label-secondary:#a9a9b4;--dsw-alias-label-tertiary:#75757f;--dsw-alias-state-error-primary:#ff6b62;--dsw-alias-state-idle-primary:#6e7681;--dsw-alias-state-success-primary:#3fb950;--dsw-alias-state-warn-primary:#d29922;--dsw-specific-sidebar-fill:#18181c}`;
const lightTokens = `
:root{--dsw-alias-bg-base:#ffffff;--dsw-alias-bg-layer-1:#f6f8fa;--dsw-alias-bg-layer-2:#eaeef2;--dsw-alias-bg-overlay:#ffffff;--dsw-alias-border-l1:#d0d7de;--dsw-alias-border-l2:#afb8c1;--dsw-alias-brand-primary:#0969da;--dsw-alias-label-primary:#1f2328;--dsw-alias-label-secondary:#59636e;--dsw-alias-label-tertiary:#818b98;--dsw-alias-state-error-primary:#cf222e;--dsw-alias-state-idle-primary:#818b98;--dsw-alias-state-success-primary:#1a7f37;--dsw-alias-state-warn-primary:#9a6700;--dsw-specific-sidebar-fill:#f6f8fa}`;

const page = (title, tokens, frames) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>${tokens}${cssText()}
html,body{margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.pgwrap{background:#0d1117;min-height:100vh;padding:18px;display:flex;gap:16px;align-items:flex-start;color:#8b949e;font-size:11px}
.pgcell{display:flex;flex-direction:column;gap:6px}
.pgcell > b{font-weight:600;color:#c9d1d9}
.pgframe{width:372px;height:820px;border-radius:12px;overflow:hidden;border:1px solid #30363d;display:flex;background:var(--dsw-alias-bg-base)}
.pgframe .wg-root{flex:1;min-width:0}
</style></head><body><div class="pgwrap">${frames}</div></body></html>`;

const busy = await build(scenarioBusy);
const empty = await build(scenarioEmpty);

writeFileSync(join(outDir, "panel.html"), page("工作群 preview", darkTokens,
  `<div class="pgcell"><b>dark · 372px · 有人在跑</b><div class="pgframe">${busy}</div></div>
   <div class="pgcell"><b>dark · 372px · 空态</b><div class="pgframe">${empty}</div></div>`));

writeFileSync(join(outDir, "panel-light.html"), page("工作群 preview light", lightTokens,
  `<div class="pgcell"><b>light · 372px · 有人在跑</b><div class="pgframe">${busy}</div></div>`));

console.log("wrote", join(outDir, "panel.html"), "and panel-light.html");
