/* Export the authoritative backend prompt using an existing, editable assembler.
 * Splitting rows cannot represent cast/environment structure or direct weights.
 */
(function () {
  "use strict";
  const K = window.KREA2;
  function findGraph() {
    return window.app?.canvas?.graph || window.LGraph?.instance || null;
  }
  function materialize(state, options = {}) {
    const graph = findGraph();
    if (!graph || !window.LiteGraph) {
      K.helpers.showToast("Cannot materialize: no active graph found.", "error");
      return null;
    }
    if (typeof options.compiledPrompt !== "string") {
      K.helpers.showToast("Wait for the current compiled prompt before exporting.", "error");
      return null;
    }
    const node = window.LiteGraph.createNode("Krea2PromptAssembler");
    const base = node?.widgets?.find((widget) => widget.name === "base_prompt");
    const count = node?.widgets?.find((widget) => widget.name === "fragment_count");
    if (!node || !base || !count) {
      K.helpers.showToast("Cannot materialize: Prompt Assembler is unavailable.", "error");
      return null;
    }
    base.value = options.compiledPrompt;
    count.value = 0;
    const separator = node.widgets.find((widget) => widget.name === "separator");
    if (separator) separator.value = ", ";
    node.title = "Wizard prompt snapshot";
    node.pos = [options.x ?? 0, options.y ?? 0];
    node.setSize?.([420, 220]);
    graph.add(node);
    graph.change?.();
    K.helpers.showToast("Exported the compiled prompt snapshot. Edit its full text; Wizard changes and randomization do not update it.", "info");
    return { nodes: [node], baseNode: node, finalNode: node, categoryNodes: {} };
  }
  function createSubgraph(state, options = {}) {
    const graph = findGraph();
    if (typeof graph?.convertToSubgraph !== "function") {
      K.helpers.showToast("Convert-to-subgraph is not supported in this ComfyUI version.", "error");
      return null;
    }
    const result = materialize(state, options);
    if (!result) return null;
    try {
      return graph.convertToSubgraph(new Set(result.nodes));
    } catch (error) {
      console.warn("[Krea2PromptWizard] convertToSubgraph failed", error);
      K.helpers.showToast("Convert-to-subgraph failed; leaving the exported snapshot node available.", "error");
      return null;
    }
  }
  K.materialize = { materialize, createSubgraph };
})();
