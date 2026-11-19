// The build id, injected by Vite (see vite.config.ts). "dev" when it isn't defined.
declare const __BUILD_ID__: string | undefined;

export const BUILD_ID: string = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
