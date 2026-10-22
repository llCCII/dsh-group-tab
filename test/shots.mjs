// Dev tool: render the panel HTML (test/preview.mjs) and capture the two
// README screenshots. Needs playwright + a chromium build; not part of CI.
//   node test/shots.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PLAYWRIGHT = "C:/Users/13948/AppData/Roaming/dsh-desktop/harness/profiles/web/node_modules/playwright";
const require = createRequire(import.meta.url);
const { chromium } = require(PLAYWRIGHT);

const tmp = mkdtempSync(join(tmpdir(), "group-tab-shots-"));
const out = new URL("../preview/", import.meta.url);
mkdirSync(out, { recursive: true });

execFileSync(process.execPath, [new URL("./preview.mjs", import.meta.url).pathname.replace(/^\//, ""), tmp], { stdio: "inherit" });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
const shots = [
  ["panel.html", 0, "workgroup-dark.png"],
  ["panel-light.html", 0, "workgroup-light.png"]
];
for (const [file, index, name] of shots) {
  await page.goto(pathToFileURL(join(tmp, file)).href);
  const frames = await page.$$(".pgframe");
  const target = frames[index];
  if (!target) throw new Error(`no .pgframe in ${file}`);
  await target.screenshot({ path: new URL(name, out).pathname.replace(/^\//, "") });
  console.log("wrote", name);
}
await browser.close();
rmSync(tmp, { recursive: true, force: true });
