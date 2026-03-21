import figures from "figures";
import { Text } from "ink";
import { categorizeChangedFiles, formatFileCategories } from "@browser-tester/supervisor";
import { useGitState } from "../../hooks/use-git-state.js";
import { useColors } from "../theme-context.js";
import { RuledBox } from "./ruled-box.js";

export const UntestedChangesBanner = () => {
  const COLORS = useColors();
  const { data: gitState } = useGitState();

  if (!gitState?.isGitRepo) return null;

  if (!gitState.hasUntestedChanges) return null;

  if (gitState.isCurrentStateTested) return null;

  const fileCount = gitState.fileStats.length;
  const changedLines = gitState.totalChangedLines;

  const headline =
    changedLines > 0
      ? `${changedLines} changed line${changedLines === 1 ? "" : "s"} not tested`
      : "Untested changes detected";

  const filePaths = gitState.fileStats.map((stat) => stat.relativePath);
  const summary = categorizeChangedFiles(filePaths);
  const categoryText =
    summary.categories.length > 0
      ? `${formatFileCategories(summary.categories)} across ${fileCount} file${fileCount === 1 ? "" : "s"}`
      : `${fileCount} file${fileCount === 1 ? "" : "s"} changed`;

  return (
    <RuledBox color={COLORS.YELLOW} marginBottom={1}>
      <Text color={COLORS.YELLOW} bold>
        {figures.warning} {headline}
      </Text>
      <Text color={COLORS.DIM}>{categoryText}</Text>
    </RuledBox>
  );
};
