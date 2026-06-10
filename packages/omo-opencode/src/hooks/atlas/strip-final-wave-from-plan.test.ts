import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { isPlanFilePath, stripFinalVerificationWaveFromPlan } from "./strip-final-wave-from-plan"

describe("isPlanFilePath", () => {
  const projectDir = "/home/user/my-project"

  it("returns true for a file inside .omo/plans/", () => {
    expect(isPlanFilePath(projectDir, "/home/user/my-project/.omo/plans/my-plan.md")).toBe(true)
  })

  it("returns true for deeply nested path if it starts with .omo/plans/", () => {
    expect(isPlanFilePath(projectDir, "/home/user/my-project/.omo/plans/sub/dir/plan.md")).toBe(true)
  })

  it("returns false for a file outside .omo/plans/", () => {
    expect(isPlanFilePath(projectDir, "/home/user/my-project/src/index.ts")).toBe(false)
  })

  it("returns false for .omo but not plans", () => {
    expect(isPlanFilePath(projectDir, "/home/user/my-project/.omo/tasks/other.md")).toBe(false)
  })

  it("returns false for a plans dir that is not under .omo", () => {
    expect(isPlanFilePath(projectDir, "/home/user/my-project/plans/my-plan.md")).toBe(false)
  })

  it("returns false for completely unrelated path", () => {
    expect(isPlanFilePath(projectDir, "/tmp/unrelated.md")).toBe(false)
  })
})

describe("stripFinalVerificationWaveFromPlan", () => {
  const tmpBase = join(tmpdir(), "strip-final-wave-spec")

  beforeEach(() => {
    mkdirSync(tmpBase, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true })
  })

  it("strips Final Verification Wave section and everything after it", () => {
    // given
    const planPath = join(tmpBase, "plan.md")
    writeFileSync(planPath, `# Plan

## TODOs
- [ ] 1. Implement feature X
- [ ] 2. Write tests

## Final Verification Wave
- [ ] F1. Run test suite
- [ ] F2. Code review
- [ ] F3. Check edge cases
- [ ] F4. Final approval
`)

    // when
    const result = stripFinalVerificationWaveFromPlan(planPath)

    // then
    expect(result).toBe(true)
    const content = require("fs").readFileSync(planPath, "utf-8")
    expect(content).toContain("## TODOs")
    expect(content).toContain("Implement feature X")
    expect(content).not.toContain("Final Verification Wave")
    expect(content).not.toContain("F1.")
    expect(content).not.toContain("F4.")
  })

  it("returns false when plan has no Final Verification Wave section", () => {
    // given
    const planPath = join(tmpBase, "plan.md")
    writeFileSync(planPath, `# Plan

## TODOs
- [ ] 1. Ship it
`)

    // when
    const result = stripFinalVerificationWaveFromPlan(planPath)

    // then
    expect(result).toBe(false)
    const content = require("fs").readFileSync(planPath, "utf-8")
    expect(content).toContain("Ship it")
  })

  it("returns false for nonexistent file", () => {
    const result = stripFinalVerificationWaveFromPlan(join(tmpBase, "nope.md"))
    expect(result).toBe(false)
  })

  it("handles case-insensitive heading match", () => {
    // given
    const planPath = join(tmpBase, "plan.md")
    writeFileSync(planPath, `# Plan

## todos
- [ ] 1. Work

## final verification wave
- [ ] F1. Check
`)

    // when
    const result = stripFinalVerificationWaveFromPlan(planPath)

    // then
    expect(result).toBe(true)
    const content = require("fs").readFileSync(planPath, "utf-8")
    expect(content).not.toContain("final verification wave")
  })
})
