import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createBoulderState, readBoulderState, writeBoulderState } from "../../features/boulder-state"
import { _resetForTesting, registerAgentName } from "../../features/claude-code-session-state"
import { releaseAllPromptAsyncReservationsForTesting } from "../shared/prompt-async-gate"
import { handleAtlasSessionIdle } from "./idle-event"
import { getPlanProgressIgnoringFinalWave } from "./plan-progress-ignore-final-wave"
import { createToolExecuteAfterHandler } from "./tool-execute-after"
import type { SessionState } from "./types"
import { unsafeTestValue } from "../../../test-support/unsafe-test-value"

const PLAN_WITH_FINAL_WAVE = `# Plan

## TODOs
- [ ] 1. Ship the implementation

## Final Verification Wave (MANDATORY - after ALL implementation tasks)
- [ ] F1. **Plan Compliance Audit** - \`oracle\`
- [ ] F2. **Code Quality Review** - \`unspecified-high\`
- [ ] F3. **Real Manual QA** - \`unspecified-high\`
- [ ] F4. **Scope Fidelity Check** - \`deep\`
`

describe("disable_final_verification_wave", () => {
  const SESSION_ID = "session-disable-fw"

  let testDirectory = ""

  beforeEach(() => {
    testDirectory = join(tmpdir(), `atlas-disable-fw-${randomUUID()}`)
    if (!existsSync(testDirectory)) {
      mkdirSync(testDirectory, { recursive: true })
    }
    _resetForTesting()
    registerAgentName("atlas")
  })

  afterEach(() => {
    if (existsSync(testDirectory)) {
      rmSync(testDirectory, { recursive: true, force: true })
    }
    _resetForTesting()
    releaseAllPromptAsyncReservationsForTesting()
  })

  it("treats plan as complete when all TODOs are done but F1-F4 are unchecked and flag is enabled", async () => {
    // given: plan with all implementation tasks done, final-wave tasks unchecked
    const planPath = join(testDirectory, "plan.md")
    writeFileSync(
      planPath,
      `# Plan

## TODOs
- [x] 1. Ship the implementation

## Final Verification Wave (MANDATORY - after ALL implementation tasks)
- [ ] F1. **Plan Compliance Audit** - \`oracle\`
- [ ] F2. **Code Quality Review** - \`unspecified-high\`
- [ ] F3. **Real Manual QA** - \`unspecified-high\`
- [ ] F4. **Scope Fidelity Check** - \`deep\`
`,
    )

    const boulder = createBoulderState(planPath, SESSION_ID, "atlas")
    const workId = boulder.active_work_id
    if (!workId) {
      throw new Error("Expected active_work_id")
    }

    const work = boulder.works?.[workId]
    if (!work) {
      throw new Error("Expected active work")
    }

    work.elapsed_ms = 30_000
    boulder.elapsed_ms = 30_000
    writeBoulderState(testDirectory, boulder)

    const promptAsyncMock = mock(async () => ({ data: {} }))
    const ctx = unsafeTestValue<PluginInput>({
      directory: testDirectory,
      client: {
        session: {
          promptAsync: promptAsyncMock,
        },
      },
    })

    const sessionStateById = new Map<string, SessionState>()
    const getState = (sessionId: string): SessionState => {
      let state = sessionStateById.get(sessionId)
      if (!state) {
        state = { promptFailureCount: 0 }
        sessionStateById.set(sessionId, state)
      }
      return state
    }

    // when: idle with disableFinalVerificationWave enabled
    await handleAtlasSessionIdle({
      ctx,
      sessionID: SESSION_ID,
      getState,
      getPlanProgressOverride: getPlanProgressIgnoringFinalWave,
    })

    // then: boulder should be marked as completed (not stuck waiting for F1-F4)
    expect(promptAsyncMock).toHaveBeenCalledTimes(1)
    expect(readBoulderState(testDirectory)?.works?.[workId]?.status).toBe("completed")
  })

  it("does NOT treat plan as complete when all TODOs are done but F1-F4 are unchecked and flag is NOT enabled", async () => {
    // given: same plan but without the flag
    const planPath = join(testDirectory, "plan.md")
    writeFileSync(
      planPath,
      `# Plan

## TODOs
- [x] 1. Ship the implementation

## Final Verification Wave (MANDATORY - after ALL implementation tasks)
- [ ] F1. **Plan Compliance Audit** - \`oracle\`
- [ ] F2. **Code Quality Review** - \`unspecified-high\`
- [ ] F3. **Real Manual QA** - \`unspecified-high\`
- [ ] F4. **Scope Fidelity Check** - \`deep\`
`,
    )

    const boulder = createBoulderState(planPath, SESSION_ID, "atlas")
    const workId = boulder.active_work_id
    if (!workId) {
      throw new Error("Expected active_work_id")
    }

    const work = boulder.works?.[workId]
    if (!work) {
      throw new Error("Expected active work")
    }

    work.elapsed_ms = 30_000
    boulder.elapsed_ms = 30_000
    writeBoulderState(testDirectory, boulder)

    const promptAsyncMock = mock(async () => ({ data: {} }))
    const ctx = unsafeTestValue<PluginInput>({
      directory: testDirectory,
      client: {
        session: {
          promptAsync: promptAsyncMock,
        },
      },
    })

    const sessionStateById = new Map<string, SessionState>()
    const getState = (sessionId: string): SessionState => {
      let state = sessionStateById.get(sessionId)
      if (!state) {
        state = { promptFailureCount: 0 }
        sessionStateById.set(sessionId, state)
      }
      return state
    }

    // when: idle without the flag
    await handleAtlasSessionIdle({
      ctx,
      sessionID: SESSION_ID,
      getState,
    })

    // then: boulder should NOT be completed — F1-F4 tasks remain
    expect(readBoulderState(testDirectory)?.works?.[workId]?.status).not.toBe("completed")
  })

  describe("plan stripping", () => {
    it("strips Final Verification Wave section from plan when flag is enabled and plan is written", async () => {
      // given: plan with final verification wave section and boulder state
      const planPath = join(testDirectory, ".omo/plans/test-plan.md")
      mkdirSync(join(testDirectory, ".omo/plans"), { recursive: true })
      writeFileSync(planPath, PLAN_WITH_FINAL_WAVE)

      const boulder = createBoulderState(planPath, SESSION_ID, "atlas")
      writeBoulderState(testDirectory, boulder)

      const pendingFilePaths = new Map<string, string>()
      const pendingPlanSnapshots = new Map<string, string>()
      pendingFilePaths.set("call-1", planPath)
      pendingPlanSnapshots.set("call-1", PLAN_WITH_FINAL_WAVE)

      const ctx = unsafeTestValue<PluginInput>({
        directory: testDirectory,
        client: {},
      })

      const handler = createToolExecuteAfterHandler({
        ctx,
        pendingFilePaths,
        pendingPlanSnapshots,
        autoCommit: true,
        disableFinalVerificationWave: true,
        getState: () => ({ promptFailureCount: 0 }),
        isCallerOrchestrator: async () => true,
      })

      // when: Write tool executes on the plan file
      await handler(
        { tool: "write", sessionID: SESSION_ID, callID: "call-1" },
        { output: "File written", metadata: {} },
      )

      // then: Final Verification Wave section should be stripped from the plan
      const planContent = readFileSync(planPath, "utf-8")
      expect(planContent).not.toContain("Final Verification Wave")
      expect(planContent).not.toContain("F1.")
      expect(planContent).not.toContain("F2.")
      expect(planContent).not.toContain("F3.")
      expect(planContent).not.toContain("F4.")
      expect(planContent).toContain("## TODOs")
      expect(planContent).toContain("1. Ship the implementation")
    })

    it("does NOT strip Final Verification Wave section when flag is NOT enabled", async () => {
      // given: same plan without the flag
      const planPath = join(testDirectory, ".omo/plans/test-plan.md")
      mkdirSync(join(testDirectory, ".omo/plans"), { recursive: true })
      writeFileSync(planPath, PLAN_WITH_FINAL_WAVE)

      const boulder = createBoulderState(planPath, SESSION_ID, "atlas")
      writeBoulderState(testDirectory, boulder)

      const pendingFilePaths = new Map<string, string>()
      const pendingPlanSnapshots = new Map<string, string>()
      pendingFilePaths.set("call-2", planPath)
      pendingPlanSnapshots.set("call-2", PLAN_WITH_FINAL_WAVE)

      const ctx = unsafeTestValue<PluginInput>({
        directory: testDirectory,
        client: {},
      })

      const handler = createToolExecuteAfterHandler({
        ctx,
        pendingFilePaths,
        pendingPlanSnapshots,
        autoCommit: true,
        disableFinalVerificationWave: false,
        getState: () => ({ promptFailureCount: 0 }),
        isCallerOrchestrator: async () => true,
      })

      // when: Write tool executes on the plan file
      await handler(
        { tool: "write", sessionID: SESSION_ID, callID: "call-2" },
        { output: "File written", metadata: {} },
      )

      // then: Final Verification Wave section should remain
      const planContent = readFileSync(planPath, "utf-8")
      expect(planContent).toContain("Final Verification Wave")
      expect(planContent).toContain("F1.")
    })

    it("strips Final Verification Wave even when session is NOT atlas (e.g. prometheus)", async () => {
      // given: prometheus writes the plan (isCallerOrchestrator returns false)
      const planPath = join(testDirectory, ".omo/plans/test-plan.md")
      mkdirSync(join(testDirectory, ".omo/plans"), { recursive: true })
      writeFileSync(planPath, PLAN_WITH_FINAL_WAVE)

      const boulder = createBoulderState(planPath, SESSION_ID, "prometheus")
      writeBoulderState(testDirectory, boulder)

      const pendingFilePaths = new Map<string, string>()
      const pendingPlanSnapshots = new Map<string, string>()
      pendingFilePaths.set("call-3", planPath)
      pendingPlanSnapshots.set("call-3", PLAN_WITH_FINAL_WAVE)

      const ctx = unsafeTestValue<PluginInput>({
        directory: testDirectory,
        client: {},
      })

      const handler = createToolExecuteAfterHandler({
        ctx,
        pendingFilePaths,
        pendingPlanSnapshots,
        autoCommit: true,
        disableFinalVerificationWave: true,
        getState: () => ({ promptFailureCount: 0 }),
        isCallerOrchestrator: async () => false, // Prometheus is NOT atlas
      })

      // when: Write tool executes on the plan file
      await handler(
        { tool: "write", sessionID: SESSION_ID, callID: "call-3" },
        { output: "File written", metadata: {} },
      )

      // then: Final Verification Wave section should STILL be stripped
      const planContent = readFileSync(planPath, "utf-8")
      expect(planContent).not.toContain("Final Verification Wave")
      expect(planContent).not.toContain("F1.")
      expect(planContent).toContain("## TODOs")
    })

    it("strips Final Verification Wave when plan has NO boulder state (standalone prometheus plan)", async () => {
      // given: prometheus writes a plan directly without /start-work (no boulder state)
      const planPath = join(testDirectory, ".omo/plans/pre-commit-checks.md")
      mkdirSync(join(testDirectory, ".omo/plans"), { recursive: true })
      writeFileSync(planPath, PLAN_WITH_FINAL_WAVE)
      // No writeBoulderState — simulates standalone plan creation

      const pendingFilePaths = new Map<string, string>()
      const pendingPlanSnapshots = new Map<string, string>()

      const ctx = unsafeTestValue<PluginInput>({
        directory: testDirectory,
        client: {},
      })

      const handler = createToolExecuteAfterHandler({
        ctx,
        pendingFilePaths,
        pendingPlanSnapshots,
        autoCommit: true,
        disableFinalVerificationWave: true,
        getState: () => ({ promptFailureCount: 0 }),
        isCallerOrchestrator: async () => false,
      })

      // when: Write tool executes on the plan file (via metadata.filePath)
      await handler(
        { tool: "write", sessionID: "ses_prometheus_standalone" },
        { output: "File written", metadata: { filePath: planPath } },
      )

      // then: Final Verification Wave section should be stripped
      const planContent = readFileSync(planPath, "utf-8")
      expect(planContent).not.toContain("Final Verification Wave")
      expect(planContent).not.toContain("F1.")
      expect(planContent).toContain("## TODOs")
    })
  })
})
