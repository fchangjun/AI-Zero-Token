declare module "*sites/codex-reset/public/intel-card.js" {
  export interface IntelCardSnapshot {
    readonly capturedAt: string;
    readonly [key: string]: unknown;
  }

  export function getIntelCardData(
    resetData: unknown,
    marketData: unknown,
    options?: { now?: number | Date; proPlanId?: string },
  ): IntelCardSnapshot | null;

  export function intelCardCaption(
    info: IntelCardSnapshot | null,
    options?: { pageUrl?: string; aztUrl?: string },
  ): string;

  export function renderIntelCard(
    canvas: HTMLCanvasElement,
    info: IntelCardSnapshot,
    options?: { avatarUrl?: string },
  ): Promise<HTMLCanvasElement>;
}
