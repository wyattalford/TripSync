import { assembleApplication } from "./src/assembly.ts";
import { httpWire } from "@mit-sdg/sync-engine-http/tooling";
import { policy } from "./src/http.ts";

export default {
  assemble: assembleApplication,
  title: "OpenTime",
  wireName: "OpenTimeWire",
  design: {
    version: 1,
    documents: [
      new URL("./design/types.md", import.meta.url),
      new URL("./design/compositions/Accounts.md", import.meta.url),
      new URL("./design/compositions/Groups.md", import.meta.url),
      new URL("./design/compositions/Openings.md", import.meta.url),
      new URL("./design/compositions/Gatherings.md", import.meta.url),
    ],
  },
  projections: [httpWire({ policy, name: "OpenTimeWireHttp" })],
};
