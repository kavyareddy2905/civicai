import React from 'react';
import SeverityBadge from './SeverityBadge';
import { resolveImageUrl } from '../services/api';
import { formatIssueType, formatPercent } from '../utils/constants';

export default function InspectionCard({ inspection, onClick, actions }) {
  if (!inspection) return null;

  const coords = inspection.location?.coordinates || [];
  const lng = coords[0];
  const lat = coords[1];

  return (
    <article
      className={`card-panel flex flex-col gap-3 transition hover:border-navy-200 ${
        onClick ? 'cursor-pointer' : ''
      }`}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter') onClick();
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex gap-3">
        <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100">
          {inspection.imageUrl ? (
            <img
              src={resolveImageUrl(inspection.imageUrl)}
              alt={formatIssueType(inspection.issueType)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              No image
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-navy-900">
              {formatIssueType(inspection.issueType)}
            </h3>
            <SeverityBadge
              level={inspection.severityLevel}
              score={inspection.severityScore}
              size="sm"
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Ward {inspection.ward}
            {lat != null && lng != null && (
              <>
                {' '}
                · {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-md bg-slate-100 px-2 py-0.5">
              Conf {formatPercent(inspection.detectionConfidence)}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5">
              {inspection.maintenanceStatus || 'Detected'}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5">
              {inspection.verificationStatus || 'Pending'}
            </span>
          </div>
        </div>
      </div>
      {inspection.inspectorNotes && (
        <p className="line-clamp-2 text-xs text-slate-600">{inspection.inspectorNotes}</p>
      )}
      {actions && <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">{actions}</div>}
    </article>
  );
}
