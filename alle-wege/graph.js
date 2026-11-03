import { autobahnZeit, gueltigesTempo } from "./autobahntempo.js";
// Reiner Rechenkern; Browser-Worker und Node-Tests verwenden denselben Code.
export function buildGraph(data) {
  const n = data.nodes.length,
    out = Array.from({ length: n }, () => []),
    incoming = Array.from({ length: n }, () => []);
  data.edges.forEach((e, id) => {
    const [u, v, km, tf, tb] = e;
    if (tf > 0) {
      out[u].push([v, id, tf, km]);
      incoming[v].push([u, id, tf, km]);
    }
    if (tb > 0) {
      out[v].push([u, id, tb, km]);
      incoming[u].push([v, id, tb, km]);
    }
  });
  return { ...data, out, incoming };
}
class Heap {
  constructor() {
    this.a = [];
  }
  push(d, v) {
    const a = this.a;
    let i = a.length;
    a.push([d, v]);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= d) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = [d, v];
  }
  pop() {
    const a = this.a,
      top = a[0],
      last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let c = i * 2 + 1;
        if (c >= a.length) break;
        if (c + 1 < a.length && a[c + 1][0] < a[c][0]) c++;
        if (a[c][0] >= last[0]) break;
        a[i] = a[c];
        i = c;
      }
      a[i] = last;
    }
    return top;
  }
}
export function shortest(
  g,
  seeds,
  {
    reverse = true,
    metric = "time",
    slow = false,
    sylt = "both",
    transferWait = 0,
    autobahnTempo,
  } = {},
) {
  const n = g.nodes.length,
    d = new Float64Array(n).fill(Infinity),
    parent = new Int32Array(n).fill(-1),
    edge = new Int32Array(n).fill(-1),
    basin = new Int32Array(n).fill(-1),
    order = [];
  const heap = new Heap(),
    adj = reverse ? g.incoming : g.out;
  let tempoZeiten;
  if (gueltigesTempo(autobahnTempo)) {
    g.tempoCache ||= new Map();
    if (!g.tempoCache.has(autobahnTempo)) {
      const zeiten = new Float64Array(g.edges.length * 2);
      g.edges.forEach((e, i) => {
        zeiten[2 * i] = autobahnZeit(e, autobahnTempo, true);
        zeiten[2 * i + 1] = autobahnZeit(e, autobahnTempo, false);
      });
      g.tempoCache.set(autobahnTempo, zeiten);
    }
    tempoZeiten = g.tempoCache.get(autobahnTempo);
  }
  seeds.forEach((v, i) => {
    if (v < 0 || v >= n || d[v] === 0) return;
    d[v] = 0;
    basin[v] = i;
    heap.push(0, v);
  });
  while (heap.a.length) {
    const [cost, u] = heap.pop();
    if (cost !== d[u]) continue;
    order.push(u);
    for (const [v, id, time, km] of adj[u]) {
      const transport = g.edges[id][8];
      if (
        transport &&
        (sylt === "none" || (sylt !== "both" && sylt !== transport))
      )
        continue;
      const wartezeit = transport
        ? Math.max(0, Math.min(180, Number(transferWait) || 0))
        : 0;
      const vorwaerts = reverse ? g.edges[id][1] === u : g.edges[id][0] === u;
      const fahrzeit = tempoZeiten
        ? tempoZeiten[2 * id + (vorwaerts ? 0 : 1)]
        : time;
      const w =
          metric === "distance"
            ? km
            : slow && g.edges[id][5] === 0
              ? Math.max(time, km)
              : fahrzeit + wartezeit,
        nd = cost + w;
      if (nd < d[v]) {
        d[v] = nd;
        parent[v] = u;
        edge[v] = id;
        basin[v] = basin[u];
        heap.push(nd, v);
      }
    }
  }
  return { d, parent, edge, basin, order };
}
export function accumulate(g, r, weight = "nodes", limit = Infinity) {
  const w = new Float64Array(g.nodes.length);
  if (weight === "cities")
    for (const c of g.cities) {
      if (Number.isFinite(r.d[c.node]) && r.d[c.node] <= limit) w[c.node]++;
    }
  else for (const i of r.order) if (r.d[i] <= limit) w[i] = 1;
  const source = w.slice();
  for (let k = r.order.length - 1; k >= 0; k--) {
    const u = r.order[k];
    if (r.parent[u] >= 0) w[r.parent[u]] += w[u];
  }
  return { w, source };
}
export function branches(r, w, count = 6) {
  const n = w.length,
    children = Array.from({ length: n }, () => []);
  for (const u of r.order)
    if (r.parent[u] >= 0 && w[u] > 0) children[r.parent[u]].push(u);
  const root = r.order[0];
  const zielmasse = (w[root] || 1) / count;
  let roots = children[root]?.slice() || [];
  const fertig = new Set();
  // Dominante Zufluesse auch dann teilen, wenn lokale Mini-Aeste das
  // Farbbudget bereits belegen. Der gemeinsame Stamm bleibt neutral.
  for (let versuch = 0; versuch < n; versuch++) {
    roots.sort((a, b) => w[b] - w[a] || a - b);
    roots = roots.slice(0, count);
    const u = roots.find(
      (v) => !fertig.has(v) && (roots.length < count || w[v] > zielmasse * 1.6),
    );
    if (u === undefined) break;
    let v = u,
      zweige = [];
    while (children[v].length) {
      const kids = children[v].slice().sort((a, b) => w[b] - w[a] || a - b);
      zweige = kids.filter((k) => w[k] >= zielmasse / 12);
      if (zweige.length >= 2) break;
      v = kids[0];
      zweige = [];
    }
    if (zweige.length < 2) {
      fertig.add(u);
      continue;
    }
    roots.splice(roots.indexOf(u), 1, ...zweige);
  }
  roots.sort((a, b) => w[b] - w[a] || a - b);
  roots = roots.slice(0, count);
  const colors = new Int16Array(n).fill(-1),
    lookup = new Map(roots.map((u, i) => [u, i]));
  for (const u of r.order) {
    if (lookup.has(u)) colors[u] = lookup.get(u);
    else if (r.parent[u] >= 0) colors[u] = colors[r.parent[u]];
  }
  return { colors, roots };
}
export function rankMeetings(
  g,
  travelerNodes,
  objective = "fair",
  options = {},
) {
  if (travelerNodes.length < 2) return { candidates: [], routes: [] };
  const routes = travelerNodes.map((n) =>
    shortest(g, [n], { ...options, reverse: false, metric: "time" }),
  );
  const candidates = g.cities
    .map((c, index) => {
      const times = routes.map((r) => r.d[c.node]);
      return {
        index,
        times,
        max: Math.max(...times),
        sum: times.reduce((a, b) => a + b, 0),
        spread: Math.max(...times) - Math.min(...times),
      };
    })
    .filter((c) => Number.isFinite(c.sum));
  candidates.sort((a, b) =>
    objective === "fair"
      ? a.max - b.max || a.sum - b.sum || a.index - b.index
      : a.sum - b.sum || a.max - b.max || a.index - b.index,
  );
  return { candidates, routes };
}
export function pathTo(r, node) {
  const path = [];
  let u = node;
  for (let k = 0; k < r.parent.length && r.parent[u] >= 0; k++) {
    path.push(r.edge[u]);
    u = r.parent[u];
  }
  return path;
}
export function analyze(g, s) {
  if (s.mode === "meet") {
    const m = rankMeetings(
      g,
      s.travelers
        .map((id) => g.cities.find((c) => c.id === id)?.node)
        .filter((n) => n !== undefined),
      s.objective,
      { sylt: s.sylt, transferWait: s.transferWait, autobahnTempo: s.autobahnTempo },
    );
    if (s.limit > 0) m.candidates = m.candidates.filter((c) => c.max <= s.limit * 60);
    const selected =
      m.candidates.find((c) => g.cities[c.index].id === s.meeting) ||
      m.candidates[0];
    return {
      mode: "meet",
      candidates: m.candidates.slice(0, 5),
      selected,
      paths: selected
        ? m.routes.map((r) => pathTo(r, g.cities[selected.index].node))
        : [],
    };
  }
  const seeds =
    s.mode === "basins"
      ? s.seeds
          .map((id) => g.cities.find((c) => c.id === id)?.node)
          .filter((n) => n !== undefined)
      : [s.node];
  const metric = ["effect", "reach"].includes(s.mode) ? "time" : s.metric;
  const transport = { sylt: s.sylt, transferWait: s.transferWait, autobahnTempo: s.autobahnTempo };
  const r = shortest(g, seeds, {
    metric,
    ...transport,
    reverse: s.mode === "basins" || s.direction !== "from",
  });
  const limit =
    s.limit > 0 ? (metric === "time" ? s.limit * 60 : s.limit * 100) : Infinity;
  const { w, source } = accumulate(g, r, s.weight, limit);
  const b =
    s.mode === "basins"
      ? { colors: r.basin, roots: seeds }
      : branches(r, w, s.branches);
  const slow =
    s.mode === "effect"
      ? shortest(g, seeds, { slow: true, ...transport })
      : null;
  const delta = slow
    ? Float64Array.from(r.d, (v, i) =>
        Number.isFinite(v) && Number.isFinite(slow.d[i])
          ? Math.max(0, slow.d[i] - v)
          : NaN,
      )
    : null;
  const samples = g.cities
    .filter((c) => Number.isFinite(r.d[c.node]) && r.d[c.node] <= limit)
    .map((c) => ({ id: c.id, value: r.d[c.node], delta: delta?.[c.node] }))
    .sort((a, b) => a.value - b.value);
  const median = samples.length
    ? samples[Math.floor(samples.length / 2)].value
    : 0;
  return { mode: s.mode, ...r, w, source, ...b, delta, samples, median, limit };
}
