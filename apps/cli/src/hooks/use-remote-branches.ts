import { useQuery } from "@tanstack/react-query";
import type { RemoteBranch } from "@browser-tester/shared/models";
import { fetchRemoteBranches } from "../utils/context-options.js";

export const useRemoteBranches = () =>
  useQuery({
    queryKey: ["remote-branches"],
    queryFn: (): Promise<RemoteBranch[]> => fetchRemoteBranches(process.cwd()),
  });
