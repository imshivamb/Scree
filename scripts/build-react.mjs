// Builds scree-react: the ES bundle (react and scree-core stay external) and
// a single flat index.d.ts. Types are emitted against the engine source, then
// the one declaration file the package owns is copied up to dist/.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const run = (command) => execSync(command, { stdio: "inherit" });

rmSync("packages/react/dist", { recursive: true, force: true });
run("npx vite build --config packages/react/vite.config.ts");
run("npx tsc -p packages/react/tsconfig.json --outDir packages/react/dist/_types");
mkdirSync("packages/react/dist", { recursive: true });
cpSync("packages/react/dist/_types/packages/react/src/index.d.ts", "packages/react/dist/index.d.ts");
rmSync("packages/react/dist/_types", { recursive: true, force: true });
