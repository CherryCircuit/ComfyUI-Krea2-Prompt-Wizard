/* Materialize to Nodes
 *
 * Creates a new visible group of nodes in the current graph that mirrors
 * the wizard's current configuration. Each row becomes a Krea2 Weighted
 * Phrase node; the base prompt becomes a String Constant Multiline node;
 * category nodes aggregate the per-category fragments; and a final
 * Krea2 Prompt Assembler joins everything.
 *
 * The implementation uses the public LiteGraph API (LiteGraph.createNode,
 * graph.add, node.connect). Each created node gets a stable w/h that
 * keeps the produced group readable.
 */
(function () {
  "use strict";

  const K = window.KREA2;
  const { el, escapeHtml } = K.helpers;
  const { CATEGORIES, CATEGORY_LABELS } = K.constants;

  function findGraph() {
    if (typeof window === "undefined") return null;
    if (window.app && window.app.canvas && window.app.canvas.graph) return window.app.canvas.graph;
    if (window.LGraph && window.LGraph.instance) return window.LGraph.instance;
    return null;
  }

  function createNode(type, pos) {
    if (typeof window === "undefined" || !window.LiteGraph) return null;
    const node = window.LiteGraph.createNode(type);
    if (!node) return null;
    if (pos) {
      node.pos = pos;
    }
    return node;
  }

  function addNode(graph, node) {
    if (!graph || !node) return null;
    graph.add(node);
    return node;
  }

  function connect(fromNode, fromSlot, toNode, toSlot) {
    if (!fromNode || !toNode) return;
    try {
      fromNode.connect(fromSlot, toNode, toSlot);
    } catch (e) {
      console.warn("[Krea2PromptWizard] connect failed", e);
    }
  }

  function layoutNodes(graph, nodes) {
    if (!graph) return;
    let nextId = 0;
    for (const n of nodes) {
      if (n && n.id != null) {
        if (n.id > nextId) nextId = n.id;
      }
    }
    nextId += 1;
    for (const n of nodes) {
      if (n && n.id == null) {
        n.id = nextId++;
      }
    }
  }

  function materialize(state, options) {
    options = options || {};
    const graph = findGraph();
    if (!graph) {
      K.helpers.showToast("Cannot materialize: no active graph found.", "error");
      return null;
    }
    if (typeof window === "undefined" || !window.LiteGraph) {
      K.helpers.showToast("Cannot materialize: LiteGraph not available.", "error");
      return null;
    }
    const rows = (state.rows || []).filter(function (r) { return r && r.enabled !== false && r.phrase; });

    const x0 = options.x != null ? options.x : graph.canvas && graph.canvas.canvas ? graph.canvas.canvas.width / 2 - 220 : 0;
    const y0 = options.y != null ? options.y : graph.canvas && graph.canvas.canvas ? graph.canvas.canvas.height / 2 - 200 : 0;

    const nodes = [];

    const baseNode = createNode("StringConstantMultiline", [x0, y0]);
    if (baseNode) {
      baseNode.widgets_values = [state.base_prompt || "", true];
      nodes.push(addNode(graph, baseNode));
    }

    let cursorY = y0 + 120;
    const rowX = x0 + 240;
    const rowWidth = 280;
    const rowHeight = 90;

    const categoryAggregators = {};
    rows.forEach(function (row, idx) {
      const widget = createNode("Krea2WeightedPhrase", [rowX, cursorY + idx * rowHeight]);
      if (!widget) return;
      widget.setSize([rowWidth, rowHeight]);
      try {
        const widgets = widget.widgets || [];
        const findWidget = function (name) {
          for (const w of widgets) if (w.name === name) return w;
          return null;
        };
        const phrase = findWidget("phrase");
        const enabled = findWidget("enabled");
        const mode = findWidget("control_mode");
        const intensity = findWidget("intensity");
        const positive = findWidget("positive_phrase");
        const negative = findWidget("negative_phrase");
        const neutral = findWidget("neutral_phrase");
        const min = findWidget("custom_min");
        const max = findWidget("custom_max");
        const raw = findWidget("raw_mode");
        if (phrase) phrase.value = row.phrase || "";
        if (enabled) enabled.value = row.enabled !== false;
        if (mode) mode.value = row.control_mode || "scalar";
        if (intensity) intensity.value = row.intensity || 0;
        if (positive) positive.value = row.positive_phrase || "";
        if (negative) negative.value = row.negative_phrase || "";
        if (neutral) neutral.value = row.neutral_phrase || "";
        if (min) min.value = row.safe_weight_min != null ? row.safe_weight_min : 0.1;
        if (max) max.value = row.safe_weight_max != null ? row.safe_weight_max : 3.0;
        if (raw) raw.value = row.control_mode === "raw";
      } catch (e) {
        console.warn("[Krea2PromptWizard] failed to set widget values", e);
      }
      graph.add(widget);
      nodes.push(widget);
      const cat = row.category || "custom";
      if (!categoryAggregators[cat]) categoryAggregators[cat] = [];
      categoryAggregators[cat].push(widget);
    });

    const categoryNodes = {};
    let catY = cursorY;
    const catX = rowX + 360;
    for (const cat of CATEGORIES) {
      const sourceRows = categoryAggregators[cat] || [];
      if (sourceRows.length === 0) continue;
      const assembler = createNode("Krea2PromptAssembler", [catX, catY]);
      if (!assembler) continue;
      assembler.setSize([320, 60 + sourceRows.length * 30]);
      graph.add(assembler);
      nodes.push(assembler);
      try {
        const w = assembler.widgets || [];
        const findW = function (name) { for (const ww of w) if (ww.name === name) return ww; return null; };
        const base = findW("base_prompt");
        const count = findW("fragment_count");
        if (count) count.value = sourceRows.length;
        if (base) base.value = "";
        for (let i = 0; i < sourceRows.length; i++) {
          const src = sourceRows[i];
          const fi = findW("fragment_" + (i + 1));
          const fw = findW("fragment_" + (i + 1) + "_weight");
          const fc = findW("fragment_" + (i + 1) + "_category");
          if (fi) fi.value = src.widgets_values ? src.widgets_values[0] : "";
          if (fw) fw.value = 1.0;
          if (fc) fc.value = cat;
        }
      } catch (e) {
        console.warn("[Krea2PromptWizard] assembler widgets failed", e);
      }
      categoryNodes[cat] = assembler;
      catY += 80 + sourceRows.length * 30;
    }

    layoutNodes(graph, nodes);
    if (graph.change) graph.change();
    return { nodes: nodes, baseNode: baseNode, categoryNodes: categoryNodes };
  }

  function createSubgraph(state, options) {
    const graph = findGraph();
    if (!graph) {
      K.helpers.showToast("Cannot create subgraph: no active graph.", "error");
      return null;
    }
    if (typeof graph.convertToSubgraph !== "function") {
      K.helpers.showToast("Convert-to-subgraph is not supported in this ComfyUI version.", "error");
      return null;
    }
    const result = materialize(state, options);
    if (!result) return null;
    const set = new Set(result.nodes);
    try {
      const subgraphNode = graph.convertToSubgraph(set);
      if (subgraphNode) {
        K.helpers.showToast("Subgraph created from wizard.", "info");
      }
      return subgraphNode;
    } catch (e) {
      console.warn("[Krea2PromptWizard] convertToSubgraph failed", e);
      K.helpers.showToast("Convert-to-subgraph failed; leaving nodes as-is.", "error");
      return null;
    }
  }

  K.materialize = { materialize: materialize, createSubgraph: createSubgraph };
})();
