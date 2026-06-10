import { describe, it, expect } from "bun:test"
import { getPrometheusPrompt } from "./system-prompt"

describe("getPrometheusPrompt", () => {
  describe("#given question tool is not disabled", () => {
    describe("#when generating prompt", () => {
      it("#then should include Question tool references", () => {
        const prompt = getPrometheusPrompt(undefined, [])

        expect(prompt).toContain("Question({")
      })
    })
  })

  describe("#given question tool is disabled via disabled_tools", () => {
    describe("#when generating prompt", () => {
      it("#then should strip Question tool code examples", () => {
        const prompt = getPrometheusPrompt(undefined, ["question"])

        expect(prompt).not.toContain("Question({")
      })
    })

    describe("#when disabled_tools includes question among other tools", () => {
      it("#then should strip Question tool code examples", () => {
        const prompt = getPrometheusPrompt(undefined, ["todowrite", "question", "interactive_bash"])

        expect(prompt).not.toContain("Question({")
      })
    })
  })

  describe("#given no disabled_tools provided", () => {
    describe("#when generating prompt with undefined", () => {
      it("#then should include Question tool references", () => {
        const prompt = getPrometheusPrompt(undefined, undefined)

        expect(prompt).toContain("Question({")
      })
    })
  })

  describe("#given disableFinalVerificationWave is true", () => {
    describe("#when generating prompt", () => {
      it("#then should strip Final Verification Wave plan template section and F1-F4 tasks", () => {
        const prompt = getPrometheusPrompt(undefined, [], true)

        // The plan template should NOT include the FVW section with F1-F4 tasks
        expect(prompt).not.toContain("F1. **Plan Compliance Audit**")
        expect(prompt).not.toContain("F2. **Code Quality Review**")
        expect(prompt).not.toContain("F3. **Real Manual QA**")
        expect(prompt).not.toContain("F4. **Scope Fidelity Check**")
        // The MANDATORY section heading should be stripped
        expect(prompt).not.toContain("## Final Verification Wave (MANDATORY")
      })
    })

    describe("#when generating GPT variant prompt", () => {
      it("#then should strip Final Verification Wave section from GPT variant too", () => {
        const prompt = getPrometheusPrompt("gpt-5.5", [], true)

        expect(prompt).not.toContain("## Final Verification Wave (MANDATORY")
        expect(prompt).not.toContain("F1.")
        expect(prompt).not.toContain("F4.")
      })
    })
  })

  describe("#given disableFinalVerificationWave is false or undefined", () => {
    describe("#when generating prompt", () => {
      it("#then should include Final Verification Wave section", () => {
        const prompt = getPrometheusPrompt(undefined, [])

        expect(prompt).toContain("Final Verification Wave")
      })
    })

    describe("#when flag is explicitly false", () => {
      it("#then should include Final Verification Wave section", () => {
        const prompt = getPrometheusPrompt(undefined, [], false)

        expect(prompt).toContain("Final Verification Wave")
      })
    })
  })
})
