/* Krea2 Prompt Wizard — visual test runner (no ComfyUI needed).
 *
 * Starts the harness server, opens the wizard in your installed
 * Edge/Chrome, runs a scripted pass (scene render, three-point setup,
 * camera orbit, bulb drag, height slider, gallery, cast tab), saves
 * screenshots into ./shots and reports console/page errors.
 *
 * USAGE:
 *   npm install            (once — pulls playwright-core, no browsers)
 *   node run_visual.js     [path/to/state.json]
 *
 * state.json (optional) is loaded as the wizard's initial state, e.g.
 * one of the files in ./states.
 */
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const HARNESS = __dirname;
const SHOTS = path.join(HARNESS, "shots");
const PORT = Number(process.env.PORT || 8641);
const BASE = "http://localhost:" + PORT + "/";

const BROWSER_CANDIDATES = [
  process.env.BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (e) { /* skip */ }
  }
  return null;
}

function startServer() {
  const child = spawn(process.execPath, [path.join(HARNESS, "server.js")], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => process.stderr.write(d));
  return child;
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("harness server did not start on port " + PORT);
}

async function runWithPlaywright(browserPath, stateArg) {
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch({ executablePath: browserPath });
  const page = await browser.newPage({ viewport: { width: 860, height: 1000 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) consoleErrors.push(m.text().slice(0, 200));
  });

  const stateName = stateArg ? path.basename(stateArg) : "three_point_fresh.json";
  const stateCopy = path.join(HARNESS, "states");
  fs.mkdirSync(stateCopy, { recursive: true });
  if (stateArg) fs.copyFileSync(stateArg, path.join(stateCopy, stateName));

  await page.goto(BASE + "?state=" + encodeURIComponent(stateName), { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.dataset.ready === "1", { timeout: 30000 });

  let shots = 0;
  const shotElement = async (selector, name, fullPage) => {
    const el = await page.$(selector);
    if (!el) return console.warn("skip shot " + name + " (missing " + selector + ")");
    await page.evaluate((sel) => {
      const node = document.querySelector(sel);
      if (node && node.scrollIntoView) node.scrollIntoView({ block: "center" });
    }, selector).catch(() => {});
    await page.waitForTimeout(150);
    await el.screenshot({ path: path.join(SHOTS, name), fullPage: !!fullPage });
    shots += 1;
  };

  await shotElement(".krea2-wizard-root", "01_scene_full.png", true);
  await shotElement(".krea2-v2-light-stage", "02_stage_default.png", false);

  /* Three-point setup, then orbits/drags/heights. */
  const pill = await page.$('button.krea2-v2-lt-pill:has-text("Three-Point")');
  if (pill) {
    await pill.click();
    await page.waitForTimeout(400);
    await shotElement(".krea2-v2-light-stage", "03_stage_three_point.png", false);
    await shotElement(".krea2-v2-lt-cards", "04_light_cards.png", false);

    /* Orbit the camera by dragging the background. */
    let stage = await page.$(".krea2-v2-light-stage");
    let box = await stage.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 130, box.y + box.height / 2 - 45, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await shotElement(".krea2-v2-light-stage", "05_orbit.png", false);

    /* Drag the first bulb to the right edge. */
    stage = await page.$(".krea2-v2-light-stage");
    box = await stage.boundingBox();
    const bulb = await page.$('.krea2-v2-lt-bulb[data-light-index="0"]');
    if (bulb) {
      const bBox = await bulb.boundingBox();
      await page.mouse.move(bBox.x + bBox.width / 2, bBox.y + bBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.8, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      await shotElement(".krea2-v2-light-stage", "06_bulb_drag.png", false);
    }

    /* Height to the top: third card's height slider. */
    const cards = await page.$$(".krea2-v2-lt-card");
    if (cards.length > 2) {
      const rimSliders = await cards[2].$$(".krea2-v2-lt-slider");
      if (rimSliders[1]) {
        await rimSliders[1].evaluate((el) => { el.value = "90"; el.dispatchEvent(new Event("change")); });
        await page.waitForTimeout(400);
        await shotElement(".krea2-v2-light-stage", "07_height_90.png", false);
      }
    }

    /* Gallery popup. */
    const more = await page.$("button.krea2-v2-lt-more");
    if (more) {
      await more.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, "08_gallery.png") });
      shots += 1;
      const closeBtn = await page.$(".krea2-v2-lt-gallery .krea2-structured-heading button.krea2-icon-btn");
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(200);
    }
  }

  /* Cast tab. */
  await page.click('button:has-text("Cast")').catch(() => {});
  await page.waitForTimeout(300);
  await shotElement(".krea2-wizard-root", "09_cast.png", false);

  const stateNow = await page.evaluate(() => {
    try { return JSON.parse(window.__node.widgets[0].value); } catch (e) { return null; }
  });
  const camera = stateNow && stateNow.scene_sections && stateNow.scene_sections.stage_camera;
  const lights = stateNow && stateNow.scene_sections && stateNow.scene_sections.lights;
  console.log("harness: camera = " + JSON.stringify(camera));
  console.log("harness: lights  = " + JSON.stringify((lights || []).map((l) => [l.angleDeg, l.distanceM, l.heightDeg, l.enabled !== false])));
  console.log("harness: " + shots + " screenshots -> " + SHOTS);
  console.log("harness: page errors: " + (pageErrors.length ? "\n" + pageErrors.join("\n") : "none"));
  console.log("harness: console errors: " + (consoleErrors.length ? "\n" + consoleErrors.slice(0, 8).join("\n") : "none"));

  await browser.close();
  return { pageErrors: pageErrors };
}

/* Dependency-free fallback: one full-page screenshot via headless CLI. */
async function runHeadlessCli(browserPath, stateArg) {
  const stateName = stateArg ? path.basename(stateArg) : "three_point_fresh.json";
  const out = path.join(SHOTS, "cli_scene.png");
  fs.mkdirSync(SHOTS, { recursive: true });
  const url = BASE + "?state=" + encodeURIComponent(stateName);
  const child = spawn(browserPath, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--window-size=900,2000", "--virtual-time-budget=8000",
    "--screenshot=" + out, url,
  ], { stdio: "ignore" });
  await new Promise((resolve) => child.once("exit", () => resolve()));
  console.log("harness: (playwright not installed) CLI screenshot -> " + out);
  console.log("harness: to get the full interactive pass: npm install");
  return { pageErrors: [] };
}

(async () => {
  const stateArg = process.argv[2] && fs.existsSync(process.argv[2]) ? path.resolve(process.argv[2]) : null;
  if (stateArg) console.log("harness: loading state from " + stateArg);
  const browserPath = findBrowser();
  if (!browserPath) throw new Error("No Edge/Chrome found. Set BROWSER_PATH to your browser executable.");

  const server = startServer();
  let result = { pageErrors: [] };
  try {
    await waitForServer(10000);
    let playwrightAvailable = true;
    try { require.resolve("playwright-core"); } catch (e) { playwrightAvailable = false; }
    result = playwrightAvailable
      ? await runWithPlaywright(browserPath, stateArg)
      : await runHeadlessCli(browserPath, stateArg);
    if (result.pageErrors.length) process.exitCode = 1;
  } finally {
    server.kill();
  }
})().catch((e) => {
  console.error("harness failed:", e.message || e);
  process.exit(1);
});
