import { loadPromptSync, prometheusPromptVariants } from "@oh-my-opencode/prompts-core"
import { isGptModel, isGeminiModel } from "../types"

export type PrometheusPromptSource = "default" | "gpt" | "gemini"

export const PROMETHEUS_PERMISSION = {
  edit: "allow" as const,
  bash: "allow" as const,
  webfetch: "allow" as const,
  question: "allow" as const,
}

const QUESTION_TOOL_BLOCK_RE = /```typescript\r?\n\s*Question\(\{[\s\S]*?\}\)\s*\r?\n```/g

// Matches "## Final Verification Wave" heading + content until next "## " heading or "---" separator
const FINAL_VERIFICATION_WAVE_RE = /^## Final Verification Wave[\s\S]*?(?=\n^---|\n^## )/gm

function loadPrometheusVariant(variant: PrometheusPromptSource): string {
  return loadPromptSync({
    source: prometheusPromptVariants[variant],
    name: "prometheus",
    variant,
  }).body
}

export const PROMETHEUS_SYSTEM_PROMPT = loadPrometheusVariant("default")

export function getPrometheusPromptSource(model?: string): PrometheusPromptSource {
  if (model && isGptModel(model)) return "gpt"
  if (model && isGeminiModel(model)) return "gemini"
  return "default"
}

export function getPrometheusPrompt(
  model?: string,
  disabledTools?: readonly string[],
  disableFinalVerificationWave?: boolean,
): string {
  const variant = getPrometheusPromptSource(model)
  let body = loadPrometheusVariant(variant)
  if (disabledTools?.includes("question")) {
    body = body.replace(QUESTION_TOOL_BLOCK_RE, "")
  }
  if (disableFinalVerificationWave) {
    body = body.replace(FINAL_VERIFICATION_WAVE_RE, "")
  }
  return body
}
