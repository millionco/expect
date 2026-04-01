import { Box, Text } from "ink";

export interface HintSegment {
  key: string;
  label: string;
  color?: string;
  cta?: boolean;
}

export const HINT_SEPARATOR = "   ";

interface HintBarProps {
  readonly segments: HintSegment[];
  readonly color: string;
  readonly mutedColor: string;
}

export const HintBar = ({ segments, color, mutedColor }: HintBarProps) => (
  <Box>
    <Text color={color}> </Text>
    {segments.map((segment, index) => (
      <Box key={segment.key + segment.label}>
        <Text color={segment.color ?? mutedColor}>{segment.label} </Text>
        <Text color={segment.color ?? mutedColor}>[{segment.key}]</Text>
        {index < segments.length - 1 && <Text color={mutedColor}>{HINT_SEPARATOR}</Text>}
      </Box>
    ))}
  </Box>
);
