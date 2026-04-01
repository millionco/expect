import { useQuery } from "@tanstack/react-query";
import { detectNearbyProjects } from "../utils/detect-projects";

export const useDetectedProjects = () =>
  useQuery({
    queryKey: ["detected-projects"],
    queryFn: () => detectNearbyProjects(),
    staleTime: Infinity,
  });
