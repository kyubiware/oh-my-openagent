import type { PluginInput } from "@opencode-ai/plugin"
import { createAtlasEventHandler } from "./event-handler"
import { getPlanProgressIgnoringFinalWave } from "./plan-progress-ignore-final-wave"
import { createToolExecuteAfterHandler } from "./tool-execute-after"
import { createToolExecuteBeforeHandler } from "./tool-execute-before"
import type { AtlasHookOptions, PendingTaskRef, SessionState } from "./types"

export function createAtlasHook(ctx: PluginInput, options?: AtlasHookOptions) {
  const sessions = new Map<string, SessionState>()
  const pendingFilePaths = new Map<string, string>()
  const pendingTaskRefs = new Map<string, PendingTaskRef>()
  const pendingPlanSnapshots = new Map<string, string>()
  const autoCommit = options?.autoCommit ?? true
  const disableFinalVerificationWave = options?.disableFinalVerificationWave ?? false
  const getPlanProgressOverride = disableFinalVerificationWave
    ? getPlanProgressIgnoringFinalWave
    : undefined

  function getState(sessionID: string): SessionState {
    let state = sessions.get(sessionID)
    if (!state) {
      state = { promptFailureCount: 0 }
      sessions.set(sessionID, state)
    }
    return state
  }

  return {
    handler: createAtlasEventHandler({ ctx, options, sessions, getState, getPlanProgressOverride }),
    "tool.execute.before": createToolExecuteBeforeHandler({
      ctx,
      pendingFilePaths,
      pendingTaskRefs,
      pendingPlanSnapshots,
      isCallerOrchestrator: options?.isCallerOrchestrator,
    }),
    "tool.execute.after": createToolExecuteAfterHandler({
      ctx,
      pendingFilePaths,
      pendingTaskRefs,
      pendingPlanSnapshots,
      autoCommit,
      disableFinalVerificationWave,
      getState,
      isCallerOrchestrator: options?.isCallerOrchestrator,
    }),
  }
}
