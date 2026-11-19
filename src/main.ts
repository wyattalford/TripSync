import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { assembleApplication } from "./assembly.ts";
import { db } from "./db.ts";
import { policy } from "./http.ts";

const application = assembleApplication();
const gateway = createGateway({ application });
const api = createHttpHandler({ application, gateway, policy });
const production = process.env.NODE_ENV === "production";
const builtPages = new URL("../frontend/dist/", import.meta.url);

async function health(): Promise<Response> {
  try {
    await db.command({ ping: 1 });
    if (production && !(await Bun.file(new URL("index.html", builtPages)).exists())) {
      throw new Error("Frontend build is missing");
    }
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

async function page(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!production) {
    return new Response("Run the Vue development server on port 5173", { status: 404 });
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response("Invalid path", { status: 400 });
  }
  const root = new URL("./", builtPages);
  const requested = new URL(pathname.replace(/^\/+/, ""), root);
  if (!requested.href.startsWith(root.href)) return new Response("Not found", { status: 404 });
  const asset = Bun.file(requested);
  if (await asset.exists()) return new Response(asset);
  if (pathname.startsWith("/assets/")) return new Response("Not found", { status: 404 });
  const index = Bun.file(new URL("index.html", root));
  if (!(await index.exists())) return new Response("Frontend build is missing", { status: 503 });
  return new Response(index);
}

const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/api": api,
    "/api/*": api,
    "/health": health,
  },
  fetch: page,
});

console.log(`OpenTime listening on ${server.url}`);
