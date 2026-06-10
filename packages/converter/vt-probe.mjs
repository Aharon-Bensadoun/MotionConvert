// Temporary probe: validate the new VirtualTimeController end-to-end.
import { chromium } from "playwright";
import { installVirtualTime, VIRTUAL_TIME_BROWSER_ARGS } from "./dist/timeline.js";

const html = `<!doctype html><html><head><style>html,body{margin:0;background:#000}</style></head>
<body><script>setTimeout(()=>{document.body.style.background='#fff';},950);</script></body></html>`;

const browser = await chromium.launch({
  headless: true,
  channel: "chromium-headless-shell",
  args: VIRTUAL_TIME_BROWSER_ARGS,
});
const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
const vt = await installVirtualTime(page);

let done = false;
page
  .goto(`data:text/html,${encodeURIComponent(html)}`, { waitUntil: "domcontentloaded" })
  .then(() => (done = true));
let pumped = 0;
await new Promise((r) => setImmediate(r));
while (!done) {
  await vt.tick(16);
  pumped += 16;
  await new Promise((r) => setImmediate(r));
}

const state = async () => {
  const res = await page.evaluate(() => ({
    now: performance.now(),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  return JSON.stringify(res);
};

const sig = (buf) => {
  if (!buf) return "EMPTY";
  let sum = 0;
  for (const b of buf) sum += b;
  return `${buf.length}b/${sum}`;
};

console.log(`pumped=${pumped} state=${await state()}`);
const f0 = await vt.captureScreenshot("png");
console.log(`f0 (noir attendu): ${sig(f0)}`);
await vt.tick(500);
const f1 = await vt.captureScreenshot("png");
console.log(`t+500 state=${await state()} f1 (noir attendu): ${sig(f1)}`);
await vt.tick(600);
const f2 = await vt.captureScreenshot("png");
console.log(`t+1100 state=${await state()} f2 (BLANC attendu): ${sig(f2)}`);
const f2b = await vt.captureScreenshot("png");
console.log(`t+1100 capture#2: ${sig(f2b)}`);
const f2c = await vt.captureScreenshot("png");
console.log(`t+1100 capture#3: ${sig(f2c)}`);
console.log(`f1==f2 (doit etre false): ${f1 && f2 && f1.equals(f2)}`);
console.log(`f2==f2b: ${f2 && f2b && f2.equals(f2b)} | f2b==f2c: ${f2b && f2c && f2b.equals(f2c)}`);

import("node:fs/promises").then(async ({ writeFile }) => {
  await writeFile("probe-f0.png", f0);
  await writeFile("probe-f2.png", f2);
  console.log("saved probe-f0.png / probe-f2.png");
});

await new Promise((r) => setTimeout(r, 500));
await browser.close();
process.exit(0);
