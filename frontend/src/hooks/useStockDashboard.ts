import { useQuery } from "@tanstack/react-query";
import { getDashboard, getStock } from "../services/api";

export function useStockSummary(stockId: string) {
  return useQuery({
    queryKey: ["stock", stockId],
    queryFn: () => getStock(stockId),
    enabled: Boolean(stockId),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1
  });
}

export function useStockDashboard(stockId: string) {
  return useQuery({
    queryKey: ["dashboard", stockId],
    queryFn: () => getDashboard(stockId),
    enabled: Boolean(stockId),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false
  });
}
