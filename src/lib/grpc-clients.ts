/**
 * @fileoverview gRPC-Web クライアント統合モジュール
 *
 * ## 概要
 * このモジュールは、Sapphillon バックエンドとの gRPC-Web 通信を管理します。
 * 全てのgRPCサービスクライアントと、共通のインターセプター機構を提供します。
 *
 * ## 使用例
 * ```typescript
 * import { clients } from '@/lib/grpc-clients';
 *
 * // バージョン確認
 * const version = await clients.version.getVersion({});
 *
 * // ワークフロー生成（ストリーミング）
 * for await (const msg of clients.workflow.generateWorkflow({ prompt: "タスクを実行" })) {
 *   console.log(msg.workflowDefinition);
 * }
 * ```
 *
 * ## 環境変数
 * - `VITE_GRPC_BASE_URL`: gRPCサーバーのベースURL（デフォルト: http://localhost:50051）
 * - `VITE_GRPC_WEB_USE_BINARY`: バイナリ形式の使用（デフォルト: true）
 *
 * ## 新しいサービスの追加方法
 * 1. `vender/Sapphillon_API/proto/` に .proto ファイルを配置
 * 2. `deno task gen` で型定義を生成
 * 3. このファイルに import とクライアントを追加
 *
 * @module grpc-clients
 */

import { createClient, ConnectError, Code } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import type { Interceptor } from "@connectrpc/connect";

import { VersionService } from "@/gen/sapphillon/v1/version_pb";
import { WorkflowService } from "@/gen/sapphillon/v1/workflow_service_pb";
import { PluginService } from "@/gen/sapphillon/v1/plugin_service_pb";
import { ProviderService } from "@/gen/sapphillon/ai/v1/provider_service_pb";
import { ModelService } from "@/gen/sapphillon/ai/v1/model_service_pb";
import { SearchModelService } from "@/gen/sapphillon/ai/v1/search_model_service_pb";

// ----------------------
// エラーコードとメッセージ定義
// ----------------------

/**
 * gRPCエラーコードとその意味
 *
 * @see https://connectrpc.com/docs/protocol/#error-codes
 */
export const GRPC_ERROR_CODES = {
  /** リクエストがキャンセルされた（通常はAbortController経由） */
  CANCELLED: Code.Canceled,
  /** 不明なエラー */
  UNKNOWN: Code.Unknown,
  /** 無効な引数 */
  INVALID_ARGUMENT: Code.InvalidArgument,
  /** タイムアウト */
  DEADLINE_EXCEEDED: Code.DeadlineExceeded,
  /** リソースが見つからない */
  NOT_FOUND: Code.NotFound,
  /** リソースが既に存在する */
  ALREADY_EXISTS: Code.AlreadyExists,
  /** 権限拒否 */
  PERMISSION_DENIED: Code.PermissionDenied,
  /** リソース枯渇 */
  RESOURCE_EXHAUSTED: Code.ResourceExhausted,
  /** 前提条件の失敗 */
  FAILED_PRECONDITION: Code.FailedPrecondition,
  /** 操作が中止された */
  ABORTED: Code.Aborted,
  /** 範囲外 */
  OUT_OF_RANGE: Code.OutOfRange,
  /** 未実装 */
  UNIMPLEMENTED: Code.Unimplemented,
  /** 内部エラー */
  INTERNAL: Code.Internal,
  /** サービス利用不可 */
  UNAVAILABLE: Code.Unavailable,
  /** データ損失 */
  DATA_LOSS: Code.DataLoss,
  /** 認証が必要 */
  UNAUTHENTICATED: Code.Unauthenticated,
} as const;

/**
 * エラーコードに対応するi18nキー
 */
