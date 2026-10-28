import React from 'react';

const STYLES = {
  Low: 'bg-green-100 text-green-800 ring-green-600/20',
  Medium: 'bg-yellow-100 text-yellow-800 ring-yellow-600/20',
  High: 'bg-orange-100 text-orange-800 ring-orange-600/20',
  Critical: 'bg-red-100 text-red-800 ring-red-600/20',
};

const DOTS = {
  Low: 'bg-severity-low',
  Medium: 'bg-severity-medium',
  High: 'bg-severity-high',
  Critical: 'bg-severity-critical',
};

export default function SeverityBadge({ level = 'Low', score, size = 'md' }) {
  const key = STYLES[level] ? level : 'Low';
  const sizeClass =
    size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ${STYLES[key]} ${sizeClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[key]}`} />
      {level}
      {score != null && !Number.isNaN(Number(score)) && (
        <span className="font-medium opacity-80">· {Number(score).toFixed(1)}</span>
      )}
    </span>
  );
}
