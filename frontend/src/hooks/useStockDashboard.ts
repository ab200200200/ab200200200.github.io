import { useQueries, useQuery } from "@tanstack/react-query";
import { getInstitutional, getMajorHolders, getStock, getTechnical } from "../services/api";

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
  return useQueries({
    queries: [
      {
        queryKey: ["technical", stockId],
        queryFn: () => getTechnical(stockId),
        enabled: Boolean(stockId),
        staleTime: 60 * 1000,
        retry: 1
      },
      {
        queryKey: ["institutional", stockId],
        queryFn: () => getInstitutional(stockId),
        enabled: Boolean(stockId),
        staleTime: 5 * 60 * 1000,
        retry: 1
      },
      {
        queryKey: ["majorholders", stockId],
        queryFn: () => getMajorHolders(stockId),
        enabled: Boolean(stockId),
        staleTime: 60 * 60 * 1000,
        retry: 1
      }
    ]
  });
}
