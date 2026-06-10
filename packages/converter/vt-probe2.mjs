// Probe 2: isoler le problème de re-rendu
import { chromium } from "playwright";

const FLAGS = [
  "--deterministic-mode",
  "--enable-begin-frame-control",
  "--run-all-compositor-stages-before-draw",
  "--disable-new-content-rendering-timeout",
  "--disable-threaded-animation",
  "--disable-threaded-scrolling",
  "--disable-checker-imaging",
];

const html = `<!doctype html><html><head><style>html,body{margin:0;background:#000}</style></head>
<body><script>setTimeout(()=>{document.body.style.background='#fff';},950);</script></body></html>`;
const url = `data:text/html,${encodeURIComponent(html)}`;

const sig = (d) => {
  if (!d) return "EMPTY";
  const buf = Buffer.from(d, "base64");
  let sum = 0;
  for (const b of buf) sum += b;
  return `${buf.length}b/${sum}`;
};

console.log("executable:", chromium.executablePath());

// B: temps réel (pas de temps virtuel), beginFrame screenshot après 1.5s réelle
{
  const browser = await chromium.launch({ headless: true, args: FLAGS });
  console.log("version:", browser.version());
  const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
  const client = await page.context().newCDPSession(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 1500));
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const r1 = await client.send("HeadlessExperimental.beginFrame", {
    screenshot: { format: "png" },
  });
  console.log(`[B realtime+flags] bg=${bg} beginFrameShot=${sig(r1.screenshotData)} hasDamage=${r1.hasDamage}`);
  const r2 = await client.send("Page.captureScreenshot", { format: "png" });
  console.log(`[B realtime+flags] captureScreenshot=${sig(r2.data)}`);
  await browser.close();
}

// B2: temps réel SANS flags, captureScreenshot normal (référence noir vs blanc)
{
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
  const client = await page.context().newCDPSession(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const r0 = await client.send("Page.captureScreenshot", { format: "png" });
  await new Promise((r) => setTimeout(r, 1500));
  const r1 = await client.send("Page.captureScreenshot", { format: "png" });
  console.log(`[B2 realtime no-flags] noir=${sig(r0.data)} blanc=${sig(r1.data)}`);
  await browser.close();
}
process.exit(0);
