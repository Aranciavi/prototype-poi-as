import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { Compass, ExternalLink, MapPin } from 'lucide-react';
import type { BranchLocation } from '../types/ops';

export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function formatDistanceId(meters: number): string {
  if (!Number.isFinite(meters)) return '-';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
  }
  return `${meters.toLocaleString('id-ID')} meter`;
}

export function isValidIndonesianCoords(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat !== 0 &&
    lng !== 0 &&
    lat >= -11.5 &&
    lat <= 6.5 &&
    lng >= 94.5 &&
    lng <= 141.5
  );
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createPinIcon(fill: string, innerFill: string, size = 30): L.DivIcon {
  const svg = `<svg width="${size}" height="${Math.round(size * 1.25)}" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 6px rgba(15,23,42,0.3));">
    <path d="M14 1C6.82 1 1 6.82 1 14c0 9.75 13 21 13 21s13-11.25 13-21C27 6.82 21.18 1 14 1z" fill="${fill}" stroke="#ffffff" stroke-width="2.2"/>
    <circle cx="14" cy="14" r="5" fill="${innerFill}"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: 'bri-div-icon',
    iconSize: [size, Math.round(size * 1.25)],
    iconAnchor: [Math.round(size / 2), Math.round(size * 1.2)],
    popupAnchor: [0, -Math.round(size * 1.05)],
  });
}

interface CoordinateComparisonMapProps {
  branch: BranchLocation;
  liveLat?: number;
  liveLng?: number;
  liveLabel?: string;
  mapsApiKey?: string;
  heightClass?: string;
}

export function CoordinateComparisonMap({
  branch,
  liveLat,
  liveLng,
  liveLabel,
  heightClass = 'h-[230px]',
}: CoordinateComparisonMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const coordDisc = branch.discrepancies.find((d) => d.field === 'coordinates');
  const masterValid = isValidIndonesianCoords(branch.lat, branch.lng);

  const googleLat =
    typeof liveLat === 'number' && Number.isFinite(liveLat)
      ? liveLat
      : typeof branch.gbpLat === 'number' && Number.isFinite(branch.gbpLat)
        ? branch.gbpLat
        : coordDisc?.gbpLat;
  const googleLng =
    typeof liveLng === 'number' && Number.isFinite(liveLng)
      ? liveLng
      : typeof branch.gbpLng === 'number' && Number.isFinite(branch.gbpLng)
        ? branch.gbpLng
        : coordDisc?.gbpLng;

  const googleValid =
    typeof googleLat === 'number' &&
    typeof googleLng === 'number' &&
    isValidIndonesianCoords(googleLat, googleLng);

  const masterPoint = useMemo(
    () => (masterValid ? { lat: branch.lat, lng: branch.lng } : null),
    [masterValid, branch.lat, branch.lng]
  );

  const googlePoint = useMemo(
    () => (googleValid ? { lat: googleLat!, lng: googleLng! } : null),
    [googleValid, googleLat, googleLng]
  );

  const distanceMeters = useMemo(() => {
    if (!masterPoint || !googlePoint) return null;
    return calculateDistanceMeters(
      masterPoint.lat,
      masterPoint.lng,
      googlePoint.lat,
      googlePoint.lng
    );
  }, [masterPoint, googlePoint]);

  const googleMapsUrl =
    branch.googleMapsUri ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `BRI ${branch.name} ${branch.city}`
    )}`;

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = googlePoint
      ? [googlePoint.lat, googlePoint.lng]
      : masterPoint
        ? [masterPoint.lat, masterPoint.lng]
        : [-6.2, 106.816666];

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: 16,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    const layerGroup = L.layerGroup().addTo(map);

    mapRef.current = map;
    layerGroupRef.current = layerGroup;

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
    };
  }, []);

  // Update markers, dashed polyline, and viewport bounds when coordinates change
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    if (masterPoint) {
      const masterMarker = L.marker([masterPoint.lat, masterPoint.lng], {
        icon: createPinIcon('#00529C', '#ffffff', 30),
        zIndexOffset: 20,
      }).bindPopup(
        `<div style="font-size:12px;line-height:1.45;">
          <strong style="color:#00529C;">Master BRI</strong><br/>
          <span>${escapeHtml(branch.name)}</span><br/>
          <code style="font-size:11px;color:#444653;">${masterPoint.lat.toFixed(6)}, ${masterPoint.lng.toFixed(6)}</code>
        </div>`,
        { className: 'bri-leaflet-popup' }
      );
      masterMarker.addTo(layerGroup);
    }

    if (googlePoint) {
      const label = liveLabel || `Lokasi Pembanding Maps (${branch.name})`;
      const googleMarker = L.marker([googlePoint.lat, googlePoint.lng], {
        icon: createPinIcon('#dc2626', '#fde047', 30),
        zIndexOffset: 30,
      }).bindPopup(
        `<div style="font-size:12px;line-height:1.45;">
          <strong style="color:#dc2626;">Titik Google Maps</strong><br/>
          <span>${escapeHtml(label)}</span><br/>
          <code style="font-size:11px;color:#444653;">${googlePoint.lat.toFixed(6)}, ${googlePoint.lng.toFixed(6)}</code>
        </div>`,
        { className: 'bri-leaflet-popup' }
      );
      googleMarker.addTo(layerGroup);
    }

    if (masterPoint && googlePoint) {
      L.polyline(
        [
          [masterPoint.lat, masterPoint.lng],
          [googlePoint.lat, googlePoint.lng],
        ],
        {
          color: '#dc2626',
          weight: 3,
          opacity: 0.85,
          dashArray: '6, 6',
        }
      ).addTo(layerGroup);

      const bounds = L.latLngBounds(
        [masterPoint.lat, masterPoint.lng],
        [googlePoint.lat, googlePoint.lng]
      );
      map.fitBounds(bounds, { padding: [46, 46], maxZoom: 17 });
    } else if (googlePoint) {
      map.setView([googlePoint.lat, googlePoint.lng], 16);
    } else if (masterPoint) {
      map.setView([masterPoint.lat, masterPoint.lng], 16);
    } else {
      map.setView([-6.2, 106.816666], 12);
    }

    map.invalidateSize();
  }, [branch.name, masterPoint, googlePoint, liveLabel]);

  return (
    <div className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-[#00529C]" />
          <span className="text-xs font-semibold text-[#1a1b22]">
            Peta Perbandingan Titik Master vs Google Maps
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {distanceMeters !== null ? (
            <span
              className={`px-2.5 py-1 rounded-xl font-mono text-xs font-bold tabular-nums ${
                distanceMeters > 50
                  ? 'bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]'
                  : 'bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0]'
              }`}
            >
              Jarak Ketidaktepatan: {formatDistanceId(distanceMeters)}
            </span>
          ) : !masterValid ? (
            <span className="px-2.5 py-1 rounded-xl font-mono text-xs font-semibold bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]">
              Koordinat Master belum valid ({branch.lat}, {branch.lng})
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-xl font-mono text-xs text-[#64748b] bg-white border border-[#e2e8f0]">
              Menampilkan titik Master BRI
            </span>
          )}

          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-7 px-2.5 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#eff6ff] hover:border-[#00529C] text-[11px] font-semibold text-[#00529C] inline-flex items-center gap-1 smooth-transition whitespace-nowrap"
          >
            <span>Buka di Google Maps</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Explicit container height for Leaflet */}
      <div
        className={`relative ${heightClass} w-full rounded-xl overflow-hidden border border-[#cbd5e1] bg-[#eef2f6]`}
      >
        <div ref={containerRef} className="w-full h-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
        <div className="rounded-xl bg-white border border-[#e2e8f0] p-2.5 space-y-0.5">
          <div className="flex items-center gap-1.5 font-semibold text-[#00529C]">
            <MapPin className="h-3.5 w-3.5" />
            <span>Titik Koordinat Master BRI</span>
          </div>
          <p className="font-mono text-[11px] text-[#1a1b22] tabular-nums">
            {masterValid
              ? `${branch.lat.toFixed(6)}, ${branch.lng.toFixed(6)}`
              : `${branch.lat}, ${branch.lng} (Tidak Valid)`}
          </p>
        </div>

        <div className="rounded-xl bg-white border border-[#e2e8f0] p-2.5 space-y-0.5">
          <div className="flex items-center gap-1.5 font-semibold text-[#dc2626]">
            <MapPin className="h-3.5 w-3.5" />
            <span>Titik Lokasi Pembanding Google Maps</span>
          </div>
          <p className="font-mono text-[11px] text-[#1a1b22] tabular-nums">
            {googlePoint
              ? `${googlePoint.lat.toFixed(6)}, ${googlePoint.lng.toFixed(6)}`
              : 'Belum tersedia titik pembanding'}
          </p>
        </div>
      </div>
    </div>
  );
}
