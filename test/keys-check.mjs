// Dev check: every T.<key> used by the bundle exists in BOTH dictionaries.
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
const used = [...new Set([...src.matchAll(/\bT\.([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]))].sort();
const zhStart = src.indexOf("zh: {");
const enStart = src.indexOf("en: {");
const zh = src.slice(zhStart, enStart);
const en = src.slice(enStart);

const missing = [];
for (const key of used) {
  if (!new RegExp(`\\b${key}:`).test(zh)) missing.push(`zh.${key}`);
  if (!new RegExp(`\\b${key}:`).test(en)) missing.push(`en.${key}`);
}

if (missing.length > 0) {
  console.error(`missing dictionary keys: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`dictionary keys: ${used.length} used, all present in zh and en`);
