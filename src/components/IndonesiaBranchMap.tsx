import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import type { BranchLocation } from '../types/ops';
import { calculateDistanceMeters, isValidIndonesianCoords } from './CoordinateComparisonMap';

interface IndonesiaBranchMapProps {
  branches: BranchLocation[];
  selectedBranchId: string | null;
  onSelectBranch: (branchId: string) => void;
  activeRegionFilter: string;
  onSelectRegionFilter: (regionShort: string) => void;
  mapsApiKey?: string;
  livePlacePoint?: { lat: number; lng: number; label?: string } | null;
}

const INDONESIA_CENTER: [number, number] = [-2.5489, 118.0149];

function escapeHtml(raw: string): string {
  return (raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getPinStyle(status: BranchLocation['syncStatus'], isSelected: boolean) {
  if (isSelected) {
    return { background: '#00529C', inner: '#F37021', size: 34 };
  }
  switch (status) {
    case 'action_required':
      return { background: '#dc2626', inner: '#ffffff', size: 26 };
    case 'discrepancy':
      return { background: '#d97706', inner: '#ffffff', size: 26 };
    case 'pending_review':
    case 'processing':
      return { background: '#2563eb', inner: '#ffffff', size: 26 };
    default:
      return { background: '#059669', inner: '#ffffff', size: 26 };
  }
}

function getStatusMeta(status: BranchLocation['syncStatus']): {
  label: string;
  bg: string;
  color: string;
  border: string;
} {
  switch (status) {
    case 'synced':
      return {
        label: 'Tersinkronisasi',
        bg: '#ecfdf5',
        color: '#059669',
        border: '#a7f3d0',
      };
    case 'discrepancy':
      return {
        label: 'Perbedaan Data',
        bg: '#fffbeb',
        color: '#b45309',
        border: '#fde68a',
      };
    case 'action_required':
      return {
        label: 'Perlu Tindakan',
        bg: '#fef2f2',
        color: '#dc2626',
        border: '#fecaca',
      };
    case 'pending_review':
      return {
        label: 'Review Google',
        bg: '#eff6ff',
        color: '#1d4ed8',
        border: '#bfdbfe',
      };
    case 'processing':
      return {
        label: 'Menyinkronkan',
        bg: '#eff6ff',
        color: '#1d4ed8',
        border: '#bfdbfe',
      };
  }
}

function createPinDivIcon(status: BranchLocation['syncStatus'], isSelected: boolean): L.DivIcon {
  const { background, inner, size } = getPinStyle(status, isSelected);
  const height = Math.round(size * 1.25);
  const ring = isSelected
    ? `<circle cx="14" cy="14" r="12.5" stroke="#00529C" stroke-opacity="0.28" stroke-width="2" fill="none"/>`
    : '';
  const svg = `<svg width="${size}" height="${height}" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 6px rgba(15,23,42,0.28));">
    ${ring}
    <path d="M14 2C7.37 2 2 7.37 2 14c0 9.1 12 19.5 12 19.5S26 23.1 26 14C26 7.37 20.63 2 14 2z" fill="${background}" stroke="#ffffff" stroke-width="2.2"/>
    <circle cx="14" cy="14" r="4.6" fill="${inner}"/>
  </svg>`;

  return L.divIcon({
    html: svg,
    className: 'bri-div-icon',
    iconSize: [size, height],
    iconAnchor: [Math.round(size / 2), Math.round(height * 0.94)],
    popupAnchor: [0, -Math.round(height * 0.85)],
  });
}

function buildBranchPopupHtml(branch: BranchLocation): string {
  const statusMeta = getStatusMeta(branch.syncStatus);
  const mapsSearchUrl =
    branch.googleMapsUri ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `BRI ${branch.name} ${branch.city}`
    )}`;
  const satLine =
    branch.saturdayHours && branch.saturdayHours !== 'Tutup'
      ? `<div>Sabtu: ${escapeHtml(branch.saturdayHours)}</div>`
      : '';

  return `
    <div style="font-family:var(--font-sans);color:#1a1b22;line-height:1.4;">
      <div style="font-family:var(--font-mono);font-size:11px;color:#64748b;margin-bottom:2px;">
        ${escapeHtml(branch.code)} &middot; ${escapeHtml(branch.tierLabel)}
      </div>
      <div style="font-family:var(--font-display);font-size:13.5px;font-weight:700;color:#1a1b22;margin-bottom:6px;">
        ${escapeHtml(branch.name)}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${statusMeta.bg};color:${statusMeta.color};border:1px solid ${statusMeta.border};">
          ${escapeHtml(statusMeta.label)}
        </span>
        <span style="font-family:var(--font-mono);font-size:11.5px;font-weight:600;color:#444653;white-space:nowrap;">
          <span style="color:#d97706;">&#9733;</span> ${branch.rating.toFixed(1)} (${branch.reviewCount})
        </span>
      </div>
      <div style="font-size:11.5px;color:#444653;margin-bottom:6px;">
        ${escapeHtml(branch.address)}
      </div>
      <div style="font-family:var(--font-mono);font-size:11px;color:#00529C;margin-bottom:8px;">
        <div>Sen–Jum: ${escapeHtml(branch.operatingHours)}</div>
        ${satLine}
      </div>
      <a
        href="${escapeHtml(mapsSearchUrl)}"
        target="_blank"
        rel="noopener noreferrer"
        style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:10px;background:#00529C;color:#ffffff;font-size:11.5px;font-weight:600;text-decoration:none;"
      >
        <span>Buka di Google Maps</span>
        <span aria-hidden="true">&#8599;</span>
      </a>
    </div>
  `;
}

interface RegionClusterItem {
  regionShort: string;
  count: number;
  pendingCount: number;
  lat: number;
  lng: number;
  representativeId: string;
}

export function IndonesiaBranchMap({
  branches,
  selectedBranchId,
  onSelectBranch,
  activeRegionFilter,
  onSelectRegionFilter,
  livePlacePoint,
}: IndonesiaBranchMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersByIdRef = useRef<Map<string, L.Marker>>(new Map());
  const prevSelectedIdRef = useRef<string | null>(null);

  const [zoom, setZoom] = useState(5);
  const [viewportTick, setViewportTick] = useState(0);

  // Keep latest callbacks in refs so Leaflet listeners never capture stale closures
  const onSelectBranchRef = useRef(onSelectBranch);
  const onSelectRegionFilterRef = useRef(onSelectRegionFilter);
  onSelectBranchRef.current = onSelectBranch;
  onSelectRegionFilterRef.current = onSelectRegionFilter;

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId) ?? null,
    [branches, selectedBranchId]
  );

  const validBranches = useMemo(
    () => branches.filter((b) => isValidIndonesianCoords(b.lat, b.lng)),
    [branches]
  );

  const showClusters =
    activeRegionFilter === 'ALL' && zoom < 8 && validBranches.length > 150;

  const clusters = useMemo<RegionClusterItem[]>(() => {
    if (!showClusters) return [];
    const grouped: Record<
      string,
      {
        regionShort: string;
        count: number;
        pendingCount: number;
        latSum: number;
        lngSum: number;
        representativeId: string;
      }
    > = {};

    for (const b of validBranches) {
      if (!grouped[b.regionShort]) {
        grouped[b.regionShort] = {
          regionShort: b.regionShort,
          count: 0,
          pendingCount: 0,
          latSum: 0,
          lngSum: 0,
          representativeId: b.id,
        };
      }
      const curr = grouped[b.regionShort];
      curr.count++;
      if (
        b.syncStatus === 'action_required' ||
        b.syncStatus === 'discrepancy' ||
        b.syncStatus === 'pending_review'
      ) {
        curr.pendingCount++;
      }
      curr.latSum += b.lat;
      curr.lngSum += b.lng;
    }

    return Object.values(grouped).map((c) => ({
      regionShort: c.regionShort,
      count: c.count,
      pendingCount: c.pendingCount,
      lat: c.latSum / c.count,
      lng: c.lngSum / c.count,
      representativeId: c.representativeId,
    }));
  }, [validBranches, showClusters]);

  const visiblePins = useMemo(() => {
    if (showClusters) return [];
    const map = mapRef.current;
    const bounds = map ? map.getBounds().pad(0.25) : null;

    const inBoundsOrSmall =
      bounds && validBranches.length > 180
        ? validBranches.filter(
            (b) => b.id === selectedBranchId || bounds.contains([b.lat, b.lng])
          )
        : validBranches;

    const candidatePool = inBoundsOrSmall.length > 0 ? inBoundsOrSmall : validBranches;

    const prioritized = [...candidatePool].sort((a, b) => {
      if (a.id === selectedBranchId) return -1;
      if (b.id === selectedBranchId) return 1;
      const score = (s: BranchLocation['syncStatus']) =>
        s === 'action_required'
          ? 0
          : s === 'discrepancy'
            ? 1
            : s === 'pending_review'
              ? 2
              : s === 'processing'
                ? 3
                : 4;
      return score(a.syncStatus) - score(b.syncStatus);
    });

    return prioritized.slice(0, 180);
  }, [validBranches, selectedBranchId, showClusters, viewportTick]);

  const gbpPinPoint = useMemo(() => {
    if (!selectedBranch) return null;
    const coordDisc = selectedBranch.discrepancies.find((d) => d.field === 'coordinates');
    const lat = livePlacePoint?.lat ?? selectedBranch.gbpLat ?? coordDisc?.gbpLat;
    const lng = livePlacePoint?.lng ?? selectedBranch.gbpLng ?? coordDisc?.gbpLng;
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !isValidIndonesianCoords(lat, lng)
    ) {
      return null;
    }
    if (isValidIndonesianCoords(selectedBranch.lat, selectedBranch.lng)) {
      const dist = calculateDistanceMeters(selectedBranch.lat, selectedBranch.lng, lat, lng);
      if (dist <= 10) return null;
    }
    return {
      lat,
      lng,
      label: livePlacePoint?.label || `Titik Pembanding Maps (${selectedBranch.name})`,
    };
  }, [selectedBranch, livePlacePoint]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const hasInitialBranch =
      selectedBranch && isValidIndonesianCoords(selectedBranch.lat, selectedBranch.lng);

    const map = L.map(containerRef.current, {
      center: hasInitialBranch
        ? [selectedBranch.lat, selectedBranch.lng]
        : INDONESIA_CENTER,
      zoom: hasInitialBranch ? 12 : 5,
      minZoom: 4,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: true,
    });

    const layerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = layerGroup;

    map.on('zoomend moveend', () => {
      setZoom(map.getZoom());
      setViewportTick((t) => t + 1);
    });

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);

    window.setTimeout(() => {
      map.invalidateSize();
    }, 120);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      tileLayerRef.current = null;
      markersByIdRef.current.clear();
    };
  }, []);

  // Manage base tile layer (100% free OpenStreetMap without API Key)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current && map.hasLayer(tileLayerRef.current)) {
      map.removeLayer(tileLayerRef.current);
    }

    const layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    });

    layer.addTo(map);
    tileLayerRef.current = layer;
  }, []);

  // Pan/zoom smoothly when selectedBranchId changes from outside (table/list click)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedBranch) return;
    if (prevSelectedIdRef.current === selectedBranch.id) return;
    prevSelectedIdRef.current = selectedBranch.id;

    if (!isValidIndonesianCoords(selectedBranch.lat, selectedBranch.lng)) return;
    const targetZoom = Math.max(map.getZoom(), 13);
    map.setView([selectedBranch.lat, selectedBranch.lng], targetZoom, { animate: true });
  }, [selectedBranch]);

  // Render clusters or branch markers + GBP discrepancy pin
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    markersByIdRef.current.clear();

    if (showClusters) {
      for (const cluster of clusters) {
        const shortName = escapeHtml(cluster.regionShort.replace('RO ', ''));
        const badgeHtml = `
          <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:9999px;background:#00529C;color:#ffffff;border:2px solid #ffffff;box-shadow:0 4px 12px rgba(15,23,42,0.26);cursor:pointer;white-space:nowrap;">
            <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;">${cluster.count}</span>
            <span style="font-size:10.5px;font-weight:600;">${shortName}</span>
          </div>
        `;
        const icon = L.divIcon({
          html: badgeHtml,
          className: 'bri-div-icon',
          iconSize: [110, 30],
          iconAnchor: [55, 15],
        });

        const clusterMarker = L.marker([cluster.lat, cluster.lng], {
          icon,
          title: `${cluster.regionShort}: ${cluster.count} unit BRI`,
        });

        clusterMarker.on('click', () => {
          onSelectRegionFilterRef.current(cluster.regionShort);
          onSelectBranchRef.current(cluster.representativeId);
          map.setView([cluster.lat, cluster.lng], 9, { animate: true });
        });

        clusterMarker.addTo(layerGroup);
      }
      return;
    }

    for (const b of visiblePins) {
      const isSelected = b.id === selectedBranchId;
      const marker = L.marker([b.lat, b.lng], {
        icon: createPinDivIcon(b.syncStatus, isSelected),
        title: `${b.name} (${b.code})`,
        zIndexOffset: isSelected ? 500 : 100,
      });

      marker.bindPopup(buildBranchPopupHtml(b), {
        className: 'bri-leaflet-popup',
        maxWidth: 280,
        autoPan: true,
      });

      marker.on('click', () => {
        prevSelectedIdRef.current = b.id;
        onSelectBranchRef.current(b.id);
      });

      marker.addTo(layerGroup);
      markersByIdRef.current.set(b.id, marker);
    }

    if (gbpPinPoint && selectedBranch && isValidIndonesianCoords(selectedBranch.lat, selectedBranch.lng)) {
      const gbpMarker = L.marker([gbpPinPoint.lat, gbpPinPoint.lng], {
        icon: createPinDivIcon('action_required', false),
        title: gbpPinPoint.label,
        zIndexOffset: 600,
      }).bindPopup(
        `<div style="font-size:12px;line-height:1.4;">
          <strong style="color:#dc2626;">Titik Pembanding Maps</strong><br/>
          <span>${escapeHtml(gbpPinPoint.label)}</span><br/>
          <code style="font-size:11px;color:#444653;">${gbpPinPoint.lat.toFixed(5)}, ${gbpPinPoint.lng.toFixed(5)}</code>
        </div>`,
        { className: 'bri-leaflet-popup' }
      );
      gbpMarker.addTo(layerGroup);

      L.polyline(
        [
          [selectedBranch.lat, selectedBranch.lng],
          [gbpPinPoint.lat, gbpPinPoint.lng],
        ],
        {
          color: '#dc2626',
          weight: 2.5,
          opacity: 0.8,
          dashArray: '6, 5',
        }
      ).addTo(layerGroup);
    }
  }, [showClusters, clusters, visiblePins, selectedBranchId, gbpPinPoint, selectedBranch]);

  const handleZoomIn = useCallback(() => {
    const map = mapRef.current;
    if (map) map.setZoom(Math.min(19, map.getZoom() + 2));
  }, []);

  const handleZoomOut = useCallback(() => {
    const map = mapRef.current;
    if (map) map.setZoom(Math.max(4, map.getZoom() - 2));
  }, []);

  const handleResetView = useCallback(() => {
    onSelectRegionFilter('ALL');
    const map = mapRef.current;
    if (map) {
      map.closePopup();
      map.setView(INDONESIA_CENTER, 5, { animate: true });
    }
  }, [onSelectRegionFilter]);

  return (
    <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-[#1a1b22]">
            Peta Sebaran Lokasi &amp; Profil GBP BRI
          </h3>
          <p className="text-xs text-[#64748b]">
            {showClusters
              ? 'Klik klaster wilayah atau perbesar peta untuk melihat pin unit kerja BRI'
              : `Menampilkan ${visiblePins.length.toLocaleString('id-ID')} titik unit BRI (klik pin untuk detail GBP)`}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {activeRegionFilter !== 'ALL' && (
            <button
              type="button"
              onClick={handleResetView}
              className="h-8 px-3 rounded-xl bg-[#eff6ff] text-[#00529C] text-xs font-semibold hover:bg-[#dbeafe] smooth-transition inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Semua Wilayah</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Perkecil peta"
            className="h-8 w-8 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f8fafc] text-[#1a1b22] flex items-center justify-center smooth-transition"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Perbesar peta"
            className="h-8 w-8 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f8fafc] text-[#1a1b22] flex items-center justify-center smooth-transition"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            aria-label="Atur ulang posisi peta"
            className="h-8 w-8 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f8fafc] text-[#1a1b22] flex items-center justify-center smooth-transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Responsive Leaflet Map Container */}
      <div className="relative h-[320px] sm:h-[380px] w-full rounded-2xl bg-[#eef2f6] border border-[#e2e8f0] overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Semantic Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#444653]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#059669]" />
          Tersinkronisasi
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
          Review Google
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#d97706]" />
          Perbedaan Data
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#dc2626]" />
          Perlu Tindakan / Titik Pembanding
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#00529C]" />
          Cabang Dipilih (Master BRI)
        </span>
      </div>
    </div>
  );
}
