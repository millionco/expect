import { useQuery } from "@tanstack/react-query";
import { detectNearbyProjects } from "../utils/detect-projects";

interface DetectedProject {
  readonly name: string;
  readonly path: string;
  readonly framework: string;
  readonly defaultPort: number;
  readonly devCommand: string | undefined;
  readonly packageManager: string;
}

export const useDetectedProjects = () =>
  useQuery({
    queryKey: ["detected-projects"],
    queryFn: (): DetectedProject[] => detectNearbyProjects(),
    staleTime: Infinity,
  });
