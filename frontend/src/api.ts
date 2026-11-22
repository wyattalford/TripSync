import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { OpenTimeWireHttp } from "../../generated/wire.ts";
import { sessionAwareFetch } from "./session.ts";

// Every request goes through sessionAwareFetch so the app notices when a session ends mid-use.
export const api = createHttpClient<OpenTimeWireHttp>({ baseUrl: "/api", fetch: sessionAwareFetch as typeof fetch });
