import { Text } from "ink";
import { theme } from "../theme-context";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";
import stringWidth from "string-width";

interface ScreenHeadingProps {
  title: string;
  subtitle?: string;
  showDivider?: boolean;
}

export const ScreenHeading = ({ title, subtitle, showDivider = true }: ScreenHeadingProps) => {
  const [columns] = useStdoutDimensions();
  const upperTitle = title.toUpperCase();
  const subtitleContent = subtitle ? ` │ ${subtitle}` : "";
  const textWidth = stringWidth(upperTitle) + stringWidth(subtitleContent);
  const lineWidth = showDivider ? Math.max(0, columns - textWidth - 3) : 0;

  return (
    <Text>
      <Text bold color={theme.text}>
        {upperTitle}
      </Text>
      {subtitle ? <Text color={theme.textMuted}>{subtitleContent}</Text> : null}
      {showDivider ? <Text color={theme.border}> {"─".repeat(lineWidth)}</Text> : null}
    </Text>
  );
};
