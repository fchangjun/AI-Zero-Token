// The static site remains the source of pricing algorithms; these declarations
// describe that shared browser module without copying its implementation.
declare module "*sites/codex-reset/public/market-data.js" {
  export function assertMarket(data: unknown): import("./price-types").PriceMarket;
  export function assertFx(data: unknown): import("./price-types").PriceFx;
  export function mergeFx(current: import("./price-types").PriceFx, incoming: import("./price-types").PriceFx): import("./price-types").PriceFx;
  export function fetchFx(fetcher?: typeof fetch, timeout?: number): Promise<import("./price-types").PriceFx>;
  export function readCachedFx(storage: Pick<Storage, "getItem">): import("./price-types").PriceFx | null;
  export function cacheFx(storage: Pick<Storage, "setItem">, fx: import("./price-types").PriceFx): void;
}

declare module "*sites/codex-reset/public/market-utils.js" {
  export function convertQuote(quote: import("./price-types").PriceQuote, fx: import("./price-types").PriceFx, usd: number): import("./price-types").ConvertedPriceQuote;
  export function rankedRegions(plan: import("./price-types").PricePlan, fx: import("./price-types").PriceFx, channel?: import("./price-types").PriceChannelFilter): import("./price-types").RankedPriceQuote[];
  export function matchesRegion(quote: import("./price-types").PriceQuote, query?: string, country?: string): boolean;
}
