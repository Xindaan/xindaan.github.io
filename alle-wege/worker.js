import { buildGraph, analyze } from "./graph.js?v=20261104-3";
import { anbindungsRaster, autoMinuten } from "./bahn-auto-core.js?v=20261104-3";
let graph, raster;
self.onmessage = ({ data }) => {
  try {
    if (data.type === "init") {
      graph = buildGraph(data.data);
      raster = null;
      postMessage({ type: "ready" });
      return;
    }
    const start = performance.now();
    let result;
    if (data.type === "bahnauto") {
      // Bahnseite: Strassenzeiten zu den Haltestellen einer Fahrplanantwort.
      raster ||= anbindungsRaster(graph);
      result = autoMinuten(graph, raster, data.start, data.halte, data.optionen);
    } else result = analyze(graph, data.state);
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
