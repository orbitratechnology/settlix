import "server-only"

import { MockLanguageModelV4 } from "ai/test"

import type { TestFault } from "@/lib/testing/faults"

const usage = {
  inputTokens: {
    total: 0,
    noCache: 0,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
}

/**
 * A model that fails the way the named fault describes. It never produces a
 * recommendation, so nothing it returns can be stored as AI output.
 */
export function faultModel(fault: Extract<TestFault, `ai_${string}`>) {
  return {
    modelId: `test-fault:${fault}`,
    model: new MockLanguageModelV4({
      modelId: `test-fault:${fault}`,
      doGenerate: async () => {
        if (fault === "ai_timeout") {
          throw new DOMException("The operation timed out.", "TimeoutError")
        }
        return {
          content: [{ type: "text", text: '{"proposedAction":"full_refund"}' }],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        }
      },
    }),
  }
}
