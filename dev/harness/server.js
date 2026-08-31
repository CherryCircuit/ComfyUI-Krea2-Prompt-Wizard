/* Visual harness static server.
 *
 * Serves the wizard's plain web/ files plus fixture data straight from
 * the repo, so the frontend can be worked on WITHOUT ComfyUI or Python.
 *
 * USAGE:  node server.js          (or: set PORT  env to change port)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const STATES = path.join(__dirname, "states");
const PORT = Number(process.env.PORT || 8137);

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

function write(res, status, type, body) {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost:" + PORT);
  const p = url.pathname;

  if (p === "/") {
    return write(res, 200, "text/html", fs.readFileSync(path.join(__dirname, "harness.html")));
  }
  const stateMatch = /^\/states\/([^/]+)$/.exec(p);
  if (stateMatch) {
    const file = path.join(STATES, decodeURIComponent(stateMatch[1]));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return write(res, 200, "application/json", fs.readFileSync(file));
    }
    return write(res, 404, "text/plain", "state not found: " + stateMatch[1]);
  }
  if (p === "/fixtures/library.json") {
    return write(res, 200, "application/json", fs.readFileSync(path.join(ROOT, "presets", "default_library.json")));
  }
  if (p === "/fixtures/master.json") {
    return write(res, 200, "application/json", fs.readFileSync(path.join(ROOT, "presets", "master_presets.json")));
  }
  if (p === "/fixtures/conflicts.json") {
    return write(res, 200, "application/json", fs.readFileSync(path.join(ROOT, "presets", "conflicts.json")));
  }
  if (p === "/harness_server.js" || p === "/harness_run.js") {
    return write(res, 200, MIME[".js"], fs.readFileSync(path.join(__dirname, p.slice(1))));
  }
  const file = path.join(ROOT, "web", path.normalize(p).replace(/^[/\\]+/, ""));
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    return write(res, 200, MIME[path.extname(file)] || "application/octet-stream", fs.readFileSync(file));
  }
  write(res, 404, "text/plain", "not found: " + p);
});

server.listen(PORT, () => console.log("wizard visual harness on http://localhost:" + PORT + "/"));
