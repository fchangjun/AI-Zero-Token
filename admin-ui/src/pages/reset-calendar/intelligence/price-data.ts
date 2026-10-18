import { useCallback, useEffect, useRef, useState } from "react";
import sourceMarket from "../../../../../sites/codex-reset/public/data/prices.json";
import { assertMarket, cacheFx, fetchFx, mergeFx, readCachedFx } from "../../../../../sites/codex-reset/public/market-data.js";
import type { PriceMarket } from "./price-types";

const PUBLISHED_PRICES = "https://fchangjun.github.io/AI-Zero-Token/data/prices.json";
const REFRESH_INTERVAL = 5 * 60_000;
const REFRESH_COOLDOWN = 60_000;

// Import the maintained JSON itself, rather than keeping an AZT-only copy.
export const INITIAL_PRICE_MARKET = assertMarket(sourceMarket);

function initialMarket(): PriceMarket {
  let fx = { ...INITIAL_PRICE_MARKET.fx, mode: "snapshot" as const } as PriceMarket["fx"];
  try {
    const cached = readCachedFx(localStorage);
    if (cached) fx = mergeFx(fx, { ...cached, mode: "cache" });
  } catch { /* Saved rates are optional. */ }
  return { ...INITIAL_PRICE_MARKET, fx };
}

export interface IntelligencePrices {
  data: PriceMarket;
  busy: boolean;
  priceError: boolean;
  fxError: boolean;
  checkedAt: number | null;
  refresh: () => Promise<void>;
}

export function useIntelligencePrices(): IntelligencePrices {
  const [data, setData] = useState(initialMarket);
  const [busy, setBusy] = useState(false);
  const [priceError, setPriceError] = useState(false);
  const [fxError, setFxError] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const request = useRef<{ controller: AbortController; sequence: number } | null>(null);
  const sequence = useRef(0);
  const lastAttempt = useRef(0);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    if (request.current || Date.now() - lastAttempt.current < REFRESH_COOLDOWN) return;
    lastAttempt.current = Date.now();
    const controller = new AbortController();
    const currentSequence = ++sequence.current;
    request.current = { controller, sequence: currentSequence };
    setBusy(true);
    const timeout = window.setTimeout(() => controller.abort(), 6000);
    const fetcher: typeof fetch = (input, options) => fetch(input, { ...options, signal: controller.signal });
    try {
      const results = await Promise.allSettled([
        fetcher(PUBLISHED_PRICES, { cache: "no-cache" }).then(async (response) => {
          if (!response.ok) throw new Error("Pricing update unavailable");
          return assertMarket(await response.json());
        }),
        fetchFx(fetcher),
      ]);
      if (!mounted.current || request.current?.sequence !== currentSequence) return;
      const [prices, rates] = results;
      setPriceError(prices.status === "rejected");
      setFxError(rates.status === "rejected");
      setData((previous) => {
        const next = prices.status === "fulfilled" && Date.parse(prices.value.datasetUpdatedAt) >= Date.parse(previous.datasetUpdatedAt)
          ? prices.value : previous;
        let fx = mergeFx(previous.fx, { ...next.fx, mode: "snapshot" });
        if (rates.status === "fulfilled") fx = mergeFx(fx, rates.value);
        try { cacheFx(localStorage, fx); } catch { /* Desktop persistence is optional. */ }
        return { ...next, fx };
      });
      setCheckedAt(Date.now());
    } finally {
      window.clearTimeout(timeout);
      if (request.current?.sequence === currentSequence) request.current = null;
      if (mounted.current && sequence.current === currentSequence) setBusy(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const resume = () => { if (!document.hidden) void refresh(); };
    const interval = window.setInterval(resume, REFRESH_INTERVAL);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      mounted.current = false;
      request.current?.controller.abort();
      request.current = null;
      lastAttempt.current = 0;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [refresh]);

  return { data, busy, priceError, fxError, checkedAt, refresh };
}
