import { useEffect, useMemo } from 'react';
import {
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Compass, MapPin } from 'lucide-react';
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

interface DiscrepancyPolylineProps {
  masterPoint: { lat: number; lng: number } | null;
  googlePoint: { lat: number; lng: number } | null;
}

function DiscrepancyMapOverlay({ masterPoint, googlePoint }: DiscrepancyPolylineProps) {
  const map = useMap();
  const coreLib = useMapsLibrary('core');
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map) return;

    if (masterPoint && googlePoint && coreLib) {
      const bounds = new coreLib.LatLngBounds();
      bounds.extend(masterPoint);
      bounds.extend(googlePoint);
      map.fitBounds(bounds, { top: 44, right: 44, bottom: 44, left: 44 });
    } else if (googlePoint) {
      map.panTo(googlePoint);
      map.setZoom(16);
    } else if (masterPoint) {
      map.panTo(masterPoint);
      map.setZoom(16);
    }
  }, [map, coreLib, masterPoint, googlePoint]);

  useEffect(() => {
    if (!map || !mapsLib || !masterPoint || !googlePoint) return;

    const polyline = new mapsLib.Polyline({
      path: [masterPoint, googlePoint],
      geodesic: true,
      strokeColor: '#dc2626',
      strokeOpacity: 0.85,
      strokeWeight: 3,
      map,
    });

    return () => {
      polyline.setMap(null);
    };
  }, [map, mapsLib, masterPoint, googlePoint]);

  return null;
}

interface CoordinateComparisonMapProps {
  branch: BranchLocation;
  liveLat?: number;
  liveLng?: number;
  liveLabel?: string;
  mapsApiKey: string;
  heightClass?: string;
}

export function CoordinateComparisonMap({
  branch,
  liveLat,
  liveLng,
  liveLabel,
  mapsApiKey,
  heightClass = 'h-[230px]',
}: CoordinateComparisonMapProps) {
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

  const defaultCenter = googlePoint || masterPoint || { lat: -6.2, lng: 106.816666 };

  return (
    <div className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-[#00529C]" />
          <span className="text-xs font-semibold text-[#1a1b22]">
            Peta Perbandingan Titik Master vs Google Maps
          </span>
        </div>

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
            Menunggu koordinat pembanding Google Maps
          </span>
        )}
      </div>

      {/* Explicit container height required by Google Maps JS */}
      <div className={`relative ${heightClass} w-full rounded-xl overflow-hidden border border-[#cbd5e1] bg-[#eef2f6]`}>
        {mapsApiKey ? (
          <GoogleMap
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            defaultCenter={defaultCenter}
            defaultZoom={16}
            gestureHandling="greedy"
            mapTypeControl={false}
            streetViewControl={false}
            style={{ width: '100%', height: '100%' }}
          >
            <DiscrepancyMapOverlay masterPoint={masterPoint} googlePoint={googlePoint} />

            {masterPoint && (
              <AdvancedMarker
                position={masterPoint}
                title={`Master BRI: ${branch.name}`}
                zIndex={20}
              >
                <Pin background="#00529C" borderColor="#ffffff" glyphColor="#ffffff" scale={1.05} />
              </AdvancedMarker>
            )}

            {googlePoint && (
              <AdvancedMarker
                position={googlePoint}
                title={liveLabel || `Lokasi Asli Google Maps: ${branch.name}`}
                zIndex={30}
              >
                <Pin background="#dc2626" borderColor="#ffffff" glyphColor="#ffffff" scale={1.05} />
              </AdvancedMarker>
            )}
          </GoogleMap>
        ) : (
          <div className="h-full flex items-center justify-center p-4 text-center text-xs text-[#64748b]">
            Memuat peta perbandingan Google Maps...
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
        <div className="rounded-xl bg-white border border-[#e2e8f0] p-2.5 space-y-0.5">
          <div className="flex items-center gap-1.5 font-semibold text-[#00529C]">
            <MapPin className="h-3.5 w-3.5" />
            <span>Titik Koordinat Master BRI</span>
          </div>
          <p className="font-mono text-[11px] text-[#1a1b22] tabular-nums">
            {masterValid ? `${branch.lat.toFixed(6)}, ${branch.lng.toFixed(6)}` : `${branch.lat}, ${branch.lng} (Tidak Valid)`}
          </p>
        </div>

        <div className="rounded-xl bg-white border border-[#e2e8f0] p-2.5 space-y-0.5">
          <div className="flex items-center gap-1.5 font-semibold text-[#dc2626]">
            <MapPin className="h-3.5 w-3.5" />
            <span>Titik Lokasi Asli Google Maps</span>
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
