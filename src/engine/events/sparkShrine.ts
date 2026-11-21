// The Spark Shrine: a party vote to bless one basic spark, or skip. The blessing itself is run state
// (RunState.blessing) that the run passes into each battle; the number is in data/events.json.

import type { EventOption, EventState } from "../eventStops";
import type { EventData, Pools } from "../types";

export function openSparkShrine(data: EventData, pools: Pools): EventState {
  // Only basic sparks can be blessed.
  const options: EventOption[] = [...pools.sparkGroups.basic.map((spark): EventOption => ({ type: "bless", spark })), { type: "skip" }];
  return { id: data.id, kind: data.kind, domino: null, options, choices: {} };
}
