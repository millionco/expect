import { useEffect, useRef } from "react";
import { Box, type DOMElement } from "ink";
import { useMouse } from "../../hooks/mouse-context";
import { LAYOUT_ORIGIN_OFFSET } from "../../constants";

interface ClickableProps {
  onClick?: () => void;
  children: React.ReactNode;
  fullWidth?: boolean;
}

const getAbsolutePosition = (node: DOMElement): { left: number; top: number } => {
  let current: DOMElement | undefined = node;
  let left = LAYOUT_ORIGIN_OFFSET;
  let top = LAYOUT_ORIGIN_OFFSET;

  while (current) {
    if (!current.yogaNode) return { left, top };
    const layout = current.yogaNode.getComputedLayout();
    left += layout.left;
    top += layout.top;
    current = current.parentNode;
  }

  return { left, top };
};

export const Clickable = ({ onClick, children, fullWidth = true }: ClickableProps) => {
  const ref = useRef<DOMElement>(null);
  const { subscribeClick } = useMouse();
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    return subscribeClick((position, action) => {
      if (action !== "press") return;
      const element = ref.current;
      if (!element?.yogaNode) return;

      const elementPosition = getAbsolutePosition(element);
      const layout = element.yogaNode.getComputedLayout();

      const isOutsideHorizontally =
        position.x < elementPosition.left || position.x >= elementPosition.left + layout.width;
      const isOutsideVertically =
        position.y < elementPosition.top || position.y >= elementPosition.top + layout.height;

      if (!isOutsideHorizontally && !isOutsideVertically) {
        onClickRef.current?.();
      }
    });
  }, [subscribeClick]);

  return (
    <Box ref={ref} width={fullWidth ? "100%" : undefined}>
      {children}
    </Box>
  );
};
