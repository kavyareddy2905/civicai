import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Upload,
  MapPin,
  Crosshair,
  Loader2,
  ImagePlus,
  Sparkles,
} from 'lucide-react';
import GISMap from '../components/GISMap';
import BoundingBoxCanvas from '../components/BoundingBoxCanvas';
import SeverityBadge from '../components/SeverityBadge';
import { uploadInspection, resolveImageUrl } from '../services/api';
import { DEFAULT_MAP_CENTER, formatPercent } from '../utils/constants';

export default function InspectorUpload() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [coords, setCoords] = useState(null); // [lat, lng]
  const [ward, setWard] = useState('');
  const [notes, setNotes] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onFileChange = (e) => {
    const next = e.target.files?.[0];
    if (!next) return;
    if (!next.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    setFile(next);
    setResult(null);
  };

  const useGeolocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported in this browser');
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords([pos.coords.latitude, pos.coords.longitude]);
        setGeoLoading(false);
        toast.success('Location captured from device GPS');
      },
      (err) => {
        setGeoLoading(false);
        toast.error(err.message || 'Unable to get location');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handlePick = useCallback((latlng) => {
    setCoords(latlng);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Select an inspection image');
      return;
    }
    if (!coords) {
      toast.error('Set coordinates via GPS or map pin');
      return;
    }
    if (!ward.trim()) {
      toast.error('Ward is required');
      return;
    }

    const form = new FormData();
    form.append('image', file);
    form.append('latitude', String(coords[0]));
    form.append('longitude', String(coords[1]));
    form.append('ward', ward.trim());
    form.append('inspectorNotes', notes.trim());

    setSubmitting(true);
    try {
      const { data } = await uploadInspection(form);
      if (!data.success) throw new Error(data.message || 'Upload failed');
      setResult(data.data);
      toast.success('Inspection analyzed and saved');
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Failed to analyze inspection';
      toast.error(typeof msg === 'string' ? msg : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900">
          Field Inspection Upload
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Capture infrastructure issues with GPS or map pin, then run AI detection.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="card-panel space-y-5">
          <div>
            <span className="label-field">Inspection image</span>
            <label
              htmlFor="inspection-image"
              className="mt-1 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 transition hover:border-navy-400 hover:bg-navy-50/40"
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-56 rounded-lg object-contain"
                />
              ) : (
                <>
                  <ImagePlus className="mb-2 h-8 w-8 text-slate-400" />
                  <span className="text-sm font-medium text-navy-800">
                    Click to upload or drag an image
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    JPG, PNG up to 15 MB
                  </span>
                </>
              )}
              <input
                id="inspection-image"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileChange}
              />
            </label>
            {file && (
              <p className="mt-2 truncate text-xs text-slate-500">{file.name}</p>
            )}
          </div>

          <div>
            <span className="label-field">Location coordinates</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={useGeolocation}
                disabled={geoLoading}
              >
                {geoLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Crosshair className="h-4 w-4" />
                )}
                Use device GPS
              </button>
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-navy-800">
                <MapPin className="h-4 w-4 shrink-0 text-navy-600" />
                {coords ? (
                  <span>
                    {coords[0].toFixed(6)}, {coords[1].toFixed(6)}
                  </span>
                ) : (
                  <span className="text-slate-400">Click map to drop a pin</span>
                )}
              </div>
            </div>
            <div className="mt-3 h-56">
              <GISMap
                pickMode
                pickPosition={coords || DEFAULT_MAP_CENTER}
                onPickPosition={handlePick}
                height="100%"
                zoom={coords ? 16 : 12}
                showPopups={false}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ward" className="label-field">
              Ward
            </label>
            <input
              id="ward"
              className="input-field"
              placeholder="e.g. Ward 12"
              value={ward}
              onChange={(e) => setWard(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="notes" className="label-field">
              Inspector notes
            </label>
            <textarea
              id="notes"
              rows={3}
              className="input-field resize-y"
              placeholder="Describe site conditions, access notes, hazards…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing with AI…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Analyze & Save Inspection
              </>
            )}
          </button>
        </form>

        <div className="space-y-4">
          <div className="card-panel">
            <div className="mb-3 flex items-center gap-2">
              <Upload className="h-4 w-4 text-navy-600" />
              <h2 className="font-display text-base font-semibold text-navy-900">
                Detection result
              </h2>
            </div>

            {!result && !submitting && (
              <p className="rounded-lg bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                Submit an image to see bounding boxes, confidence, and severity.
              </p>
            )}

            {submitting && (
              <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-navy-700" />
                <p className="text-sm">Running detection model…</p>
              </div>
            )}

            {result && !submitting && (
              <div className="space-y-4">
                <BoundingBoxCanvas
                  imageUrl={
                    previewUrl || resolveImageUrl(result.imageUrl)
                  }
                  boxes={result.boundingBoxes || []}
                  severityLevel={result.severityLevel}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <SeverityBadge
                    level={result.severityLevel}
                    score={result.severityScore}
                  />
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-navy-800">
                    Confidence {formatPercent(result.detectionConfidence)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {result.issueType?.replace(/_/g, ' ')}
                  </span>
                </div>
                {result.explainableFactors &&
                  Object.keys(result.explainableFactors).length > 0 && (
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                      <div className="mb-1 font-semibold text-navy-800">
                        Explainable factors
                      </div>
                      <pre className="whitespace-pre-wrap font-sans">
                        {JSON.stringify(result.explainableFactors, null, 2)}
                      </pre>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
