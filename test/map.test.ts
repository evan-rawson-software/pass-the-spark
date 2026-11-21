import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import { generateActMap } from "../src/engine/map";
import type { ActMap, MapNode } from "../src/engine/map";

// Every path from floor 1 to the boss, as a list of nodes.
function allPaths(map: ActMap): MapNode[][] {
  const paths: MapNode[][] = [];
  const walk = (node: MapNode, soFar: MapNode[]): void => {
    const path = [...soFar, node];
    if (node.floor === map.floors.length) paths.push(path);
    for (const j of node.next) walk(map.floors[node.floor][j], path);
  };
  for (const node of map.floors[0]) walk(node, []);
  return paths;
}

test("200 seeds: every generated map follows the map rules on every path", () => {
  const content = loadContent();
  const act = content.run.acts[0];
  const rules = act.map;
  for (let seed = 1; seed <= 200; seed++) {
    const map = generateActMap(act, seed).value;
    expect(map.floors.length).toBe(rules.floors);
    expect(act.bossPool).toContain(map.bossId);
    let traders = 0;
    map.floors.forEach((floor, f) => {
      const n = f + 1;
      expect(floor.length).toBeGreaterThanOrEqual(rules.nodesPerFloor.min);
      expect(floor.length).toBeLessThanOrEqual(rules.nodesPerFloor.max);
      for (const node of floor) {
        if (n < rules.floors) {
          expect(node.next.length).toBeGreaterThanOrEqual(rules.nextPerNode.min);
          expect(node.next.length).toBeLessThanOrEqual(rules.nextPerNode.max);
        }
        const fixed = rules.fixedFloors[String(n)];
        if (fixed !== undefined) expect(node.type).toBe(fixed);
        if (node.type === "elite") expect(n).toBeGreaterThanOrEqual(rules.eliteMinFloor);
        if (node.type === "rest" && fixed === undefined) {
          expect(n).toBeGreaterThanOrEqual(rules.restMinFloor);
          expect(rules.restBannedFloors).not.toContain(n);
        }
        if (node.type === "trader") traders++;
      }
    });
    expect(traders).toBeGreaterThanOrEqual(rules.minTradersPerAct);
    const paths = allPaths(map);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.length).toBe(rules.floors);
      expect(path.filter((p) => p.type === "rest").length).toBeLessThanOrEqual(rules.maxRestPerPath);
      expect(path.filter((p) => p.type === "trader").length).toBeLessThanOrEqual(rules.maxTraderPerPath);
    }
    // Every node is on some path from floor 1 to the boss.
    const onPath = new Set(paths.flat());
    for (const floor of map.floors) for (const node of floor) expect(onPath.has(node)).toBe(true);
  }
});
