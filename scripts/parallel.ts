// Spreads a sim's independent jobs (a block of runs, a block of battles) over several processes, so
// the planning bot's sims finish in minutes. Each job is a pure function of its own seed, and results
// come back in job order, so the numbers are the same for any number of workers.
//
// A sim script calls `serve(handler)` when it was started as a worker, and `runJobs(jobs, workers,
// handler)` otherwise. A worker is the same script started again with --worker.

import { fork } from "node:child_process";

declare const process: {
  argv: string[];
  execArgv: string[];
  send?: (message: unknown) => void;
  on(event: "message", fn: (message: unknown) => void): void;
  exit(code?: number): never;
};

export const inWorker = process.argv.includes("--worker");

// In a worker: answer each job the parent sends with handler(job), until told to stop.
export function serve<J, R>(handler: (job: J) => R): void {
  process.on("message", (message) => {
    if (message === "stop") process.exit(0);
    process.send!({ result: handler((message as { job: J }).job) });
  });
}

// The handler's result for every job, in job order. With one worker the jobs run in this process.
export function runJobs<J, R>(jobs: J[], workers: number, handler: (job: J) => R): Promise<R[]> {
  if (workers <= 1) return Promise.resolve(jobs.map(handler));
  return new Promise((resolve, reject) => {
    const results: R[] = new Array(jobs.length);
    let next = 0;
    let done = 0;
    for (let w = 0; w < Math.min(workers, jobs.length); w++) {
      const child = fork(process.argv[1], ["--worker"], { execArgv: process.execArgv });
      let current = -1;
      const feed = () => {
        if (next < jobs.length) {
          current = next++;
          child.send({ job: jobs[current] });
        } else child.send("stop");
      };
      child.on("message", (message) => {
        results[current] = (message as { result: R }).result;
        done += 1;
        if (done === jobs.length) resolve(results);
        feed();
      });
      child.on("exit", (code) => {
        if (code !== 0) reject(new Error(`a worker stopped with code ${code}`));
      });
      feed();
    }
  });
}