export const GRPC_ERROR_MESSAGE_KEYS: Record<Code, string> = {
  [Code.Canceled]: "errors.grpc.canceled",
  [Code.Unknown]: "errors.grpc.unknown",
  [Code.InvalidArgument]: "errors.grpc.invalidArgument",
  [Code.DeadlineExceeded]: "errors.grpc.deadlineExceeded",
  [Code.NotFound]: "errors.grpc.notFound",
  [Code.AlreadyExists]: "errors.grpc.alreadyExists",
  [Code.PermissionDenied]: "errors.grpc.permissionDenied",
  [Code.ResourceExhausted]: "errors.grpc.resourceExhausted",
  [Code.FailedPrecondition]: "errors.grpc.failedPrecondition",
  [Code.Aborted]: "errors.grpc.aborted",
  [Code.OutOfRange]: "errors.grpc.outOfRange",
  [Code.Unimplemented]: "errors.grpc.unimplemented",
  [Code.Internal]: "errors.grpc.internal",
  [Code.Unavailable]: "errors.grpc.unavailable",
  [Code.DataLoss]: "errors.grpc.dataLoss",
  [Code.Unauthenticated]: "errors.grpc.unauthenticated",
};

/**
 * 後方互換性のためのエラーメッセージ（非推奨）
 * @deprecated 代わりに getErrorMessage を使用してください
 */
export const GRPC_ERROR_MESSAGES: Record<Code, string> = {
  [Code.Canceled]: "リクエストがキャンセルされました",
  [Code.Unknown]: "不明なエラーが発生しました",
  [Code.InvalidArgument]: "無効な引数が指定されました",
  [Code.DeadlineExceeded]: "タイムアウトしました",
  [Code.NotFound]: "リソースが見つかりません",
  [Code.AlreadyExists]: "リソースが既に存在します",
  [Code.PermissionDenied]: "権限がありません",
  [Code.ResourceExhausted]: "リソースが不足しています",
  [Code.FailedPrecondition]: "前提条件を満たしていません",
  [Code.Aborted]: "操作が中止されました",
  [Code.OutOfRange]: "範囲外の値が指定されました",
  [Code.Unimplemented]: "この機能は実装されていません",
  [Code.Internal]: "サーバー内部エラーが発生しました",
  [Code.Unavailable]: "サービスが利用できません",
  [Code.DataLoss]: "データが失われました",
  [Code.Unauthenticated]: "認証が必要です",
};

/**
 * ConnectErrorから人間が読めるメッセージを取得
 *
 * 注意: この関数はi18nキーを返します。Reactコンポーネント内で使用する場合は、
 * useTranslation の t 関数を使用してください。
 *
 * @example
 * ```typescript
 * // Reactコンポーネント内
 * const { t } = useTranslation();
 * try {
 *   await clients.version.getVersion({});
 * } catch (e) {
 *   if (e instanceof ConnectError) {
 *     const messageKey = getErrorMessageKey(e);
 *     console.error(t(messageKey)); // "サービスが利用できません"
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Reactコンポーネント外（i18nextを直接使用）
 * import i18n from "@/i18n";
 * try {
 *   await clients.version.getVersion({});
 * } catch (e) {
 *   if (e instanceof ConnectError) {
 *     const messageKey = getErrorMessageKey(e);
 *     console.error(i18n.t(messageKey)); // "サービスが利用できません"
 *   }
 * }
 * ```
 */
export function getErrorMessageKey(error: ConnectError): string {
  return GRPC_ERROR_MESSAGE_KEYS[error.code] || "errors.genericError";
}

/**
 * ConnectErrorから人間が読めるメッセージを取得（後方互換性のため）
 *
 * @deprecated 代わりに getErrorMessageKey を使用し、useTranslation の t 関数で翻訳してください
 *
 * @example
 * ```typescript
 * const { t } = useTranslation();
 * const messageKey = getErrorMessageKey(error);
 * const message = t(messageKey);
 * ```
 */
export function getErrorMessage(error: ConnectError): string {
  return GRPC_ERROR_MESSAGES[error.code] || error.message;
}

