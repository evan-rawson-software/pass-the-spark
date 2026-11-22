// Arguments shared by the sims: npm run sim|sim:run [-- <numbers>] [--bot stock|planner|both] [--workers n] [--beam n]
// The numbers keep their place (argv order, flags removed). --bot picks which battle bots play
// (default both). --workers is how many processes share the work (default 4; 1 runs in this process).
// --beam is the planning bot's search width (default 3, the planner's BEAM_WIDTH); wider is stronger and slower.

import { BEAM_WIDTH } from "./planner";

declare const process: { argv: string[] };

export type BotKind = "stock" | "planner";

export function parseSimArgs(): { positional: string[]; bots: BotKind[]; workers: number; beam: number } {
  const args = process.argv.slice(2).filter((a) => a !== "--worker");
  const positional: string[] = [];
  let bot = "both";
  let workers = 4;
  let beam = BEAM_WIDTH;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--bot") bot = args[++i] ?? "";
    else if (args[i] === "--workers") workers = Number(args[++i]);
    else if (args[i] === "--beam") beam = Number(args[++i]);
    else positional.push(args[i]);
  }
  if (bot !== "stock" && bot !== "planner" && bot !== "both") throw new Error(`--bot must be stock, planner or both, not "${bot}"`);
  if (!(workers >= 1)) throw new Error("--workers must be 1 or more");
  if (!(Number.isInteger(beam) && beam >= 1)) throw new Error("--beam must be a whole number, 1 or more");
  return { positional, bots: bot === "both" ? ["stock", "planner"] : [bot], workers, beam };
}
