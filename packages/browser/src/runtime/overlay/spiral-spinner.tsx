// eslint-disable-next-line no-restricted-imports
import { useEffect, useRef } from "react";

const SPIRAL_R = 3;
const SPIRAL_r = 1;
const SPIRAL_d = 3;
const SPIRAL_SCALE = 6.5;
const SPIRAL_BREATH = 1.2;
const SPIRAL_DURATION_MS = 1200;
const SPIRAL_PULSE_MS = 1100;
const SPIRAL_ROTATION_MS = 7000;
const SPIRAL_PARTICLE_COUNT = 50;
const SPIRAL_TRAIL_SPAN = 0.34;

const spiralPoint = (progress: number, detailScale: number) => {
  const t = progress * Math.PI * 2;
  const d = SPIRAL_d + detailScale * 0.25;
  const diff = SPIRAL_R - SPIRAL_r;
  const ratio = diff / SPIRAL_r;
  const scale = SPIRAL_SCALE + detailScale * SPIRAL_BREATH;
  return {
    x: 50 + (diff * Math.cos(t) + d * Math.cos(ratio * t)) * scale,
    y: 50 + (diff * Math.sin(t) - d * Math.sin(ratio * t)) * scale,
  };
};

export const SpiralSpinner = ({ visible }: { visible: boolean }) => {
  const groupRef = useRef<SVGGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const particlesRef = useRef<SVGCircleElement[]>([]);
  const startedAtRef = useRef(performance.now());
  const frameIdRef = useRef<number>(0);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || particlesRef.current.length > 0) return;

    const SVG_NS = "http://www.w3.org/2000/svg";
    for (let index = 0; index < SPIRAL_PARTICLE_COUNT; index++) {
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("fill", "white");
      group.appendChild(circle);
      particlesRef.current.push(circle);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const group = groupRef.current;
    const pathEl = pathRef.current;
    const particles = particlesRef.current;
    if (!group || !pathEl || particles.length === 0) return;

    const startedAt = startedAtRef.current;

    const render = (now: number) => {
      const time = now - startedAt;
      const progress = (time % SPIRAL_DURATION_MS) / SPIRAL_DURATION_MS;
      const pulseProgress = (time % SPIRAL_PULSE_MS) / SPIRAL_PULSE_MS;
      const detailScale = 0.52 + ((Math.sin(pulseProgress * Math.PI * 2 + 0.55) + 1) / 2) * 0.48;
      const rotation = -((time % SPIRAL_ROTATION_MS) / SPIRAL_ROTATION_MS) * 360;

      group.setAttribute("transform", `rotate(${rotation} 50 50)`);

      let pathD = "";
      for (let index = 0; index <= 480; index++) {
        const pt = spiralPoint(index / 480, detailScale);
        pathD += `${index === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)} `;
      }
      pathEl.setAttribute("d", pathD);

      for (let index = 0; index < SPIRAL_PARTICLE_COUNT; index++) {
        const tailOffset = index / (SPIRAL_PARTICLE_COUNT - 1);
        const normalizedP = (((progress - tailOffset * SPIRAL_TRAIL_SPAN) % 1) + 1) % 1;
        const pt = spiralPoint(normalizedP, detailScale);
        const fade = Math.pow(1 - tailOffset, 0.56);
        particles[index].setAttribute("cx", pt.x.toFixed(1));
        particles[index].setAttribute("cy", pt.y.toFixed(1));
        particles[index].setAttribute("r", (1.2 + fade * 3.5).toFixed(1));
        particles[index].setAttribute("opacity", (0.04 + fade * 0.96).toFixed(2));
      }

      frameIdRef.current = requestAnimationFrame(render);
    };

    frameIdRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [visible]);

  return (
    <div className="w-[16px] h-[16px] shrink-0">
      <svg className="w-full h-full overflow-hidden" viewBox="0 0 100 100" fill="none">
        <g ref={groupRef}>
          <path
            ref={pathRef}
            stroke="white"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            opacity="0.15"
          />
        </g>
      </svg>
    </div>
  );
};
