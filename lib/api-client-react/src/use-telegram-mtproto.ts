/**
 * Custom (non-generated) hooks for the MTProto connect flow and stats.
 * Lives outside generated/ so codegen runs never overwrite it — same
 * reasoning as use-telegram-stats-history.ts.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { HistoryPeriod } from "./use-telegram-stats-history";

// --- status --------------------------------------------------------------

export type MtprotoStatus = {
  connected: boolean;
  status?: string;
  connectedAt?: string | null;
};

const mtprotoStatusQueryKey = ["/api/telegram-mtproto/status"] as const;

export function useGetTelegramMtprotoStatus(options?: { refetchInterval?: number }) {
  return useQuery<MtprotoStatus>({
    queryKey: mtprotoStatusQueryKey,
    queryFn: ({ signal }) =>
      customFetch<MtprotoStatus>("/api/telegram-mtproto/status", { method: "GET", signal }),
    refetchInterval: options?.refetchInterval,
  });
}

// --- auth flow -------------------------------------------------------------

export type CodeDeliveryMethod = "app" | "sms" | "call" | "flash_call" | "other";

export function useTelegramMtprotoSendCode() {
  return useMutation<
    { pendingId: number; deliveryMethod: CodeDeliveryMethod },
    Error,
    { phoneNumber: string }
  >({
    mutationFn: (data) =>
      customFetch("/api/telegram-mtproto/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useTelegramMtprotoResendCode() {
  return useMutation<
    { deliveryMethod: CodeDeliveryMethod },
    Error,
    { pendingId: number; phoneNumber: string }
  >({
    mutationFn: (data) =>
      customFetch("/api/telegram-mtproto/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useTelegramMtprotoVerifyCode() {
  return useMutation<
    { status: "authenticated" | "needs_password" },
    Error,
    { pendingId: number; phoneNumber: string; code: string }
  >({
    mutationFn: (data) =>
      customFetch("/api/telegram-mtproto/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useTelegramMtprotoVerifyPassword() {
  return useMutation<
    { status: "authenticated" },
    Error,
    { pendingId: number; password: string }
  >({
    mutationFn: (data) =>
      customFetch("/api/telegram-mtproto/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useTelegramMtprotoLogout() {
  const queryClient = useQueryClient();
  return useMutation<{ status: "revoked" }, Error, void>({
    mutationFn: () => customFetch("/api/telegram-mtproto/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mtprotoStatusQueryKey });
    },
  });
}

// --- channel discovery -----------------------------------------------------

export type DiscoveredMtprotoChannel = {
  id: string;
  title: string;
  username: string | null;
  membersCount: number | null;
  isCreator: boolean;
};

export function useListTelegramMtprotoChannels(options?: { enabled?: boolean }) {
  return useQuery<{ channels: DiscoveredMtprotoChannel[] }>({
    queryKey: ["/api/telegram-mtproto/channels"] as const,
    queryFn: ({ signal }) =>
      customFetch("/api/telegram-mtproto/channels", { method: "GET", signal }),
    enabled: options?.enabled ?? true,
  });
}

// --- live stats + history (the real "views" source, see stats.ts) --------

export type MtprotoChannelLiveStats = {
  // null for a channel the MTProto account administers but that isn't
  // connected through the bot flow — see stats.ts for why.
  channelRowId: number | null;
  channelTitle: string;
  subscribers: number | null;
  views: number | null;
};

export type MtprotoLiveStats = {
  totalSubscribers: number;
  totalViews: number;
  channels: MtprotoChannelLiveStats[];
  generatedAt: string;
};

export function useGetTelegramMtprotoLiveStats(options?: {
  enabled?: boolean;
  refetchInterval?: number;
}) {
  return useQuery<MtprotoLiveStats>({
    queryKey: ["/api/telegram-mtproto/stats/live"] as const,
    queryFn: ({ signal }) =>
      customFetch("/api/telegram-mtproto/stats/live", { method: "GET", signal }),
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
    retry: false, // 409 (not connected) shouldn't retry-storm
  });
}

export type MtprotoHistoryPoint = { date: string; subscribers: number; views: number };

export function useGetTelegramMtprotoStatsHistory(
  period: HistoryPeriod,
  options?: { enabled?: boolean; refetchInterval?: number },
) {
  return useQuery<{ snapshots: MtprotoHistoryPoint[] }>({
    queryKey: ["/api/telegram-mtproto/stats/history", period] as const,
    queryFn: ({ signal }) =>
      customFetch(`/api/telegram-mtproto/stats/history?period=${period}`, {
        method: "GET",
        signal,
      }),
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
  });
}
