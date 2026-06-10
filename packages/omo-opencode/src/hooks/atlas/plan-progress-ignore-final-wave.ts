import { existsSync, readFileSync } from "node:fs"
import type { PlanProgress } from "../../features/boulder-state"

const TODO_HEADING_PATTERN = /^##\s+TODOs\b/i
const FINAL_VERIFICATION_HEADING_PATTERN = /^##\s+Final Verification Wave\b/i
const SECOND_LEVEL_HEADING_PATTERN = /^##\s+/
const CHECKED_CHECKBOX_PATTERN = /^(\s*)[-*]\s*\[[xX]\]\s*(.+)$/
const UNCHECKED_CHECKBOX_PATTERN = /^(\s*)[-*]\s*\[\s*\]\s*(.+)$/
const TODO_TASK_PATTERN = /^\d+\.\s+/

/**
 * Like getPlanProgress but only counts TODO section tasks.
 * Final Verification Wave tasks are excluded from the count entirely.
 */
export function getPlanProgressIgnoringFinalWave(planPath: string): PlanProgress {
  if (!existsSync(planPath)) {
    return { total: 0, completed: 0, isComplete: false }
  }

  try {
    const content = readFileSync(planPath, "utf-8")
    const lines = content.split(/\r?\n/)
    let inTodoSection = false
    let total = 0
    let completed = 0

    for (const line of lines) {
      if (SECOND_LEVEL_HEADING_PATTERN.test(line)) {
        inTodoSection = TODO_HEADING_PATTERN.test(line)
        continue
      }

      if (FINAL_VERIFICATION_HEADING_PATTERN.test(line)) {
        inTodoSection = false
        continue
      }

      if (!inTodoSection) {
        continue
      }

      const checkedMatch = line.match(CHECKED_CHECKBOX_PATTERN)
      const uncheckedMatch = checkedMatch ? null : line.match(UNCHECKED_CHECKBOX_PATTERN)
      const match = checkedMatch ?? uncheckedMatch
      if (!match || match[1].length > 0) {
        continue
      }

      const taskBody = match[2].trim()
      if (!TODO_TASK_PATTERN.test(taskBody)) {
        continue
      }

      total += 1
      if (checkedMatch) {
        completed += 1
      }
    }

    return { total, completed, isComplete: total > 0 && completed === total }
  } catch {
    return { total: 0, completed: 0, isComplete: false }
  }
}
