'use client';

import { useEffect, useRef, useState } from 'react';

type AngleSample = { a1: number; a2: number; a3: number; mark?: boolean };

function mapY(v: number, height: number): number {
  const clamped = Math.max(-180, Math.min(180, v));
  // -180 -> height, +180 -> 0
  return height - ((clamped + 180) / 360) * height;
}

function buildPath(
  samples: AngleSample[],
  selector: (s: AngleSample) => number,
  width: number,
  height: number,
): string {
  if (!samples.length) return '';
  const n = samples.length;
  const step = n > 1 ? width / (n - 1) : 0;
  let d = '';
  for (let i = 0; i < n; i += 1) {
    const x = i * step;
    const y = mapY(selector(samples[i]), height);
    d += i === 0 ? `M ${x},${y}` : ` L ${x},${y}`;
  }
  return d;
}

export default function ServoChart({
  current,
  width = 800,
  height = 160,
}: {
  current: AngleSample[];
  width?: number;
  height?: number;
}) {
  const gridYs = [-180, -90, 0, 90, 180];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(width);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => setMeasuredWidth(el.clientWidth || width);
    apply();
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => apply());
      ro.observe(el);
    } catch {
      window.addEventListener('resize', apply);
    }
    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', apply);
    };
  }, [width]);
  return (
    <div ref={containerRef} className="w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${measuredWidth} ${height}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      >
        {/* Background */}
        <rect x={0} y={0} width={measuredWidth} height={height} fill="#ddd" />

        {/* Grid lines */}
        {gridYs.map((val, idx) => {
          const y = mapY(val, height);
          return (
            <g key={`grid-${idx}`}>
              <line x1={0} y1={y} x2={measuredWidth} y2={y} stroke="#aaf" strokeWidth={1} />
              <text x={4} y={y - 2} fontSize={10} fill="#666">
                {val}
              </text>
            </g>
          );
        })}

        {/* Single series paths (last 200 sampled points provided by parent) */}
        <path
          d={buildPath(current, (s) => s.a1, measuredWidth, height)}
          stroke="#ff5722"
          strokeWidth={2}
          fill="none"
        />
        <path
          d={buildPath(current, (s) => s.a2, measuredWidth, height)}
          stroke="#2196f3"
          strokeWidth={2}
          fill="none"
        />
        <path
          d={buildPath(current, (s) => s.a3, measuredWidth, height)}
          stroke="#4caf50"
          strokeWidth={2}
          fill="none"
        />
        {/* Vertical markers inline with samples */}
        {current.map((s, i) => {
          if (!s.mark) return null;
          const step = current.length > 1 ? measuredWidth / (current.length - 1) : 0;
          const x = i * step;
          return (
            <line
              key={`mk-${i}`}
              x1={x}
              y1={0}
              x2={x}
              y2={height}
              stroke="#999"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          );
        })}
      </svg>
    </div>
  );
}
