import React, { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import SeverityBadge from './SeverityBadge';
import { resolveImageUrl } from '../services/api';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  SEVERITY_MARKER_HEX,
  formatIssueType,
  formatPercent,
} from '../utils/constants';

// Fix default marker icons broken by webpack bundling
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function severityIcon(level) {
  const color = SEVERITY_MARKER_HEX[level] || SEVERITY_MARKER_HEX.Low;
  return L.divIcon({
    className: 'severity-marker',
    html: `<div style="
      width:18px;height:18px;border-radius:50%;
      background:${color};border:2px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,.35);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds.pad(0.15));
  }, [map, points]);
  return null;
}

function ClickPicker({ onPick, enabled }) {
  useMapEvents({
    click(e) {
      if (!enabled || !onPick) return;
      onPick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

/**
 * Interactive Leaflet map.
 * @param {Array} inspections – inspection documents with GeoJSON location
 * @param {Function} onAssign – (inspection) => void – open assign modal
 * @param {[lat,lng]} pickPosition – optional selected pin for upload flow
 * @param {Function} onPickPosition – optional click-to-pin callback
 * @param {boolean} pickMode – enable click-to-select coordinates
 */
export default function GISMap({
  inspections = [],
  onAssign,
  pickPosition,
  onPickPosition,
  pickMode = false,
  height = '100%',
  className = '',
  showPopups = true,
  center = DEFAULT_MAP_CENTER,
  zoom = DEFAULT_MAP_ZOOM,
}) {
  const markers = useMemo(() => {
    return inspections
      .map((item) => {
        const coords = item.location?.coordinates;
        if (!coords || coords.length < 2) return null;
        const [lng, lat] = coords;
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
        return { item, lat, lng };
      })
      .filter(Boolean);
  }, [inspections]);

  const fitPoints = useMemo(() => {
    if (pickMode && pickPosition) return [pickPosition];
    return markers.map((m) => [m.lat, m.lng]);
  }, [markers, pickMode, pickPosition]);

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 ${className}`} style={{ height }}>
      <MapContainer
        center={pickPosition || center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={fitPoints} />
        <ClickPicker enabled={pickMode} onPick={onPickPosition} />

        {pickMode && pickPosition && (
          <Marker position={pickPosition} />
        )}

        {!pickMode &&
          markers.map(({ item, lat, lng }) => (
            <Marker
              key={item._id}
              position={[lat, lng]}
              icon={severityIcon(item.severityLevel)}
            >
              {showPopups && (
                <Popup maxWidth={280} minWidth={220}>
                  <div className="space-y-2 text-sm">
                    {item.imageUrl && (
                      <img
                        src={resolveImageUrl(item.imageUrl)}
                        alt={formatIssueType(item.issueType)}
                        className="h-28 w-full rounded-md object-cover"
                      />
                    )}
                    <div className="font-semibold text-navy-900">
                      {formatIssueType(item.issueType)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge level={item.severityLevel} score={item.severityScore} size="sm" />
                      <span className="text-xs text-slate-500">
                        Conf {formatPercent(item.detectionConfidence)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-600">
                      <span>Status</span>
                      <span className="font-medium text-navy-800">{item.maintenanceStatus}</span>
                      <span>Ward</span>
                      <span className="font-medium text-navy-800">{item.ward}</span>
                      <span>Team</span>
                      <span className="font-medium text-navy-800">
                        {item.assignedTeam || 'Unassigned'}
                      </span>
                    </div>
                    {onAssign && item.maintenanceStatus !== 'Resolved' && (
                      <button
                        type="button"
                        className="btn-primary mt-1 w-full !py-2 text-xs"
                        onClick={() => onAssign(item)}
                      >
                        Assign Task
                      </button>
                    )}
                  </div>
                </Popup>
              )}
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
