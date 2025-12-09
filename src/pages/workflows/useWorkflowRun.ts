/**
 * @fileoverview 既存ワークフローの実行を管理するカスタムフック
 *
 * @module pages/workflows/useWorkflowRun
 */

import React from "react";
import { clients } from "@/lib/grpc-clients";
import type { RunWorkflowResponse } from "@/gen/sapphillon/v1/workflow_service_pb";
import {
  WorkflowSourceByIdSchema,
  type WorkflowSourceById,
} from "@/gen/sapphillon/v1/workflow_service_pb";
import type { Workflow } from "@/gen/sapphillon/v1/workflow_pb";
import { create } from "@bufbuild/protobuf";

/**
 * ワークフロー実行中のイベント
 */
export type RunEvent = {
  /** イベント発生時刻（Unixタイムスタンプ） */
  t: number;
  /** イベント種別 */
  kind: "message" | "error" | "done";
  /** イベントのペイロード（種別により異なる） */
  payload?: unknown;
};

/**
 * useWorkflowRunフックの戻り値
 */
export interface UseWorkflowRunReturn {
  /** 現在実行中かどうか */
  running: boolean;
  /** 実行中に発生したイベントのリスト */
  events: RunEvent[];
  /** ワークフロー実行結果 */
  runRes: RunWorkflowResponse | null;
  /** ワークフローを実行（ID指定） */
  runById: (workflowId: string, workflowCodeId?: string) => Promise<void>;
  /** ワークフローを実行（定義指定） */
  runByDefinition: (workflow: Workflow) => Promise<void>;
  /** イベントログをクリア */
  clearEvents: () => void;
}

/**
 * ワークフロー実行フック
 *
 * 既存のワークフローを実行するための状態管理とロジックを提供します。
 *
 * @returns ワークフロー実行のための状態と関数
 */
export function useWorkflowRun(): UseWorkflowRunReturn {
  const [running, setRunning] = React.useState(false);
  const [events, setEvents] = React.useState<RunEvent[]>([]);
  const [runRes, setRunRes] = React.useState<RunWorkflowResponse | null>(null);

  const append = React.useCallback((e: Omit<RunEvent, "t">) => {
    setEvents((prev) => [...prev, { t: Date.now(), ...e }]);
  }, []);

  const runById = React.useCallback(
    async (workflowId: string, workflowCodeId?: string) => {
      if (running) return;
      setEvents([]);
      setRunRes(null);
      setRunning(true);
      try {
        append({ kind: "message", payload: { stage: "run", status: "start" } });
        const res = await clients.workflow.runWorkflow({
          byId: create(WorkflowSourceByIdSchema, {
            workflowId,
            workflowCodeId: workflowCodeId || "",
          }) as WorkflowSourceById,
        });
        setRunRes(res);
        append({ kind: "message", payload: res });
        append({ kind: "done", payload: { stage: "run" } });
      } catch (e) {
        append({ kind: "error", payload: e });
      } finally {
        setRunning(false);
      }
    },
    [append, running]
  );

  /**
   * ワークフロー定義から実行
   *
   * ワークフローを保存してからIDで実行します。
   */
  const runByDefinition = React.useCallback(
    async (workflow: Workflow) => {
      if (running) return;
      setEvents([]);
      setRunRes(null);
      setRunning(true);
      try {
        append({
          kind: "message",
          payload: { stage: "save", status: "start" },
        });

        // ワークフローを保存
        const saveResponse = await clients.workflow.updateWorkflow({
          workflow,
        });

        if (!saveResponse.workflow?.id) {
          throw new Error("Failed to save workflow: no ID returned");
        }

        const workflowId = saveResponse.workflow.id;
        const workflowCodeId =
          saveResponse.workflow.workflowCode?.[0]?.id || "";

        append({
          kind: "message",
          payload: { stage: "save", status: "done", workflowId },
        });

        // 保存されたワークフローをIDで実行
        append({ kind: "message", payload: { stage: "run", status: "start" } });

        const res = await clients.workflow.runWorkflow({
          byId: create(WorkflowSourceByIdSchema, {
            workflowId,
            workflowCodeId,
          }) as WorkflowSourceById,
        });

        setRunRes(res);
        append({ kind: "message", payload: res });
        append({ kind: "done", payload: { stage: "run" } });
      } catch (e) {
        append({ kind: "error", payload: e });
      } finally {
        setRunning(false);
      }
    },
    [append, running]
  );

  const clearEvents = React.useCallback(() => {
    setEvents([]);
  }, []);

  return {
    running,
    events,
    runRes,
    runById,
    runByDefinition,
    clearEvents,
  } as const;
}
