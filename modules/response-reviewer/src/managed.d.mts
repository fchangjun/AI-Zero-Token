import type { Server } from "node:http";
export type ReviewerRuntime = {
  instanceId: string; token: string; baseUrl: string; pid: number;
  name: string; version: string; protocolVersion: number; startedAt: string;
};
export type ReviewerInstance = {
  server: Server; runtime: ReviewerRuntime;
  reviewUrl(options?: { responseId?: string; scopeId?: string }): string;
  close(): Promise<void>;
};
export type ReviewSummary = {
  id: string; title: string; projectDir: string | null; threadKey: string | null;
  updatedAt: string; annotationCount: number; scopeId: string;
};
export function startManagedReviewer(options: { root: string; frameOrigins: string[] }): Promise<ReviewerInstance>;
export function reviewerHistory(root: string): Promise<ReviewSummary[]>;
export function importLegacyReviewer(root: string, source: string): Promise<{
  imported: number; skipped: number; source: string; workspaceReconfirmationRequired: boolean;
}>;
