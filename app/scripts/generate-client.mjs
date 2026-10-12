// Generates the typed TypeScript client for the on-chain program from its Anchor IDL.
//
// Input : app/idl/origina.json  (produced by the program's own build — treat as read-only)
// Output: app/lib/generated/origina/  (checked in; re-run this after the IDL changes)
//
//   pnpm --filter @origina/app generate:client

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createFromRoot } from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";

const idlPath = fileURLToPath(new URL("../idl/origina.json", import.meta.url));
const outDir = fileURLToPath(new URL("../lib/generated/origina", import.meta.url));

const idl = JSON.parse(readFileSync(idlPath, "utf8"));
const codama = createFromRoot(rootNodeFromAnchor(idl));
codama.accept(renderVisitor(outDir, { deleteFolderBeforeRendering: true, formatCode: false }));

console.log(`Generated client for ${idl.metadata?.name ?? "program"} (${idl.address}) -> ${outDir}`);
