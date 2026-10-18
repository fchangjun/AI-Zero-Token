export type PricePlanId = "go" | "plus" | "pro100" | "pro200" | "pro500";
export type PriceChannel = "web_direct" | "app_store";
export type PriceChannelFilter = "all" | PriceChannel;

export interface PriceQuote {
  country: string;
  region: string;
  channel: PriceChannel;
  currency: string;
  amount: number;
  label: string;
  source: string;
}

export interface PricePlan {
  id: PricePlanId;
  name: string;
  usd: number;
  note: string;
  updatedAt: string;
  quotes: PriceQuote[];
}

export interface PriceFx {
  rates: Record<string, number>;
  effectiveAt: Record<string, string>;
  stale?: Record<string, boolean>;
  sources?: Record<string, string>;
  updatedAt: string;
  fetchedAt?: string;
  delaySeconds?: number;
  marketSession?: string;
  source?: string;
  sourceUrl?: string;
  mode?: "snapshot" | "stale" | "cache" | "live";
}

export interface PriceMarket {
  schemaVersion: number;
  datasetUpdatedAt: string;
  usdSource: string;
  usdVerifiedAt: string;
  plans: PricePlan[];
  fx: PriceFx;
}

export interface ConvertedPriceQuote extends PriceQuote {
  rmb: number | null;
  usdEquivalent: number | null;
  savings: number | null;
  fxUpdatedAt?: string | null;
  fxStale: boolean;
}

export type RankedPriceQuote = ConvertedPriceQuote & { rmb: number; usdEquivalent: number; savings: number };
