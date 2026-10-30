import React, { createContext, useContext, type ReactNode } from "react";
import { useWorkspaceList } from "@jordiorriols/ui/hooks";
import { useData } from "./DataProvider";

const Context = createContext<ReturnType<typeof useWorkspaceList> | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { workspaceApi } = useData();
  const value = useWorkspaceList(workspaceApi, "shiplog");
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Shiplog WorkspaceProvider is required");
  return value;
}
