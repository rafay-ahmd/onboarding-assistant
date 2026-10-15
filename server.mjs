import {createLiveApi} from './server/live-api.mjs';
import http from "node:http";
import { readFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);

const routes = {
  "/live-requests.mjs": "web/live-requests.mjs",
  "/request-queue.mjs": "web/request-queue.mjs",
  "/request-queue-ui.mjs": "web/request-queue-ui.mjs",
  "/mock-slack-adapter.mjs": "web/mock-slack-adapter.mjs",
  "/request-queue.css": "web/request-queue.css",
  "/": "web/index.html",
  "/style.css": "web/style.css",
  "/app.mjs": "web/app.mjs",
  "/model.mjs": "web/model.mjs",
  "/profile.json": "profiles/dealertrack-developer.json",
  "/sample.json": "reports/sample.json",
  "/missing-prerequisites.json": "reports/missing-prerequisites.json",
};

const types = {
  html: "text/html; charset=utf-8",
  css: "text/css",
  mjs: "text/javascript",
  json: "application/json",
};

const liveApi = await createLiveApi(root);
const server = http.createServer(async (req, res) => {
  const requestUrl=new URL(req.url,"http://127.0.0.1");
  if(await liveApi(req,res,requestUrl))return;
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end();
    return;
  }

  const route = routes[new URL(req.url, "http://127.0.0.1").pathname];

  if (!route) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  try {
    const body = await readFile(new URL(route, root));
    res.writeHead(200, {
      "Content-Type": types[route.split(".").pop()],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end("Local asset unavailable");
  }
});

server.listen(Number(process.env.PORT || 4173), "127.0.0.1", () =>
  console.log(`Onboarding preview: http://127.0.0.1:${server.address().port}`),
);
