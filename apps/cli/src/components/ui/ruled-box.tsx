import { Box, Text, type DOMElement } from "ink";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";

interface RuledBoxProps {
  color: string;
  children: React.ReactNode;
  marginTop?: number;
  marginBottom?: number;
  paddingX?: number;
  ref?: React.Ref<DOMElement>;
}

export const RuledBox = ({
  color,
  children,
  marginTop,
  marginBottom,
  paddingX = 1,
  ref,
}: RuledBoxProps) => {
  const [columns] = useStdoutDimensions();

  return (
    <Box
      flexDirection="column"
      width="100%"
      marginTop={marginTop}
      marginBottom={marginBottom}
      ref={ref}
    >
      <Text color={color}>{"─".repeat(columns)}</Text>
      <Box flexDirection="column" paddingX={paddingX}>
        {children}
      </Box>
      <Text color={color}>{"─".repeat(columns)}</Text>
    </Box>
  );
};
