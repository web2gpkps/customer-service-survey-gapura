"use client";

import { useEffect, useRef, useState } from "react";
import { KPI_TARGET, categorize, formatIndex } from "@/lib/scoring";
import { CardHeader, formatDate } from "./ui";

interface Point {
  week: string;
  respondents: number;
  index: number | null;
}

const PAD = { top: 16, right: 16, bottom: 30, left: 36 };

export function TrendChart({ points }: { points: Point[] }) {
  return (
    <section className="card flex h-full flex-col">
      <CardHeader
        eyebrow="Tren"
        title="Index per minggu"
        description="Satu titik mewakili satu minggu (Senin sampai Minggu), dihitung dari tanggal pengisian survei."
      />
      <div className="flex-1 px-3 pt-4 pb-3 sm:px-4">
        <TrendPlot points={points} />
      </div>
    </section>
  );
}

export function TrendPlot({ points, height = 260 }: { points: Point[]; height?: number }) {
  const H = height;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = points.filter((p) => p.index !== null) as (Point & { index: number })[];
  const lo = Math.max(1, Math.min(3, Math.floor(Math.min(...data.map((d) => d.index)))));
  const step = 5 - lo > 2 ? 1 : 0.5;
  const ticks: number[] = [];
  for (let t = lo; t <= 5.001; t += step) ticks.push(t);

  const iw = Math.max(0, width - PAD.left - PAD.right);
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (5 - lo)) * ih;
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.index).toFixed(1)}`).join(" ");
  const active = hover !== null ? data[hover] : null;

  return (
    <>
        {data.length < 2 ? (
          <p style={{ height: H }} className="grid place-items-center text-center text-sm text-muted">
            Grafik ini muncul setelah ada data dari minimal dua minggu.
          </p>
        ) : (
          <div ref={ref} className="relative min-w-0 overflow-hidden" onMouseLeave={() => setHover(null)}>
            {width > 0 && (
              <svg width={width} height={H} role="img" aria-label="Grafik tren index kepuasan mingguan">
                {ticks.map((t) => (
                  <g key={t}>
                    <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="#e2e0d8" />
                    <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="num fill-muted font-mono text-[10.5px]">
                      {(step === 1 ? t.toFixed(0) : t.toFixed(1)).replace(".", ",")}
                    </text>
                  </g>
                ))}
                {/* Garis standar KPI */}
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(KPI_TARGET)}
                  y2={y(KPI_TARGET)}
                  stroke="#15191d"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
                <text
                  x={PAD.left + 6}
                  y={y(KPI_TARGET) - 6}
                  textAnchor="start"
                  className="fill-ink font-mono text-[10.5px] font-semibold"
                >
                  KPI 4,50
                </text>

                <path d={path} fill="none" stroke="#0d7a4d" strokeWidth={2.25} strokeLinejoin="round" />
                {hover !== null && (
                  <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="#c9c6bb" />
                )}
                {data.map((d, i) => {
                  const met = categorize(d.index)?.tone === "good";
                  return (
                    <circle
                      key={d.week}
                      cx={x(i)}
                      cy={y(d.index)}
                      r={hover === i ? 6 : 4.5}
                      fill={met ? "#0d7a4d" : "#ffffff"}
                      stroke="#0d7a4d"
                      strokeWidth={2}
                    />
                  );
                })}
                {data.map((d, i) => (
                  <text
                    key={d.week}
                    x={x(i)}
                    y={H - 8}
                    textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                    className="fill-muted font-mono text-[10.5px]"
                  >
                    {formatDate(d.week).replace(/ \d{4}$/, "")}
                  </text>
                ))}
                {/* Area hover */}
                {data.map((d, i) => {
                  const left = i === 0 ? PAD.left : (x(i - 1) + x(i)) / 2;
                  const right = i === data.length - 1 ? width - PAD.right : (x(i) + x(i + 1)) / 2;
                  return (
                    <rect
                      key={d.week}
                      x={left}
                      y={PAD.top}
                      width={Math.max(0, right - left)}
                      height={ih}
                      fill="transparent"
                      onMouseEnter={() => setHover(i)}
                      onTouchStart={() => setHover(i)}
                    />
                  );
                })}
              </svg>
            )}
            {active && hover !== null && (
              <div
                className="pointer-events-none absolute z-10 w-max -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg"
                style={{
                  left: Math.min(Math.max(x(hover), 80), width - 80),
                  top: Math.max(0, y(active.index) - 70),
                }}
              >
                <p className="font-semibold">Minggu {formatDate(active.week)}</p>
                <p className="num mt-0.5">
                  Index <b className="text-sm">{formatIndex(active.index)}</b> · {active.respondents} respons
                </p>
              </div>
            )}
          </div>
        )}
        {data.length >= 2 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-brand" aria-hidden /> Mencapai 4,50
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border-2 border-brand bg-card" aria-hidden /> Di bawah 4,50
            </span>
          </div>
        )}
    </>
  );
}
