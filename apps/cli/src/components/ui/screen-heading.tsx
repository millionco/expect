import { Text } from "ink";
import { useThemeContext } from "../theme-context";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";
import stringWidth from "string-width";

interface ScreenHeadingProps {
  title: string;
  subtitle?: string;
}

export const ScreenHeading = ({ title, subtitle }: ScreenHeadingProps) => {
  const [columns] = useStdoutDimensions();
  const { theme } = useThemeContext();

  const upperTitle = title.toUpperCase();
  const subtitleContent = subtitle ? ` │ ${subtitle}` : "";
  const textWidth = stringWidth(upperTitle) + stringWidth(subtitleContent);
  const lineWidth = Math.max(0, columns - textWidth - 3);

  return (
    <Text>
      <Text bold color={theme.text}>
        {upperTitle}
      </Text>
      {subtitle ? <Text color={theme.textMuted}>{subtitleContent}</Text> : null}
      <Text color={theme.border}> {"─".repeat(lineWidth)}</Text>
    </Text>
  );
};