/**
 * エラーが再試行可能かどうかを判定
 *
 * @example
 * ```typescript
 * catch (e) {
 *   if (e instanceof ConnectError && isRetryableError(e)) {
 *     // リトライ処理
 *   }
 * }
 * ```
 */
export function isRetryableError(error: ConnectError): boolean {
  return [
    Code.Unavailable,
    Code.DeadlineExceeded,
    Code.ResourceExhausted,
    Code.Aborted,
  ].includes(error.code);
}

interface EnvLike {
  [k: string]: unknown;
}
interface ImportMetaLike {
  env?: EnvLike;
}
const im = import.meta as unknown as ImportMetaLike;

// Resolve base URL in order of preference:
// 1) VITE_GRPC_BASE_URL (e.g. http://localhost:50051)
// 2) window.__SAPPHILLON_GRPC_BASE__ (debug hook)
// 3) fallback http://localhost:50051
export const BASE_URL =
  (im.env?.VITE_GRPC_BASE_URL as string | undefined) ||
  (typeof window !== "undefined" &&
    (window as unknown as { __SAPPHILLON_GRPC_BASE__?: string })
      .__SAPPHILLON_GRPC_BASE__) ||
  "http://localhost:50052";

// Toggle grpc-web binary/json via env (defaults to binary)
const BIN_ENV = (
  im.env?.VITE_GRPC_WEB_USE_BINARY as string | undefined
)?.toLowerCase?.();
const USE_BINARY = BIN_ENV
  ? !(BIN_ENV === "false" || BIN_ENV === "0" || BIN_ENV === "no")
  : true;

// Do not export a raw transport without interceptors to avoid divergent behavior.

// ----------------------
// Interceptors
// ----------------------

/**
 * リクエストID付与インターセプター
 *
 * 各gRPCリクエストに一意のIDを付与します。デバッグやトレーシングに有用です。
 *
 * @param headerKey - リクエストIDを格納するヘッダー名（デフォルト: "x-request-id"）
 * @returns Interceptor
 *
 * @example
 * ```typescript
 * const customInterceptor = requestIdInterceptor("x-trace-id");
 * registerInterceptors(customInterceptor);
 * ```
 */
export function requestIdInterceptor(headerKey = "x-request-id"): Interceptor {
  return (next) => (req) => {
    // Connect のヘッダはヘッダマップ (req.header) で操作できる
    try {
      const id =
        globalThis.crypto?.randomUUID?.() ||
        Math.random().toString(36).slice(2);
      if (!req.header.has(headerKey)) {
        req.header.set(headerKey, id);
      }
    } catch {
      /* ignore */
    }
    return next(req);
  };
}

/**
 * メタデータ挿入インターセプター
 *
 * 動的に評価されるメタデータをリクエストヘッダーに挿入します。
 * 認証トークンやユーザー情報など、リクエスト時に決定される値に使用します。
 *
 * @param getters - ヘッダー名とその値を返す関数のマップ
 * @returns Interceptor
 *
 * @example
 * ```typescript
 * const authInterceptor = metadataInterceptor({
 *   "authorization": () => `Bearer ${getAuthToken()}`,
 *   "x-user-id": () => getCurrentUserId(),
 * });
 * registerInterceptors(authInterceptor);
 * ```
 */
export function metadataInterceptor(
  getters: Record<string, () => string | undefined>
): Interceptor {
  return (next) => (req) => {
    for (const [k, fn] of Object.entries(getters)) {
      if (!req.header.has(k)) {
        const v = fn();
        if (v) req.header.set(k, v);
      }
    }
    return next(req);
  };
}

/**
 * ロギングインターセプター
 *
 * 全てのgRPCリクエストの実行時間とステータスをコンソールに出力します。
 * 開発時のデバッグに有用です。
 *
 * @returns Interceptor
 *
 * @example
 * 出力例:
 * ```
 * [gRPC] [OK] sapphillon.v1.VersionService.GetVersion (23.4 ms)
 * [gRPC] [ERROR] sapphillon.v1.WorkflowService.GenerateWorkflow (156.2 ms) Error: ...
 * ```
 */
