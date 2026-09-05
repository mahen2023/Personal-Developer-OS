'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectGraph as GraphData } from '@/lib/types';
import { cx } from '@/lib/format';
import { humanise } from '@/lib/domain';

/**
 * The context graph (§11, §73).
 *
 * Layout is layered and deterministic rather than force-directed: the same
 * project always draws the same picture, so it can be read as a diagram
 * instead of re-learned every visit. It also removes the need for a physics
 * library and the jitter that comes with one.
 */
const LAYERS: string[][] = [
  ['PROJECT'],
  ['ENVIRONMENT', 'REPOSITORY'],
  ['SERVER', 'DATABASE', 'DOMAIN'],
  ['SSL_CERTIFICATE', 'DEPLOYMENT'],
  ['NOTE', 'SOLUTION', 'TASK', 'DOCUMENT', 'ADR'],
];

const TYPE_COLOR: Record<string, string> = {
  PROJECT: 'var(--accent)',
  ENVIRONMENT: 'var(--info)',
  REPOSITORY: 'var(--info)',
  SERVER: 'var(--success)',
  DATABASE: 'var(--success)',
  DOMAIN: 'var(--security)',
  SSL_CERTIFICATE: 'var(--security)',
  DEPLOYMENT: 'var(--warning)',
};

const NODE_WIDTH = 116;
const NODE_HEIGHT = 30;
const COLUMN_GAP = 18;
const ROW_GAP = 62;
const PADDING = 20;

interface Placed {
  id: string;
  type: string;
  label: string;
  detail?: string;
  x: number;
  y: number;
}

export function ProjectGraph({ data, height = 460 }: { data: GraphData; height?: number }) {
  const router = useRouter();
  const [focus, setFocus] = useState<string | null>(null);

  const { nodes, width, totalHeight } = useMemo(() => layout(data), [data]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  // Everything one hop from the hovered node stays lit; the rest recedes.
  const neighbours = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const edge of data.edges) {
      if (edge.from === focus) set.add(edge.to);
      if (edge.to === focus) set.add(edge.from);
    }
    return set;
  }, [focus, data.edges]);

  if (nodes.length <= 1) {
    return (
      <p className="px-4 py-8 text-center text-[12.5px] text-[var(--text-faint)]">
        Connect a repository, server or environment to this project and the graph appears here.
      </p>
    );
  }

  return (
    <div className="overflow-auto" style={{ maxHeight: height }}>
      <svg
        width={width}
        height={totalHeight}
        viewBox={`0 0 ${width} ${totalHeight}`}
        role="img"
        aria-label="Project relationship graph"
        className="min-w-full"
      >
        <g>
          {data.edges.map((edge, index) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return null;
            const lit = !neighbours || (neighbours.has(edge.from) && neighbours.has(edge.to));
            return (
              <path
                key={`${edge.from}-${edge.to}-${index}`}
                d={curve(from, to)}
                fill="none"
                stroke={lit ? 'var(--line-strong)' : 'var(--line)'}
                strokeWidth={lit ? 1.2 : 0.8}
                opacity={neighbours && !lit ? 0.3 : 1}
                className="transition-opacity duration-[var(--fast)]"
              />
            );
          })}
        </g>

        <g>
          {nodes.map((node) => {
            const lit = !neighbours || neighbours.has(node.id);
            const color = TYPE_COLOR[node.type] ?? 'var(--text-faint)';
            return (
              <g
                key={node.id}
                transform={`translate(${node.x - NODE_WIDTH / 2}, ${node.y - NODE_HEIGHT / 2})`}
                onMouseEnter={() => setFocus(node.id)}
                onMouseLeave={() => setFocus(null)}
                onClick={() => node.type !== 'PROJECT' && router.push(hrefFor(node))}
                className={cx(
                  'transition-opacity duration-[var(--fast)]',
                  node.type !== 'PROJECT' && 'cursor-pointer',
                )}
                opacity={lit ? 1 : 0.32}
              >
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={4}
                  fill="var(--surface-raised)"
                  stroke={focus === node.id ? color : 'var(--line)'}
                  strokeWidth={focus === node.id ? 1.4 : 1}
                />
                {/* A colour bar rather than a filled node — the label stays readable. */}
                <rect x={0} y={0} width={2.5} height={NODE_HEIGHT} rx={1} fill={color} />
                <text
                  x={9}
                  y={12}
                  fontSize={7.5}
                  letterSpacing={0.8}
                  fill="var(--text-faint)"
                  className="uppercase"
                >
                  {humanise(node.type)}
                </text>
                <text x={9} y={23} fontSize={10.5} fill="var(--text)">
                  {truncate(node.label, 16)}
                </text>
                <title>
                  {humanise(node.type)}: {node.label}
                  {node.detail ? ` (${node.detail})` : ''}
                </title>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function layout(data: GraphData): { nodes: Placed[]; width: number; totalHeight: number } {
  const rows: { type: string; nodes: GraphData['nodes'] }[] = [];

  for (const layer of LAYERS) {
    const inLayer = data.nodes.filter((node) => layer.includes(node.type));
    // One row per type, so like sits with like and the eye can scan across.
    for (const type of layer) {
      const ofType = inLayer.filter((node) => node.type === type);
      if (ofType.length > 0) rows.push({ type, nodes: ofType });
    }
  }

  const widest = Math.max(...rows.map((row) => row.nodes.length), 1);
  const width = Math.max(560, widest * NODE_WIDTH + (widest - 1) * COLUMN_GAP + PADDING * 2);

  const nodes: Placed[] = [];
  rows.forEach((row, rowIndex) => {
    const rowWidth = row.nodes.length * NODE_WIDTH + (row.nodes.length - 1) * COLUMN_GAP;
    const startX = (width - rowWidth) / 2 + NODE_WIDTH / 2;
    row.nodes.forEach((node, index) => {
      nodes.push({
        ...node,
        x: startX + index * (NODE_WIDTH + COLUMN_GAP),
        y: PADDING + NODE_HEIGHT / 2 + rowIndex * ROW_GAP,
      });
    });
  });

  return { nodes, width, totalHeight: PADDING * 2 + rows.length * ROW_GAP };
}

/** A vertical bezier, so crossing edges stay distinguishable. */
function curve(from: Placed, to: Placed): string {
  const midY = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

const PATHS: Record<string, string> = {
  ENVIRONMENT: '/environments',
  REPOSITORY: '/repositories',
  SERVER: '/servers',
  DATABASE: '/databases',
  DOMAIN: '/domains',
  SSL_CERTIFICATE: '/certificates',
  DEPLOYMENT: '/deployments',
  NOTE: '/notes',
  SOLUTION: '/solutions',
  TASK: '/tasks',
  DOCUMENT: '/documents',
  ADR: '/adrs',
};

function hrefFor(node: Placed): string {
  return `${PATHS[node.type] ?? '/'}/${node.id}`;
}
