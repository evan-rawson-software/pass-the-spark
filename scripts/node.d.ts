// The one piece of Node that scripts/parallel.ts uses. The project has no @types/node.
declare module "node:child_process" {
  interface Child {
    on(event: "message", fn: (message: unknown) => void): void;
    on(event: "exit", fn: (code: number | null) => void): void;
    send(message: unknown): void;
  }
  export function fork(module: string, args: string[], options: { execArgv: string[] }): Child;
}
