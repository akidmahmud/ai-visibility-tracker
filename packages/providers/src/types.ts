import type { ModelTag } from "@avt/shared";

export interface CaptureRequest {
  prompt: string;
  model: ModelTag;
  country: string;
  language: string;
  location?: string;
  wantFanout: boolean;
}

export interface Citation {
  url: string;
  title?: string;
  position: number;
  /** A Google blue link from the AI Overview check, not a page the AI cited. */
  searchResult?: boolean;
}

export interface FanoutQuery {
  query: string;
  kind: "WEB" | "MAPS" | "SITE";
  sequence: number;
}

export interface CaptureResult {
  status: "OK" | "NO_AI_RESULT";
  text: string | null; // normalized markdown
  citations: Citation[];
  fanout: FanoutQuery[];
  raw: unknown; // stored to raw storage so answers can be re-parsed later
  cost: { credits?: number; usd?: number };
  provider: string;
  latencyMs?: number;
}

export interface AnswerProvider {
  readonly name: string;
  supports(model: ModelTag): boolean;
  capture(r: CaptureRequest): Promise<CaptureResult>;
}

/** retryable=false means retrying the same provider won't help (bad input, auth, credits, engine unavailable). */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
