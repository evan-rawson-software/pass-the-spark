// Arguments shared by the sims: npm run sim|sim:run [-- <numbers>] [--bot stock|planner|both] [--workers n]
// The numbers keep their place (argv order, flags removed). --bot picks which battle bots play
// (default both). --workers is how many processes share the work (default 4; 1 runs in this process).

declare const process: { argv: string[] };

export type BotKind = "stock" | "planner";

export function parseSimArgs(): { positional: string[]; bots: BotKind[]; workers: number } {
  const args = process.argv.slice(2).filter((a) => a !== "--worker");
  const positional: string[] = [];
  let bot = "both";
  let workers = 4;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--bot") bot = args[++i] ?? "";
    else if (args[i] === "--workers") workers = Number(args[++i]);
    else positional.push(args[i]);
  }
  if (bot !== "stock" && bot !== "planner" && bot !== "both") throw new Error(`--bot must be stock, planner or both, not "${bot}"`);
  if (!(workers >= 1)) throw new Error("--workers must be 1 or more");
  return { positional, bots: bot === "both" ? ["stock", "planner"] : [bot], workers };
}
