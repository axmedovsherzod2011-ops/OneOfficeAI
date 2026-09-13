/**
 * Hooks for the cached "Professional Product Card" (one-time AI research
 * result per product — see artifacts/api-server/src/ai/productCard.ts and
 * routes/productResearch.ts). Hand-written like use-telegram-mtproto.ts,
 * outside generated/ so codegen never overwrites it.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type ProductResearchCard = {
  searchTitle?: string;
  searchKeywords?: string;
  viewHook?: string;
  buyHeadline?: string;
  buyCta?: string;
  popularNames?: string[];
  [key: string]: unknown;
};

export type ProductResearch = {
  card: ProductResearchCard;
  sources: { title: string; url: string }[];
  researchedAt: string;
};

export function useGetProductResearch(
  productId: number | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<ProductResearch>({
    queryKey: ["/api/products", productId, "research"] as const,
    queryFn: ({ signal }) =>
      customFetch(`/api/products/${productId}/research`, { method: "GET", signal }),
    enabled: (options?.enabled ?? true) && Boolean(productId),
    retry: false, // 404 (not researched yet) shouldn't retry-storm
  });
}

// The seller adjusting the AI-written copy by hand — every post generated
// afterwards reads this same cached row, so an edit here is what shows up
// next, with no re-research needed.
export function useUpdateProductResearch(productId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation<ProductResearch, Error, Partial<ProductResearchCard>>({
    mutationFn: (patch) =>
      customFetch(`/api/products/${productId}/research`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/products", productId, "research"] as const,
      });
    },
  });
}
