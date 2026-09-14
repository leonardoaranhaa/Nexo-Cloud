export const DEFAULT_WHATSAPP_POLICY = {
  minDelayMs: 3000,
  dailyMessageLimit: 200,
  burstLimit: 20,
  burstWindowMs: 5 * 60 * 1000,
  handoffPauseMinutes: 30,
  typingSimulation: false,
} as const;

export type WhatsAppPolicy = {
  minDelayMs: number;
  dailyMessageLimit: number;
  burstLimit: number;
  burstWindowMs: number;
  handoffPauseMinutes: number;
  typingSimulation: boolean;
};

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

export function whatsappPolicy(config: Record<string, unknown> | null | undefined): WhatsAppPolicy {
  return {
    minDelayMs: boundedNumber(config?.whatsappMinDelayMs, DEFAULT_WHATSAPP_POLICY.minDelayMs, 0, 30_000),
    dailyMessageLimit: boundedNumber(config?.whatsappDailyMessageLimit, DEFAULT_WHATSAPP_POLICY.dailyMessageLimit, 1, 10_000),
    burstLimit: boundedNumber(config?.whatsappBurstLimit, DEFAULT_WHATSAPP_POLICY.burstLimit, 1, 500),
    burstWindowMs: boundedNumber(config?.whatsappBurstWindowMs, DEFAULT_WHATSAPP_POLICY.burstWindowMs, 30_000, 60 * 60 * 1000),
    handoffPauseMinutes: boundedNumber(config?.whatsappHandoffPauseMinutes, DEFAULT_WHATSAPP_POLICY.handoffPauseMinutes, 0, 24 * 60),
    typingSimulation: config?.whatsappTypingSimulation === true,
  };
}

export function whatsappPolicyPatch(input: {
  whatsappMinDelayMs?: number;
  whatsappDailyMessageLimit?: number;
  whatsappBurstLimit?: number;
  whatsappBurstWindowMs?: number;
  whatsappHandoffPauseMinutes?: number;
  whatsappTypingSimulation?: boolean;
}): Record<string, unknown> {
  return {
    ...(input.whatsappMinDelayMs !== undefined ? { whatsappMinDelayMs: boundedNumber(input.whatsappMinDelayMs, DEFAULT_WHATSAPP_POLICY.minDelayMs, 0, 30_000) } : {}),
    ...(input.whatsappDailyMessageLimit !== undefined ? { whatsappDailyMessageLimit: boundedNumber(input.whatsappDailyMessageLimit, DEFAULT_WHATSAPP_POLICY.dailyMessageLimit, 1, 10_000) } : {}),
    ...(input.whatsappBurstLimit !== undefined ? { whatsappBurstLimit: boundedNumber(input.whatsappBurstLimit, DEFAULT_WHATSAPP_POLICY.burstLimit, 1, 500) } : {}),
    ...(input.whatsappBurstWindowMs !== undefined ? { whatsappBurstWindowMs: boundedNumber(input.whatsappBurstWindowMs, DEFAULT_WHATSAPP_POLICY.burstWindowMs, 30_000, 60 * 60 * 1000) } : {}),
    ...(input.whatsappHandoffPauseMinutes !== undefined ? { whatsappHandoffPauseMinutes: boundedNumber(input.whatsappHandoffPauseMinutes, DEFAULT_WHATSAPP_POLICY.handoffPauseMinutes, 0, 24 * 60) } : {}),
    ...(input.whatsappTypingSimulation !== undefined ? { whatsappTypingSimulation: input.whatsappTypingSimulation } : {}),
  };
}
