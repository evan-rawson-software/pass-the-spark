import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import { generateActMap, reachableStops } from "../src/engine/map";
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

test("200 seeds, every act: roads never cross and every map rule holds on every path", () => {
  const content = loadContent();
  for (const act of content.run.acts)
    for (let seed = 1; seed <= 200; seed++) {
      const rules = act.map;
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
      // No two roads cross: stops before leads to targets at or before.
      for (let f = 0; f + 1 < map.floors.length; f++) {
        const floor = map.floors[f];
        for (let a = 0; a + 1 < floor.length; a++) {
          expect(Math.max(...floor[a].next)).toBeLessThanOrEqual(Math.min(...floor[a + 1].next));
        }
      }
      // Reachability: everything on floor 2 reachable from some floor 1 stop, and matches path walking.
      const reached = new Set(map.floors[0].flatMap((n) => reachableStops(map, 1, n.index)));
      for (const node of map.floors.slice(1).flat()) expect(reached.has(node)).toBe(true);
      const first = map.floors[0][0];
      const viaPaths = new Set(
        allPaths(map)
          .filter((p) => p[0] === first)
          .flatMap((p) => p.slice(1)),
      );
      expect(new Set(reachableStops(map, 1, 0))).toEqual(viaPaths);
      // Every node is on some path from floor 1 to the boss.
      const onPath = new Set(paths.flat());
      for (const floor of map.floors) for (const node of floor) expect(onPath.has(node)).toBe(true);
    }
});
