import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Free-text instruments other bands use, for the picker. Optional: without a session (onboarding
 * a new account) or on any error, the picker just has no suggestions.
 */
export const instrumentSuggestionsQuery = queryOptions({
  queryKey: ["instruments", "suggestions"],
  queryFn: async () => {
    const res = await api.instruments.suggestions.$get();
    return res.ok ? (await res.json()).labels : [];
  },
  retry: false,
});
