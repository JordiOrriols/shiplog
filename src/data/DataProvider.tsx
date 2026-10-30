import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { createWorkspaceApi, getAuthRedirectUrl } from "@jordiorriols/ui";
import { useSupabaseAuth } from "@jordiorriols/ui/hooks";
import { supabase, authCallback } from "./supabaseClient";
import { createShiplogRepository } from "./repository";

function useServices() {
  const auth = useSupabaseAuth(
    supabase,
    getAuthRedirectUrl("shiplog"),
    authCallback,
  );
  const signedIn = !!auth.user;
  const services = useMemo(
    () => ({
      workspaceApi: supabase && signedIn ? createWorkspaceApi(supabase) : null,
      repository:
        supabase && signedIn ? createShiplogRepository(supabase) : null,
    }),
    [signedIn],
  );
  return { ...auth, ...services };
}
const Context = createContext<ReturnType<typeof useServices> | null>(null);
export function DataProvider({ children }: { children: ReactNode }) {
  const value = useServices();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useData() {
  const value = useContext(Context);
  if (!value) throw new Error("Shiplog DataProvider is required");
  return value;
}