export function loggingInterceptor(): Interceptor {
  return (next) => async (req) => {
    const start = performance.now();
    const fullName = `${req.service.typeName}.${req.method.name}`;
    try {
      const res = await next(req);
      const ms = (performance.now() - start).toFixed(1);
      console.debug(`[gRPC] [OK] ${fullName} (${ms} ms)`);
      return res;
    } catch (e) {
      const ms = (performance.now() - start).toFixed(1);
      console.error(`[gRPC] [ERROR] ${fullName} (${ms} ms)`, e);
      throw e;
    }
  };
}

/**
 * エラー正規化インターセプター
 *
 * ConnectError以外の例外を全てConnectErrorに変換します。
 * これにより、エラーハンドリングを統一できます。
 *
 * @returns Interceptor
 *
 * @example
 * ```typescript
 * try {
 *   await clients.version.getVersion({});
 * } catch (e) {
 *   // このインターセプターにより、eは常にConnectErrorになる
 *   console.assert(e instanceof ConnectError);
 * }
 * ```
 */
export function errorNormalizeInterceptor(): Interceptor {
  return (next) => async (req) => {
    try {
      return await next(req);
    } catch (e: unknown) {
      if (e instanceof ConnectError) throw e;
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      throw new ConnectError(`Unknown client error: ${msg}`);
    }
  };
}

/**
 * デフォルトで適用されるインターセプターのリスト
 *
 * 順序が重要です：
 * 1. requestIdInterceptor - リクエストIDを付与
 * 2. loggingInterceptor - ログ出力
 * 3. errorNormalizeInterceptor - エラーを正規化
 */
const baseInterceptors: Interceptor[] = [
  requestIdInterceptor(),
  loggingInterceptor(),
  errorNormalizeInterceptor(),
];

/**
 * グローバルに登録された追加のインターセプター
 *
 * アプリケーション起動時に認証インターセプターなどを登録できます。
 */
const extraInterceptors: Interceptor[] = [];

/**
 * グローバルなインターセプターを登録
 *
 * アプリケーション全体で適用されるカスタムインターセプターを追加します。
 * 例：認証トークン付与、カスタムログなど
 *
 * @param interceptors - 登録するインターセプター（可変長引数）
 *
 * @example
 * ```typescript
 * // アプリケーション起動時に認証インターセプターを登録
 * registerInterceptors(
 *   metadataInterceptor({
 *     "authorization": () => `Bearer ${localStorage.getItem("token")}`,
 *   })
 * );
 * ```
 */
export function registerInterceptors(...i: Interceptor[]) {
  extraInterceptors.push(...i);
}

function buildInterceptors(custom?: Interceptor[]) {
  return [...baseInterceptors, ...extraInterceptors, ...(custom || [])];
}

/**
 * カスタムインターセプターを使用したクライアントを生成
 *
 * 特定の用途に合わせたインターセプターを持つクライアントセットを作成します。
 * 通常は `clients` を使用し、特別な要件がある場合のみこの関数を使用してください。
 *
 * @param custom - 追加で適用するインターセプター（可変長引数）
 * @returns 全てのgRPCサービスクライアントを含むオブジェクト
 *
 * @example
 * ```typescript
 * // タイムアウト付きクライアントを作成
 * const timeoutClient = withInterceptors(
 *   (next) => (req) => {
 *     const controller = new AbortController();
 *     setTimeout(() => controller.abort(), 5000);
 *     return next({ ...req, signal: controller.signal });
 *   }
 * );
 *
 * const version = await timeoutClient.version.getVersion({});
 * ```
 */
