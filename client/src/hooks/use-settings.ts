import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

export interface AppSettings {
  themeMode: "Light" | "Dark" | "System";
  accentColor: string;
  backgroundScene: string;
}

export const SETTINGS_QUERY_KEY = ["/api/settings"];

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 0,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AppSettings>) => {
      const res = await apiRequest("PATCH", "/api/settings", patch);
      return (await res.json()) as AppSettings;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, settings);
      queryClient.invalidateQueries({ queryKey: ["/api/player"] });
    },
  });
}
