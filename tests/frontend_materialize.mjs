import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
const nodes = [];
const notices = [];
globalThis.window = globalThis;
window.KREA2 = { helpers: { showToast: (text) => notices.push(text) } };
window.app = { canvas: { graph: { add: (node) => nodes.push(node), change() {}, convertToSubgraph: (set) => ({ members: [...set] }) } } };
window.LiteGraph = { createNode: (type) => ({ type, widgets: [ { name: "base_prompt", value: "" }, { name: "fragment_count", value: 1 }, { name: "separator", value: ", " } ], setSize() {} }) };
await import(pathToFileURL(path.resolve("web/js/materialize.mjs")));
const python = process.env.KREA2_TEST_PYTHON || "E:/ComfyUI_Feb2026/python_embeded/python.exe";
const state = { base_prompt: "portrait", characters: [{ id: "serena", name: "Serena", additional_info: "red hair", rows: [{ id: "gaze", category: "gaze", phrase: "confident gaze", strength: 1.37, control_mode: "scalar", enabled: true }] }], setting: { enabled: true, description: "medieval tavern" }, rows: [{ id: "walls", category: "custom", phrase: "blue walls", strength: 1.73, intensity: 0, control_mode: "scalar", enabled: true }, { id: "haze", category: "custom", phrase: "unwanted haze", strength: -0.65, intensity: 0, control_mode: "raw", enabled: true }, { id: "light", category: "lighting_direction", phrase: "key light overhead", strength: 1, enabled: true }] };
for (const row of [...state.rows, ...state.characters[0].rows]) { row.preset_id = "custom." + row.id; row.intensity ??= 0; row.control_mode ??= "scalar"; }
const compilation = spawnSync(python, ["-B", "-c", "import json,sys,os; sys.path.insert(0,os.getcwd()); from src.compiler import compile_state; from src.library import load_library; data=json.load(sys.stdin); print(json.dumps(compile_state(data,load_library(bundled_path='presets/default_library.json',user_path=None)).final_prompt))"], { input: JSON.stringify(state), encoding: "utf8" });
assert.equal(compilation.status, 0, compilation.stderr);
const compiledPrompt = JSON.parse(compilation.stdout);
for (const expected of ["Serena", "red hair", "medieval tavern", "(blue walls:1.5)", "(unwanted haze:-0.65)", "(confident gaze:1.5)", "key light overhead"]) assert.ok(compiledPrompt.includes(expected), expected);
const result = window.KREA2.materialize.materialize(state, { compiledPrompt });
assert.equal(result.nodes.length, 1);
assert.equal(result.finalNode.type, "Krea2PromptAssembler");
const input = Object.fromEntries(result.finalNode.widgets.map((widget) => [widget.name, widget.value]));
assert.equal(input.base_prompt, compiledPrompt);
assert.equal(input.fragment_count, 0);
// Evaluate the real backend assembler, rather than a second JavaScript compiler.
const execution = spawnSync(python, ["-B", "-c", "import json,sys,os; sys.path.insert(0,os.getcwd()); from src.nodes import Krea2PromptAssembler; data=json.load(sys.stdin); print(json.dumps(Krea2PromptAssembler().assemble(**data)[0]))"], { input: JSON.stringify(input), encoding: "utf8" });
assert.equal(execution.status, 0, execution.stderr);
assert.equal(JSON.parse(execution.stdout), compiledPrompt);
assert.equal(window.KREA2.materialize.materialize(state), null);
assert.equal(nodes.length, 1, "missing authoritative snapshot must leave graph untouched");
const empty = window.KREA2.materialize.materialize(state, { compiledPrompt: "" });
assert.equal(empty.finalNode.widgets[0].value, "");
const subgraph = window.KREA2.materialize.createSubgraph(state, { compiledPrompt });
assert.equal(subgraph.members[0].widgets[0].value, compiledPrompt);
assert.ok(notices.some((text) => text.includes("snapshot")));
console.log("Materialized snapshot equals backend output, including cast, environment, direct and negative weights.");


