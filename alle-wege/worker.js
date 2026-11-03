import { buildGraph, analyze } from "./graph.js?v=20261103-9";
let graph;
self.onmessage = ({ data }) => {
  try {
    if (data.type === "init") {
      graph = buildGraph(data.data);
      postMessage({ type: "ready" });
      return;
    }
    const start = performance.now();
    const result = analyze(graph, data.state);
    postMessage({
      type: "result",
      id: data.id,
      result,
      ms: Math.round(performance.now() - start),
    });
  } catch (error) {
    postMessage({ type: "error", id: data.id, message: error.message });
  }
};
