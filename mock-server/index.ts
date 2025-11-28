import http from "http";
import { createConnectRouter } from "@connectrpc/connect";
import {
  universalRequestFromNodeRequest,
  universalResponseToNodeResponse,
} from "@connectrpc/connect-node";
import { VersionService } from "@/gen/sapphillon/v1/version_pb";
import { WorkflowService } from "@/gen/sapphillon/v1/workflow_service_pb";
import { PluginService } from "@/gen/sapphillon/v1/plugin_service_pb";
import { versionHandler } from "./handlers/version-handler";
import { workflowHandler } from "./handlers/workflow-handler";
import { pluginHandler } from "./handlers/plugin-handler";
import { initializeMockData } from "./data/mock-data";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 50052;
const HOST = process.env.HOST || "localhost";

// モックデータを初期化
initializeMockData();

// Connect RPCルーターを作成
const router = createConnectRouter({});
router.service(VersionService, versionHandler);
router.service(WorkflowService, workflowHandler);
router.service(PluginService, pluginHandler);

// パスマッピングを作成
const paths = new Map<string, (typeof router.handlers)[0]>();
for (const handler of router.handlers) {
  paths.set(handler.requestPath, handler);
}

// CORSヘッダーを設定する関数
function setCorsHeaders(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-grpc-web, x-request-id, x-user-agent, x-grpc-timeout, x-grpc-web-encoding"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "x-grpc-status, x-grpc-message, x-request-id, x-grpc-web-encoding"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

// HTTPサーバーを作成
const server = http.createServer(async (req, res) => {
  // CORSヘッダーを設定（すべてのリクエストに対して）
  setCorsHeaders(res);

  // OPTIONSリクエスト（プリフライト）を処理
  if (req.method === "OPTIONS") {
    console.log(`[CORS] Handling OPTIONS preflight for ${req.url}`);
    console.log(`[CORS] Request Headers:`, req.headers);
    res.writeHead(200);
    res.end();
    return;
  }

  // ヘルスチェックエンドポイント
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "mock-server" }));
    return;
  }

  // デバッグ用: 利用可能なサービスとメソッドを返す
  if (req.method === "GET" && req.url === "/services") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        services: [
          {
            name: VersionService.typeName,
            methods: ["GetVersion"],
            example: `POST /${VersionService.typeName}/GetVersion`,
          },
          {
            name: WorkflowService.typeName,
            methods: [
              "GenerateWorkflow",
              "FixWorkflow",
              "RunWorkflow",
              "GetWorkflow",
              "ListWorkflows",
              "UpdateWorkflow",
              "DeleteWorkflow",
            ],
            example: `POST /${WorkflowService.typeName}/ListWorkflows`,
          },
          {
            name: PluginService.typeName,
            methods: ["ListPlugins"],
            example: `POST /${PluginService.typeName}/ListPlugins`,
          },
        ],
        note: "Connect RPC uses POST requests, not GET",
      })
    );
    return;
  }

  // Connect RPCリクエストを処理
  try {
    // URLからパスを取得
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;
    // クエリパラメータを除去してパスを取得
    const pathWithoutQuery = path.split("?")[0];

    console.log(`[Request] ${req.method} ${pathWithoutQuery}`);

    let handler = paths.get(pathWithoutQuery);

    // FIX: Handle potential snake_case or case mismatch requests
    if (!handler) {
      // Try to find a matching handler by fuzzy matching the last part of the path
      // e.g. /.../list_workflow matches /.../ListWorkflows
      const requestedMethodName = pathWithoutQuery
        .split("/")
        .pop()
        ?.replace(/_/g, "")
        .toLowerCase();
      if (requestedMethodName) {
        for (const [key, h] of paths.entries()) {
          const actualMethodName = key.split("/").pop()?.toLowerCase();
          if (actualMethodName === requestedMethodName) {
            console.log(
              `[FuzzyMatch] Redirecting ${pathWithoutQuery} to ${key}`
            );
            handler = h;
            break;
          }
        }
      }
    }

    if (!handler) {
      console.warn(`[404] No handler found for ${pathWithoutQuery}`);
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const uReq = universalRequestFromNodeRequest(
      req,
      res,
      undefined,
      undefined
    );
    const uRes = await handler(uReq);
    await universalResponseToNodeResponse(uRes, res);
  } catch (reason) {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;
    console.error(
      `handler for rpc ${paths.get(path.split("?")[0])?.method.name} failed`,
      reason
    );
    res.writeHead(500);
    res.end("Internal Server Error");
  }
});

// サーバーを起動
server.listen(PORT, HOST, () => {
  console.log(`🚀 Mock gRPC server running on http://${HOST}:${PORT}`);
  console.log(`   Health check: GET http://${HOST}:${PORT}/health`);
  console.log(`   Services info: GET http://${HOST}:${PORT}/services`);
  console.log(
    `   Version Service: POST http://${HOST}:${PORT}/${VersionService.typeName}/GetVersion`
  );
  console.log(
    `   Workflow Service: POST http://${HOST}:${PORT}/${WorkflowService.typeName}/ListWorkflows`
  );
  console.log(
    `   Plugin Service: POST http://${HOST}:${PORT}/${PluginService.typeName}/ListPlugins`
  );
  console.log(
    `\n   Note: Connect RPC uses POST requests with /ServiceName/MethodName format`
  );
});

// グローバルエラーハンドリング
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\n👋 Shutting down mock server...");
  server.close(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\n👋 Shutting down mock server...");
  server.close(() => {
    process.exit(0);
  });
});
