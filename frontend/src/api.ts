import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { OpenTimeWireHttp } from "../../generated/wire.ts";

export const api = createHttpClient<OpenTimeWireHttp>({ baseUrl: "/api" });
