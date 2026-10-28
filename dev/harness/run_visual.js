/* Krea2 Prompt Wizard — visual test runner (no ComfyUI needed).
 *
 * Starts the harness server, opens the wizard in your installed
 * Edge/Chrome, runs behavioral and layout checks (360 / 560 / 900px,
 * responsive workspace, auto-height text, focused editor, native queue), saves
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
const PORT = Number(process.env.PORT || 8137);
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
  const assert = require("node:assert/strict");
  const browser = await chromium.launch({ executablePath: browserPath });
  const page = await browser.newPage({ viewport: { width: 1240, height: 1000 } });
  const pageErrors = [], consoleErrors = [], checks = [];
  page.on("pageerror", error => pageErrors.push(String(error.message || error)));
  page.on("console", message => { if (message.type() === "error" && !message.text().includes("favicon")) consoleErrors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) consoleErrors.push(response.status() + " " + response.url()); });
  const stateName = stateArg ? path.basename(stateArg) : "three_point_fresh.json";
  if (stateArg && path.resolve(stateArg) !== path.join(HARNESS, "states", stateName)) fs.copyFileSync(stateArg, path.join(HARNESS, "states", stateName));
  let shots = 0;
  const screenshot = async name => { await page.locator("#host").screenshot({ path: path.join(SHOTS, name + ".png") }); shots++; };
  for (const [width,height] of [[360,420],[560,680],[900,760]]) {
    await page.goto(BASE + "?state=" + encodeURIComponent(stateName) + "&width=" + width + "&height=" + height, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__ready);
    const geometry = await page.evaluate(() => {
      const root = document.querySelector(".krea2-workspace");
      const body = root.querySelector(".krea2-wizard-editor");
      const scrolling = [...root.querySelectorAll("*")].filter(element => {
        const style = getComputedStyle(element);
        return ["auto","scroll"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 2;
      });
      return { width:root.clientWidth, horizontal:root.scrollWidth > root.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1,
        scrolling:scrolling.map(element => element.className), toolbar:root.querySelector(".krea2-wizard-top").getBoundingClientRect().top,
        footer:root.querySelector(".krea2-wizard-footer").getBoundingClientRect().bottom, rect:root.getBoundingClientRect().toJSON(), sections:root.querySelectorAll(".krea2-workspace-section").length };
    });
    assert.equal(geometry.width, width, "Requested workspace width");
    assert.equal(geometry.horizontal, false, "No horizontal overflow at " + width);
    assert.equal(geometry.scrolling.length, 1, "Exactly one vertical scrolling body at " + width + ": " + geometry.scrolling);
    assert.equal(geometry.sections, 9, "All workspace sections are available");
    await page.locator('.krea2-wizard-editor').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const anchored = await page.evaluate(() => ({ top:document.querySelector('.krea2-wizard-top').getBoundingClientRect().top, bottom:document.querySelector('.krea2-wizard-footer').getBoundingClientRect().bottom }));
    assert.equal(anchored.top, geometry.toolbar, "Toolbar stays fixed while body scrolls");
    assert.equal(anchored.bottom, geometry.footer, "Footer stays fixed while body scrolls");
    checks.push("responsive " + width + "x" + height + ": one body, no overflow, fixed toolbar/footer");
    await page.locator('.krea2-wizard-editor').evaluate(element => { element.scrollTop = 0; });
    await screenshot("workspace_" + width);
  }
  await page.goto(BASE + "?width=560&height=680", { waitUntil:"networkidle" });
  await page.waitForFunction(() => window.__ready);
  await page.locator('.krea2-wizard-top').getByRole("button", { name:"Save as", exact:true }).click();
  const saveDialog = page.getByRole("dialog", { name:"Save preset", exact:true });
  await saveDialog.getByLabel("Preset name", { exact:true }).fill("Browser saved full prompt");
  await saveDialog.getByLabel("Preset name", { exact:true }).press("Enter");
  await page.waitForFunction(() => window.__fixtureSavedPresets?.length === 1);
  assert.equal(await saveDialog.count(), 0, "Saving closes the in-app name dialog");
  assert.equal(await page.evaluate(() => window.__fixtureSavedPresets[0].scope), "full", "Naming form saves the actual full document scope");
  await page.locator('.krea2-wizard-top').getByRole("button", { name:"Save as", exact:true }).click();
  await saveDialog.getByLabel("Preset name", { exact:true }).press("Escape");
  assert.equal(await saveDialog.count(), 0, "Escape cancels the in-app naming form");
  assert.equal(await page.evaluate(() => window.__fixtureSavedPresets.length), 1, "Cancel does not save another preset");
  checks.push("in-app preset naming, Enter saves current scope, Escape cancels");
  const environment = page.locator('[data-section-id="environment"]');
  await environment.getByLabel("Environment description", { exact:true }).fill(Array.from({length:20}, (_,i) => "Authored environment line " + i).join("\n"));
  const textarea = await environment.getByLabel("Environment description", {exact:true}).evaluate(element => ({ height:element.clientHeight, scroll:element.scrollHeight, overflow:getComputedStyle(element).overflowY }));
  assert(textarea.height >= textarea.scroll - 2, "Textareas expand to their full content");
  assert.equal(textarea.overflow, "hidden", "Textarea has no internal scroll");
  await page.getByRole("button", { name:"Focus editor", exact:true }).click();
  assert.equal(await page.locator('body > .krea2-workspace-focus-overlay .krea2-workspace').count(), 1, "Focused editor is outside canvas");
  await page.getByRole("button", { name:"Close focus", exact:true }).click();
  assert.equal(await page.locator('#host > .krea2-workspace').count(), 1, "The same editor returns to its host");
  await page.getByRole("button", { name:"Queue workflow", exact:true }).click();
  assert.equal(await page.evaluate(() => window.__queued), 1, "Queue uses native queue hook (fixture)");
  const lights = page.locator('[data-section-id="lighting"]');
  await lights.getByRole("button", { name:"Clear lights", exact:true }).click();
  assert.equal(await page.evaluate(() => window.__wizard.getState().scene_sections.lights.length), 0, "An empty light setup stays empty");
  await lights.getByRole("button", { name:"Add Light", exact:false }).click();
  const stage = lights.locator('.krea2-v2-light-stage');
  await stage.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.__wizard.getState().scene_sections.stage_camera);
  const box = await stage.boundingBox();
  await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await page.mouse.wheel(0, 200);
  const after = await page.evaluate(() => window.__wizard.getState().scene_sections.stage_camera);
  assert.deepEqual(after, before, "Ordinary wheel scroll does not zoom the lighting view");
  checks.push("auto-height text, same-document focus, native queue, empty lights, contained wheel");
  await screenshot("workspace_final");
  assert.equal(pageErrors.length, 0, "No browser errors: " + pageErrors.join("\n"));
  assert.equal(consoleErrors.length, 0, "No console errors: " + consoleErrors.join("\n"));
  console.log("harness: " + checks.join("\n"));
  console.log("harness: " + shots + " screenshots -> " + SHOTS);
  fs.writeFileSync(path.join(SHOTS,"workspace_checks.json"), JSON.stringify({fixtureOnly:true,checks,pageErrors,consoleErrors},null,2));
  await browser.close();
  return { pageErrors };
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

  const existingServer = await fetch(BASE).then(response => response.ok).catch(() => false);
  const server = existingServer ? null : startServer();
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
    server?.kill();
  }
})().catch((e) => {
  console.error("harness failed:", e.message || e);
  process.exit(1);
});
