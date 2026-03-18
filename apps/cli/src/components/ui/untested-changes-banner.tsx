import figures from "figures";
import { Text } from "ink";
import { useGitState } from "../../hooks/use-git-state.js";
import { useColors } from "../theme-context.js";
import { RuledBox } from "./ruled-box.js";

export const UntestedChangesBanner = () => {
  const COLORS = useColors();
  const { data: gitState } = useGitState();

  if (!gitState?.isGitRepo) return null;

  const hasUntestedChanges = gitState.hasChangesFromMain || gitState.hasUnstagedChanges;

  if (!hasUntestedChanges) return null;

  const fileCount = gitState.fileStats.length;
  const changedLines = gitState.fileStats.reduce((sum, stat) => sum + stat.added + stat.removed, 0);

  const headline =
    changedLines > 0
      ? `${changedLines} changed line${changedLines === 1 ? "" : "s"} not tested`
      : "Untested changes detected";

  const detail = `${fileCount} file${fileCount === 1 ? "" : "s"} changed`;

  return (
    <RuledBox color={COLORS.YELLOW} marginBottom={1}>
      <Text color={COLORS.YELLOW} bold>
        {figures.warning} {headline}
      </Text>
      <Text color={COLORS.DIM}>{detail}</Text>
    </RuledBox>
  );
};
