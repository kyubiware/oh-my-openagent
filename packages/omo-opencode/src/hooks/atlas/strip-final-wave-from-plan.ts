import { readFileSync, writeFileSync } from "node:fs"
import { resolve, relative } from "node:path"
import { log } from "../../shared/logger"
import { HOOK_NAME } from "./hook-name"

const FINAL_VERIFICATION_HEADING_PATTERN = /^##\s+Final Verification Wave\b/i
const SECOND_LEVEL_HEADING_PATTERN = /^##\s+/

/**
 * Returns true if the file path is inside .omo/plans/ relative to the project directory.
 */
export function isPlanFilePath(projectDir: string, filePath: string): boolean {
  const rel = relative(resolve(projectDir), resolve(filePath))
  return rel.startsWith(".omo/plans/") || rel.startsWith(".omo\\plans\\")
}

/**
 * Strips the "## Final Verification Wave" section and everything after it
 * from a plan markdown file. Returns true if the section was found and stripped.
 */
export function stripFinalVerificationWaveFromPlan(planPath: string): boolean {
  try {
    const content = readFileSync(planPath, "utf-8")
    const lines = content.split(/\r?\n/)
    const finalWaveStart = lines.findIndex((line) => FINAL_VERIFICATION_HEADING_PATTERN.test(line))

    if (finalWaveStart < 0) {
      return false
    }

    const stripped = lines.slice(0, finalWaveStart).join("\n").replace(/\n+$/, "\n")
    writeFileSync(planPath, stripped, "utf-8")

    log(`[${HOOK_NAME}] Stripped Final Verification Wave section from plan`, { planPath })
    return true
  } catch {
    return false
  }
}
