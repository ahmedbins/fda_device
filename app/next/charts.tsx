"use client";

import { useState } from "react";

/*
 * Small SVG/HTML chart primitives for the workspace. Colours follow the
 * validated categorical order (dataviz reference palette) so a code keeps the
 * same hue in every view; a ninth series folds into "Other".
 */

export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const OTHER_COLOR = "#9aa3b0";

export function seriesColor(index: number) {
  return index >= 0 && index < SERIES_COLORS.length ? SERIES_COLORS[index] : OTHER_COLOR;
}

export type BarItem = { key: string; label: string; value: number; color?: string; hint?: string };

/** Horizontal bars with the value at the tip — magnitude across a handful of categories. */
export function BarList({ items, color = SERIES_COLORS[0], total, empty = "No data in this scope.", onSelect }: {
  items: BarItem[];
  color?: string;
  total?: number;
  empty?: string;
  onSelect?: (item: BarItem) => void;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  const sum = total ?? items.reduce((acc, item) => acc + item.value, 0);
  if (!items.length) return <p className="nx-chart-empty">{empty}</p>;
  return (
    <div className="nx-barlist" role="list">
      {items.map((item) => {
        const share = sum ? Math.round((item.value / sum) * 100) : 0;
        const body = (
          <>
            <span className="nx-bar-label" title={item.hint || item.label}>{item.label}</span>
            <span className="nx-bar-track"><span className="nx-bar-fill" style={{ width: `${(item.value / max) * 100}%`, background: item.color || color }} /></span>
            <span className="nx-bar-value">{item.value.toLocaleString()}</span>
          </>
        );
        const title = `${item.label}: ${item.value.toLocaleString()} (${share}%)`;
        return onSelect ? (
          <button key={item.key} type="button" className="nx-bar-row" role="listitem" title={title} onClick={() => onSelect(item)}>{body}</button>
        ) : (
          <div key={item.key} className="nx-bar-row" role="listitem" title={title}>{body}</div>
        );
      })}
    </div>
  );
}

export type StackSeries = { key: string; label: string; color: string };
export type StackBucket = { label: string; values: Record<string, number>; total: number };

function niceStep(rough: number) {
  const power = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
  const unit = rough / power;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return nice * power;
}

function ticksFor(max: number, count = 4) {
  const step = niceStep(max / count);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top + 1e-9; value += step) ticks.push(Math.round(value));
  return ticks;
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h} Z`;
}

/** Stacked columns over ordered buckets (years) with a legend, hover tooltip and selective direct labels. */
export function StackedColumns({ buckets, series, height = 220, ariaLabel }: {
  buckets: StackBucket[];
  series: StackSeries[];
  height?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!buckets.length) return <p className="nx-chart-empty">No dated listings in this scope.</p>;
  const W = 760;
  const H = height;
  const padL = 40;
  const padR = 8;
  const padT = 14;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxTotal = Math.max(...buckets.map((bucket) => bucket.total), 1);
  const ticks = ticksFor(maxTotal);
  const yMax = ticks[ticks.length - 1];
  const slot = plotW / buckets.length;
  const barW = Math.min(24, slot * 0.68);
  const gap = 2;
  const y = (value: number) => padT + plotH - (value / yMax) * plotH;
  const labelEvery = buckets.length > 14 ? Math.ceil(buckets.length / 12) : 1;
  const maxIndex = buckets.findIndex((bucket) => bucket.total === maxTotal);
  const hovered = hover === null ? null : buckets[hover];

  return (
    <div className="nx-stack">
      <div className="nx-legend" aria-label="Series">
        {series.map((entry) => <span key={entry.key}><i style={{ background: entry.color }} />{entry.label}</span>)}
      </div>
      <div className="nx-stack-plot" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={padL} x2={W - padR} y1={y(tick)} y2={y(tick)} className="nx-grid" />
              <text x={padL - 6} y={y(tick) + 3} className="nx-tick" textAnchor="end">{tick.toLocaleString()}</text>
            </g>
          ))}
          {buckets.map((bucket, index) => {
            const x = padL + index * slot + (slot - barW) / 2;
            const segments = series.filter((entry) => (bucket.values[entry.key] || 0) > 0);
            let cursor = 0;
            return (
              <g key={bucket.label} className={hover === index ? "hot" : ""} onMouseEnter={() => setHover(index)}>
                <rect x={padL + index * slot} y={padT} width={slot} height={plotH} fill="transparent" />
                {segments.map((entry, segmentIndex) => {
                  const value = bucket.values[entry.key] || 0;
                  const top = y(cursor + value);
                  const bottom = y(cursor);
                  cursor += value;
                  const isTop = segmentIndex === segments.length - 1;
                  const inset = isTop ? 0 : gap;
                  const segmentHeight = Math.max(bottom - top - inset, 0.75);
                  return isTop
                    ? <path key={entry.key} d={roundedTop(x, top, barW, segmentHeight, 4)} fill={entry.color} />
                    : <rect key={entry.key} x={x} y={top + inset} width={barW} height={segmentHeight} fill={entry.color} />;
                })}
                {index % labelEvery === 0 && <text x={x + barW / 2} y={H - 7} className="nx-tick" textAnchor="middle">{bucket.label}</text>}
                {bucket.total > 0 && (hover === index || index === maxIndex) && (
                  <text x={x + barW / 2} y={y(bucket.total) - 5} className="nx-value" textAnchor="middle">{bucket.total.toLocaleString()}</text>
                )}
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div className="nx-chart-tip" style={{ left: `${((padL + (hover as number) * slot + slot / 2) / W) * 100}%` }}>
            <b>{hovered.label} · {hovered.total.toLocaleString()}</b>
            {series.filter((entry) => hovered.values[entry.key]).map((entry) => (
              <span key={entry.key}><i style={{ background: entry.color }} />{entry.label}<em>{hovered.values[entry.key].toLocaleString()}</em></span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
