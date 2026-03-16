import figures from "figures";
import { Box, Text } from "ink";
import { useAppStore } from "../../store.js";
import { formatFileCategories } from "../../utils/categorize-changed-files.js";
import { getHealthcheckReport } from "../../utils/get-healthcheck-report.js";
import { useColors } from "../theme-context.js";

export const UntestedChangesBanner = () => {
  const COLORS = useColors();
  const gitState = useAppStore((state) => state.gitState);

  if (!gitState?.isGitRepo) return null;

  const { hasUntestedChanges, changedLines, fileCount, categories } =
    getHealthcheckReport(gitState);

  if (!hasUntestedChanges) return null;

  const headline =
    changedLines > 0
      ? `${changedLines} changed line${changedLines === 1 ? "" : "s"} not tested`
      : "Untested changes detected";

  const detail =
    categories.length > 0
      ? `${formatFileCategories(categories)} across ${fileCount} file${fileCount === 1 ? "" : "s"}`
      : `${fileCount} file${fileCount === 1 ? "" : "s"} changed`;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={COLORS.YELLOW}
      paddingX={1}
      marginBottom={1}
    >
      <Text color={COLORS.YELLOW} bold>
        {figures.warning} {headline}
      </Text>
      <Text color={COLORS.DIM}>{detail}</Text>
    </Box>
  );
};
