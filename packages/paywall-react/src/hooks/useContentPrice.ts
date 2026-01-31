'use client';

/**
 * useContentPrice Hook
 * 
 * Fetch and cache content prices for display.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePaywallContext } from '../providers/PaywallProvider.js';

export interface ContentPriceState {
  /** Content price in credits (null if loading or error) */
  price: number | null;
  /** Whether the content is free (price === 0) */
  isFree: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error if price check failed */
  error: Error | null;
  /** Refetch the price */
  refetch: () => void;
}

/**
 * Fetch the price of content.
 * 
 * Caches prices to avoid redundant API calls.
 * 
 * @example
 * ```tsx
 * function TrackCard({ dtag }: { dtag: string }) {
 *   const { price, isFree, isLoading } = useContentPrice(dtag);
 *   
 *   if (isLoading) return <span>...</span>;
 *   
 *   return (
 *     <span>{isFree ? 'Free' : `${price} credits`}</span>
 *   );
 * }
 * ```
 */
export function useContentPrice(dtag: string | undefined): ContentPriceState {
  const { getContentPrice } = usePaywallContext();
  const [price, setPrice] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Simple in-memory cache (per-client instance)
  const cacheRef = useRef<Map<string, number>>(new Map());

  const fetchPrice = useCallback(async () => {
    if (!dtag) {
      setPrice(null);
      return;
    }

    // Check cache first
    const cached = cacheRef.current.get(dtag);
    if (cached !== undefined) {
      setPrice(cached);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const contentPrice = await getContentPrice(dtag);
      cacheRef.current.set(dtag, contentPrice);
      setPrice(contentPrice);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch price'));
      setPrice(null);
    } finally {
      setIsLoading(false);
    }
  }, [dtag, getContentPrice]);

  const refetch = useCallback(() => {
    if (dtag) {
      cacheRef.current.delete(dtag);
      fetchPrice();
    }
  }, [dtag, fetchPrice]);

  useEffect(() => {
    fetchPrice();
  }, [fetchPrice]);

  return {
    price,
    isFree: price === 0,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Batch fetch prices for multiple content items
 * 
 * @example
 * ```tsx
 * function TrackList({ dtags }: { dtags: string[] }) {
 *   const { prices, isLoading } = useContentPrices(dtags);
 *   
 *   return (
 *     <ul>
 *       {dtags.map(dtag => (
 *         <li key={dtag}>
 *           {dtag}: {prices[dtag] ?? '...'} credits
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useContentPrices(dtags: string[]): {
  prices: Record<string, number | null>;
  isLoading: boolean;
  errors: Record<string, Error>;
} {
  const { getContentPrice } = usePaywallContext();
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [errors, setErrors] = useState<Record<string, Error>>({});
  const [isLoading, setIsLoading] = useState(false);
  
  const cacheRef = useRef<Map<string, number>>(new Map());
  const dtagsKey = dtags.join(',');

  useEffect(() => {
    if (dtags.length === 0) return;

    const fetchAll = async () => {
      setIsLoading(true);
      
      const newPrices: Record<string, number | null> = {};
      const newErrors: Record<string, Error> = {};

      await Promise.all(
        dtags.map(async (dtag) => {
          // Check cache
          const cached = cacheRef.current.get(dtag);
          if (cached !== undefined) {
            newPrices[dtag] = cached;
            return;
          }

          try {
            const price = await getContentPrice(dtag);
            cacheRef.current.set(dtag, price);
            newPrices[dtag] = price;
          } catch (err) {
            newErrors[dtag] = err instanceof Error ? err : new Error('Failed');
            newPrices[dtag] = null;
          }
        })
      );

      setPrices(newPrices);
      setErrors(newErrors);
      setIsLoading(false);
    };

    fetchAll();
  }, [dtagsKey, getContentPrice]);

  return { prices, isLoading, errors };
}
