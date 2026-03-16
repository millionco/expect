import { Box, Text } from "ink";
import { Clickable } from "./clickable.js";

export interface HintSegment {
  key: string;
  label: string;
  onClick?: () => void;
  color?: string;
  cta?: boolean;
}

export const HINT_SEPARATOR = "   ";

interface HintBarProps {
  readonly segments: HintSegment[];
  readonly color: string;
  readonly mutedColor: string;
}

const HintContent = ({
  segment,
  color,
  mutedColor,
}: {
  segment: HintSegment;
  color: string;
  mutedColor: string;
}) => (
  <>
    <Text color={segment.color ?? mutedColor}>{segment.label} </Text>
    <Text color={segment.color ?? color} bold>
      [{segment.key}]
    </Text>
  </>
);

export const HintBar = ({ segments, color, mutedColor }: HintBarProps) => (
  <Box>
    <Text color={color}> </Text>
    {segments.map((segment, index) => (
      <Box key={segment.key + segment.label}>
        {segment.onClick ? (
          <Clickable fullWidth={false} onClick={segment.onClick}>
            <HintContent segment={segment} color={color} mutedColor={mutedColor} />
          </Clickable>
        ) : (
          <HintContent segment={segment} color={color} mutedColor={mutedColor} />
        )}
        {index < segments.length - 1 && <Text color={mutedColor}>{HINT_SEPARATOR}</Text>}
      </Box>
    ))}
  </Box>
);
