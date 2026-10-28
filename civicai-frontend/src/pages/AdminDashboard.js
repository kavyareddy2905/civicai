import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  Flame,
  Loader2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { getDashboardAnalytics, getHotspots } from '../services/api';
import { SEVERITY_COLORS, formatIssueType } from '../utils/constants';

const CARD_META = [
  {
    key: 'total',
    label: 'Total Inspections',
    icon: ClipboardList,
    accent: 'bg-sky-50 text-sky-700',
  },
  {
    key: 'unresolved',
    label: 'Unresolved Issues',
    icon: AlertTriangle,
    accent: 'bg-amber-50 text-amber-700',
  },
  {
    key: 'highCritical',
    label: 'High / Critical Queue',
    icon: Flame,
    accent: 'bg-red-50 text-red-700',
  },
  {
    key: 'resolved',
    label: 'Resolved Work',
    icon: CheckCircle2,
    accent: 'bg-green-50 text-green-700',
  },
];

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [dashRes, hotRes] = await Promise.all([
          getDashboardAnalytics(),
          getHotspots({ days: 30 }),
        ]);
        if (cancelled) return;
        setAnalytics(dashRes.data);
        setHotspots((hotRes.data?.wardHotspots || []).slice(0, 5));
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cardValues = useMemo(() => {
    if (!analytics?.cards) {
      return { total: 0, unresolved: 0, highCritical: 0, resolved: 0 };
    }
    const high =
      analytics.severityBreakdown?.find((s) => s.severity === 'High')?.count || 0;
    const critical =
      analytics.severityBreakdown?.find((s) => s.severity === 'Critical')?.count ||
      analytics.cards.critical ||
      0;

    return {
      total: analytics.cards.total,
      unresolved: analytics.cards.unresolved,
      highCritical: high + critical,
      resolved: analytics.cards.resolved,
    };
  }, [analytics]);

  const categoryData = useMemo(
    () =>
      (analytics?.categoryBreakdown || []).map((c) => ({
        name: formatIssueType(c.category),
        count: c.count,
      })),
    [analytics]
  );

  const severityData = useMemo(
    () =>
      (analytics?.severityBreakdown || []).map((s) => ({
        name: s.severity,
        value: s.count,
      })),
    [analytics]
  );

  const trendData = analytics?.trendSeries || [];

  const wardDensity = useMemo(
    () =>
      hotspots.map((h) => ({
        ward: h.ward,
        count: h.issueCount,
        score: h.hotspotScore,
      })),
    [hotspots]
  );

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-navy-700" />
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-900">
          Municipal Operations Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Live inspection metrics, severity distribution, and ward hotspots.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARD_META.map(({ key, label, icon: Icon, accent }) => (
          <div key={key} className="card-panel flex items-start gap-4">
            <span className={`rounded-xl p-3 ${accent}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {label}
              </div>
              <div className="mt-1 font-display text-3xl font-bold text-navy-900">
                {cardValues[key] ?? 0}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card-panel">
          <h2 className="mb-4 font-display text-sm font-semibold text-navy-900">
            Issues by Category
          </h2>
          <div className="h-64">
            {categoryData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#334e68" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>

        <div className="card-panel">
          <h2 className="mb-4 font-display text-sm font-semibold text-navy-900">
            Issues by Severity Level
          </h2>
          <div className="h-64">
            {severityData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={severityData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    label={({ name, percent }) =>
                      percent > 0 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                    }
                  >
                    {severityData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={SEVERITY_COLORS[entry.name] || '#94a3b8'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>

        <div className="card-panel">
          <h2 className="mb-4 font-display text-sm font-semibold text-navy-900">
            Inspections Over Time (14 days)
          </h2>
          <div className="h-64">
            {trendData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Inspections"
                    stroke="#0ea5e9"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>

        <div className="card-panel">
          <h2 className="mb-4 font-display text-sm font-semibold text-navy-900">
            Ward-wise Issue Density
          </h2>
          <div className="h-64">
            {wardDensity.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wardDensity} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="ward" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Issues" fill="#ea580c" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>
      </div>

      <div className="card-panel overflow-x-auto">
        <h2 className="mb-4 font-display text-sm font-semibold text-navy-900">
          Hotspot Ranking — Top 5 Wards
        </h2>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-semibold">Rank</th>
              <th className="px-3 py-2 font-semibold">Ward</th>
              <th className="px-3 py-2 font-semibold">Issue Count</th>
              <th className="px-3 py-2 font-semibold">Avg Severity</th>
              <th className="px-3 py-2 font-semibold">Hotspot Score</th>
              <th className="px-3 py-2 font-semibold">Top Categories</th>
            </tr>
          </thead>
          <tbody>
            {hotspots.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  No unresolved hotspots in the last 30 days.
                </td>
              </tr>
            )}
            {hotspots.map((h, idx) => {
              const cats = Object.entries(h.categories || {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
                .map(([k, v]) => `${formatIssueType(k)} (${v})`)
                .join(', ');
              return (
                <tr key={h.ward} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-3 font-semibold text-navy-800">#{idx + 1}</td>
                  <td className="px-3 py-3 font-medium text-navy-900">{h.ward}</td>
                  <td className="px-3 py-3">{h.issueCount}</td>
                  <td className="px-3 py-3">{h.avgSeverity}</td>
                  <td className="px-3 py-3">
                    <span className="rounded-md bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                      {h.hotspotScore}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{cats || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">
      No data available yet
    </div>
  );
}