export function withInterceptors(...custom: Interceptor[]) {
  // createGrpcWebTransport を再構築 (interceptors は transport 作成時に設定)
  const t = createGrpcWebTransport({
    baseUrl: BASE_URL,
    useBinaryFormat: USE_BINARY,
    interceptors: buildInterceptors(custom),
  });
  return {
    version: createClient(VersionService, t),
    workflow: createClient(WorkflowService, t),
    plugin: createClient(PluginService, t),
    provider: createClient(ProviderService, t),
    model: createClient(ModelService, t),
    searchModel: createClient(SearchModelService, t),
  } as const;
}

// ----------------------
// 既定のgRPCクライアント
// ----------------------

/**
 * デフォルトのgRPCトランスポート
 *
 * 全てのbaseおよびextraインターセプターが適用されています。
 */
const defaultTransport = createGrpcWebTransport({
  baseUrl: BASE_URL,
  useBinaryFormat: USE_BINARY,
  interceptors: buildInterceptors(),
});

/**
 * バージョン管理サービスクライアント
 *
 * バックエンドのバージョン情報取得とヘルスチェックに使用します。
 *
 * @example
 * ```typescript
 * const res = await versionClient.getVersion({});
 * console.log(res.version?.version); // "1.0.0"
 * ```
 */
export const versionClient = createClient(VersionService, defaultTransport);

/**
 * ワークフロー管理サービスクライアント
 *
 * ワークフローの生成・実行を管理します。
 *
 * @example
 * ```typescript
 * // ワークフロー生成（ストリーミング）
 * for await (const msg of workflowClient.generateWorkflow({ prompt: "メールを送信" })) {
 *   console.log(msg.workflowDefinition);
 * }
 *
 * // ワークフロー実行（IDで指定）
 * const result = await workflowClient.runWorkflow({
 *   byId: { workflowId: "wf-123", workflowCodeId: "code-456" }
 * });
 * ```
 */
export const workflowClient = createClient(WorkflowService, defaultTransport);

/**
 * プラグイン管理サービスクライアント
 *
 * 利用可能なプラグインの一覧取得に使用します。
 *
 * @example
 * ```typescript
 * const res = await pluginClient.listPlugins({ pageSize: 10 });
 * console.log(res.plugins);
 * ```
 */
export const pluginClient = createClient(PluginService, defaultTransport);

/**
 * AIプロバイダー管理サービスクライアント
 *
 * AIモデルのプロバイダー情報を管理します。
 */
export const providerClient = createClient(ProviderService, defaultTransport);

/**
 * AIモデル管理サービスクライアント
 *
 * 利用可能なAIモデルの情報を管理します。
 */
export const modelClient = createClient(ModelService, defaultTransport);

/**
 * AIモデル検索サービスクライアント
 *
 * 条件に応じたAIモデルを検索します。
 */
export const searchModelClient = createClient(
  SearchModelService,
  defaultTransport
);

/**
 * 全てのgRPCサービスクライアントを含むオブジェクト
 *
 * これがメインのエクスポートです。通常はこれを使用してください。
 *
 * @example
 * ```typescript
 * import { clients } from '@/lib/grpc-clients';
 *
 * // バージョン確認
 * const version = await clients.version.getVersion({});
 *
 * // ワークフロー生成
 * for await (const msg of clients.workflow.generateWorkflow({ prompt: "タスク" })) {
 *   console.log(msg);
 * }
 * ```
 */
export const clients = {
  version: versionClient,
  workflow: workflowClient,
  plugin: pluginClient,
  provider: providerClient,
  model: modelClient,
  searchModel: searchModelClient,
};

/**
 * Clients型定義
 *
 * 全てのgRPCクライアントの型情報
 */
export type Clients = typeof clients;

export default clients;

/**
 * パブリックトランスポート
 *
 * 高度なユースケース（カスタムサービスの追加など）で使用します。
 * 通常のアプリケーション開発では `clients` を使用してください。
 */
export const transport = defaultTransport;
