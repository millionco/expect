export const CursorShadowFilter = () => (
  <defs>
    <filter
      id="expect-cs"
      x="-2"
      y="-2"
      width="36"
      height="36"
      filterUnits="userSpaceOnUse"
      colorInterpolationFilters="sRGB"
    >
      <feFlood floodOpacity="0" result="bg" />
      <feColorMatrix
        in="SourceAlpha"
        type="matrix"
        values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
        result="ha"
      />
      <feOffset />
      <feGaussianBlur stdDeviation="1" />
      <feComposite in2="ha" operator="out" />
      <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.22 0" />
      <feBlend mode="normal" in2="bg" result="ds" />
      <feBlend mode="normal" in="SourceGraphic" in2="ds" result="shape" />
    </filter>
  </defs>
);
