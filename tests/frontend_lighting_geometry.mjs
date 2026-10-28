import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";

const context = { window: { KREA2: {} } };
vm.createContext(context);
vm.runInContext(readFileSync(new URL("../web/js/lighting_scene.mjs", import.meta.url), "utf8"), context);
const scene = context.window.KREA2.lightingScene;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const legacy = { angleDeg: 90, distanceM: 2, heightDeg: 30 };
const coordinates = scene.physicalCoordinates(legacy);
near(coordinates.groundDistanceM, Math.sqrt(3));
near(coordinates.heightM, 2.12);
const position = scene.lightPosition(legacy);
near(position.x, Math.sqrt(3)); near(position.y, 2.12); near(position.z, 0);
near(scene.metresFromDisplay(scene.displayDistance(4, "ft"), "ft"), 4);
assert.equal(scene.physicalCoordinates({ groundDistanceM: 22, heightM: 9 }).groundDistanceM, 22);
assert.equal(scene.physicalCoordinates({ groundDistanceM: 0, heightM: 0 }).heightM, 0);

const mesh = scene.createBustMesh();
assert.ok(mesh.length > 1000, "Bust must contain genuine three-dimensional triangle geometry");
assert.ok(mesh.some(t => t.centroid.z > .24), "Nose must project from the face");
assert.ok(mesh.some(t => Math.abs(t.centroid.x) > .45), "Shoulders must have width");
assert.ok(mesh.some(t => Math.abs(t.centroid.x) > .2 && t.centroid.y > 1.5), "Ears must project from the head");
const projector = p => ({ x: p.x * 100, y: p.y * 100, z: 5 - p.z });
const white = () => "#ffffff";
const dark = scene.shadedBust(projector, [], white);
const zero = scene.shadedBust(projector, [{ angleDeg: 0, groundDistanceM: 2, heightM: 2, strength: 0 }], white);
assert.deepEqual(JSON.parse(JSON.stringify(dark)), JSON.parse(JSON.stringify(zero)), "Zero-strength lights must contribute no illumination");
const front = scene.shadedBust(projector, [{ angleDeg: 0, groundDistanceM: 2, heightM: 2, strength: 1 }], white);
const rear = scene.shadedBust(projector, [{ angleDeg: 180, groundDistanceM: 2, heightM: 2, strength: 1 }], white);
assert.ok(front.some((t, i) => t.fill !== rear[i].fill), "Direction must affect shaded surfaces");
assert.ok(front.every((t, i) => i === 0 || front[i - 1].depth >= t.depth), "Triangles must be sorted far to near");
const fixture = { label: "Key", angleDeg: 90, groundDistanceM: 2, heightM: 2, coordinatesEdited: true, color: "amber" };
assert.equal(scene.physicalPhrase(fixture), "key light coming from the subject’s left, slightly above, in amber");
const fixtures = [0, 45, 90, 180, 270].flatMap(angleDeg => [0, 1.12, 2, 6].map(heightM => ({ ...fixture, angleDeg, heightM })));
const backend = spawnSync(process.env.PYTHON || "python", ["-B", "-c",
  "import json,sys;from src.migrations import light_phrase;print(json.dumps([light_phrase(x) for x in json.loads(sys.stdin.read())]))"],
  { input: JSON.stringify(fixtures), encoding: "utf8", cwd: new URL("..", import.meta.url) });
assert.equal(backend.status, 0, backend.stderr);
assert.deepEqual(JSON.parse(backend.stdout), fixtures.map(scene.physicalPhrase), "Frontend and headless backend must use identical qualitative wording");
console.log("Lighting geometry, physical coordinate conversion and backend wording parity passed.");
