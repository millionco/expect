import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "linear-gradient(135deg, rgba(48,94,178,1) 0%, rgba(17,24,39,1) 100%)",
          color: "white",
          display: "flex",
          fontFamily: "IBM Plex Sans, sans-serif",
          fontSize: 34,
          fontWeight: 700,
          height: "100%",
          justifyContent: "center",
          letterSpacing: "-0.08em",
          width: "100%",
        }}
      >
        MK
      </div>
    ),
    size,
  );
}
