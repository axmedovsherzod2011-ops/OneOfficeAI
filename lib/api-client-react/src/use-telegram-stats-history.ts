/**
 * Custom (non-generated) hook for the subscriber history endpoint.
 * Lives outside generated/ so codegen runs never overwrite it.
 */
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type SubscriberSnapshot = {
  date: string;      // "YYYY-MM-DD"
  subscribers: number;
};

export type TelegramStatsHistory = {
  snapshots: SubscriberSnapshot[];
};

export type HistoryPeriod = "hourly" | "daily" | "weekly" | "monthly";

export function useGetTelegramStatsHistory(
  period: HistoryPeriod,
  options?: { enabled?: boolean; refetchInterval?: number },
) {
  return useQuery<TelegramStatsHistory>({
    queryKey: ["/api/connectors/telegram/stats/history", period] as const,
    queryFn: ({ signal }) =>
      customFetch<TelegramStatsHistory>(
        `/api/connectors/telegram/stats/history?period=${period}`,
        { method: "GET", signal },
      ),
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
  });
}
