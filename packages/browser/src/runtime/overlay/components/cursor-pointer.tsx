export const PointerCursor = () => (
  <svg
    width="64"
    height="64"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="absolute top-0 left-0"
  >
    <g filter="url(#filter0_d_4_7)">
      <path
        d="M2.58591 2.58594C3.14041 2.03143 3.96783 1.85171 4.70212 2.12695L15.7021 6.25195C16.5219 6.55937 17.0468 7.36516 16.997 8.23926C16.9471 9.11309 16.3344 9.85306 15.4853 10.0654L11.1484 11.1484L10.0654 15.4854C9.85303 16.3345 9.11306 16.9471 8.23923 16.9971C7.36513 17.0469 6.55934 16.5219 6.25192 15.7021L2.12692 4.70215C1.85168 3.96786 2.0314 3.14045 2.58591 2.58594Z"
        fill="url(#borderGradient)"
        stroke="url(#borderGradient)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </g>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M4.17558 3.53185C3.99199 3.463 3.7851 3.50782 3.64646 3.64646C3.50782 3.7851 3.463 3.99199 3.53185 4.17558L7.65685 15.1756C7.7337 15.3805 7.93492 15.5117 8.15345 15.4992C8.37197 15.4868 8.557 15.3336 8.61009 15.1213L9.91232 9.91232L15.1213 8.61009C15.3336 8.557 15.4868 8.37197 15.4992 8.15345C15.5117 7.93492 15.3805 7.7337 15.1756 7.65685L4.17558 3.53185Z"
      fill="#000"
      stroke="#000"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
    <defs>
      <linearGradient
        id="borderGradient"
        x1="0"
        y1="0"
        x2="18"
        y2="18"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor="#1e7ae8" />
        <stop offset="35%" stopColor="#1e7ae8" />
        <stop offset="45%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#1e7ae8" />
        <stop offset="100%" stopColor="#1e7ae8" />
        <animateTransform
          attributeName="gradientTransform"
          type="rotate"
          from="0 9 9"
          to="360 9 9"
          dur="2.5s"
          repeatCount="indefinite"
        />
      </linearGradient>
      <filter
        id="filter0_d_4_7"
        x="-0.000274658"
        y="-0.000244141"
        width="19.0005"
        height="19.0006"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset />
        <feGaussianBlur stdDeviation="1" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.22 0" />
        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_4_7" />
        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_4_7" result="shape" />
      </filter>
    </defs>
  </svg>
);
