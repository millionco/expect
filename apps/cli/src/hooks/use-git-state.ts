import { useQuery } from "@tanstack/react-query";
import { getGitState } from "@browser-tester/supervisor";

export const useGitState = () =>
  useQuery({
    queryKey: ["git-state"],
    queryFn: () => getGitState(),
  });
