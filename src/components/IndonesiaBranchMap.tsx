import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  type MapCameraChangedEvent,
} from '@vis.gl/react-google-maps';
import { ExternalLink, Maximize2, Minus, Plus, RotateCcw, Star } from 'lucide-react';
import type { BranchLocation } from '../types/ops';
import { calculateDistanceMeters, isValidIndonesianCoords } from './CoordinateComparisonMap';
import { StatusBadge } from './StatusBadge';

interface IndonesiaBranchMapProps {
  branches: BranchLocation[];
  selectedBranchId: string | null;
  onSelectBranch: (branchId: string) => void;
  activeRegionFilter: string;
  onSelectRegionFilter: (regionShort: string) => void;
  mapsApiKey: string;
  livePlacePoint?: { lat: number; lng: number; label?: string } | null;
}

const INDONESIA_CENTER = { lat: -2.5489, lng: 118.0149 };

function getPinColors(status: BranchLocation['syncStatus'], isSelected: boolean) {
  if (isSelected) {
    return { background: '#00529C', borderColor: '#FFFFFF', glyphColor: '#F37021' };
  }
  switch (status) {
    case 'action_required':
      return { background: '#dc2626', borderColor: '#ffffff', glyphColor: '#ffffff' };
    case 'discrepancy':
      return { background: '#d97706', borderColor: '#ffffff', glyphColor: '#ffffff' };
    case 'pending_review':
    case 'processing':
      return { background: '#2563eb', borderColor: '#ffffff', glyphColor: '#ffffff' };
    default:
      return { background: '#059669', borderColor: '#ffffff', glyphColor: '#ffffff' };
  }
}

interface BranchMarkerProps {
  branch: BranchLocation;
  isSelected: boolean;
  infoOpen: boolean;
  onSelect: () => void;
  onCloseInfo: () => void;
}

function BranchMarker({
  branch,
  isSelected,
  infoOpen,
  onSelect,
  onCloseInfo,
}: BranchMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const colors = getPinColors(branch.syncStatus, isSelected);
  const mapsSearchUrl =
    branch.googleMapsUri ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `BRI ${branch.name} ${branch.city}`
    )}`;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: branch.lat, lng: branch.lng }}
        title={`${branch.name} (${branch.code})`}
        zIndex={isSelected ? 50 : 10}
        onClick={onSelect}
      >
        <Pin
          background={colors.background}
          borderColor={colors.borderColor}
          glyphColor={colors.glyphColor}
          scale={isSelected ? 1.25 : 0.95}
        />
      </AdvancedMarker>

      {infoOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onCloseInfo} maxWidth={290}>
          <div className="p-1 space-y-2 text-[#1a1b22] font-sans">
            <div>
              <p className="font-mono text-[11px] text-[#64748b]">
                {branch.code} · {branch.tierLabel}
              </p>
              <p className="font-display text-sm font-bold text-[#1a1b22] leading-snug">
                {branch.name}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <StatusBadge status={branch.syncStatus} compact />
              <span className="inline-flex items-center gap-1 font-mono text-xs text-[#444653]">
                <Star className="h-3.5 w-3.5 text-[#d97706] fill-[#d97706]" />
                {branch.rating.toFixed(1)}
              </span>
            </div>

            <p className="text-xs text-[#444653] leading-relaxed">{branch.address}</p>
            <p className="font-mono text-[11px] text-[#00529C]">
              Sen–Jum: {branch.operatingHours}
            </p>

            <a
              href={mapsSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00529C] hover:underline pt-0.5"
            >
              <span>Buka di Google Maps</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

interface RegionClusterItem {
  regionShort: string;
  count: number;
  pendingCount: number;
  lat: number;
  lng: number;
  representativeId: string;
}

function MapViewportSync({
  selectedBranch,
  activeRegionFilter,
  resetSignal,
}: {
  selectedBranch: BranchLocation | null;
  activeRegionFilter: string;
  resetSignal: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !selectedBranch) return;
    if (!isValidIndonesianCoords(selectedBranch.lat, selectedBranch.lng)) return;
    map.panTo({ lat: selectedBranch.lat, lng: selectedBranch.lng });
    const currentZoom = map.getZoom() ?? 5;
    if (currentZoom < 12) {
      map.setZoom(13);
    }
  }, [map, selectedBranch?.id]);

  useEffect(() => {
    if (!map) return;
    if (resetSignal > 0 && activeRegionFilter === 'ALL') {
      map.panTo(INDONESIA_CENTER);
      map.setZoom(5);
    }
  }, [map, resetSignal, activeRegionFilter]);

  return null;
}

function IndonesiaBranchMapWithApi({
  branches,
  selectedBranchId,
  onSelectBranch,
  activeRegionFilter,
  onSelectRegionFilter,
  livePlacePoint,
}: Omit<IndonesiaBranchMapProps, 'mapsApiKey'>) {
  const map = useMap();
  const [zoom, setZoom] = useState(5);
  const [infoOpenBranchId, setInfoOpenBranchId] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

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
    const prioritized = [...validBranches].sort((a, b) => {
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
    return prioritized.slice(0, 90);
  }, [validBranches, selectedBranchId, showClusters]);

  const gbpPinPoint = useMemo(() => {
    if (!selectedBranch) return null;
    const coordDisc = selectedBranch.discrepancies.find((d) => d.field === 'coordinates');
    const lat = livePlacePoint?.lat ?? selectedBranch.gbpLat ?? coordDisc?.gbpLat;
    const lng = livePlacePoint?.lng ?? selectedBranch.gbpLng ?? coordDisc?.gbpLng;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !isValidIndonesianCoords(lat, lng)) {
      return null;
    }
    if (isValidIndonesianCoords(selectedBranch.lat, selectedBranch.lng)) {
      const dist = calculateDistanceMeters(selectedBranch.lat, selectedBranch.lng, lat, lng);
      if (dist <= 10) return null;
    }
    return { lat, lng, label: livePlacePoint?.label || `Lokasi Asli Google Maps (${selectedBranch.name})` };
  }, [selectedBranch, livePlacePoint]);

  const handleCameraChanged = useCallback((ev: MapCameraChangedEvent) => {
    if (typeof ev.detail.zoom === 'number') {
      setZoom(ev.detail.zoom);
    }
  }, []);

  const handleZoomIn = () => {
    if (!map) return;
    map.setZoom(Math.min(18, (map.getZoom() ?? 5) + 2));
  };

  const handleZoomOut = () => {
    if (!map) return;
    map.setZoom(Math.max(4, (map.getZoom() ?? 5) - 2));
  };

  const handleResetView = () => {
    onSelectRegionFilter('ALL');
    setInfoOpenBranchId(null);
    setResetSignal((n) => n + 1);
    if (map) {
      map.panTo(INDONESIA_CENTER);
      map.setZoom(5);
    }
  };

  return (
    <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-[#1a1b22]">
            Peta Google Maps Jaringan BRI
          </h3>
          <p className="text-xs text-[#64748b]">
            {showClusters
              ? 'Klik klaster wilayah atau perbesar peta untuk melihat pin cabang riil'
              : `Menampilkan ${visiblePins.length.toLocaleString('id-ID')} titik unit BRI di Google Maps`}
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

      {/* Explicit sized container for Google Maps (prevents 0x0 collapse) */}
      <div className="relative h-[340px] sm:h-[380px] w-full rounded-2xl bg-[#f4f2fc] border border-[#e2e8f0] overflow-hidden">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          defaultCenter={
            selectedBranch && isValidIndonesianCoords(selectedBranch.lat, selectedBranch.lng)
              ? { lat: selectedBranch.lat, lng: selectedBranch.lng }
              : INDONESIA_CENTER
          }
          defaultZoom={
            selectedBranch && isValidIndonesianCoords(selectedBranch.lat, selectedBranch.lng)
              ? 12
              : 5
          }
          gestureHandling="greedy"
          mapTypeControl={false}
          streetViewControl={false}
          onCameraChanged={handleCameraChanged}
          onClick={() => setInfoOpenBranchId(null)}
          style={{ width: '100%', height: '100%' }}
        >
          <MapViewportSync
            selectedBranch={selectedBranch}
            activeRegionFilter={activeRegionFilter}
            resetSignal={resetSignal}
          />

          {showClusters &&
            clusters.map((cluster) => (
              <AdvancedMarker
                key={cluster.regionShort}
                position={{ lat: cluster.lat, lng: cluster.lng }}
                title={`${cluster.regionShort}: ${cluster.count} unit BRI`}
                onClick={() => {
                  onSelectRegionFilter(cluster.regionShort);
                  onSelectBranch(cluster.representativeId);
                  if (map) {
                    map.panTo({ lat: cluster.lat, lng: cluster.lng });
                    map.setZoom(9);
                  }
                }}
              >
                <div className="px-2.5 py-1.5 rounded-full bg-[#00529C] text-white border-2 border-white shadow-md flex items-center gap-1.5 cursor-pointer hover:bg-[#004080] smooth-transition">
                  <span className="font-mono text-[11px] font-bold tabular-nums">
                    {cluster.count}
                  </span>
                  <span className="text-[10px] font-medium whitespace-nowrap">
                    {cluster.regionShort.replace('RO ', '')}
                  </span>
                </div>
              </AdvancedMarker>
            ))}

          {!showClusters &&
            visiblePins.map((b) => (
              <BranchMarker
                key={b.id}
                branch={b}
                isSelected={b.id === selectedBranchId}
                infoOpen={b.id === infoOpenBranchId}
                onSelect={() => {
                  onSelectBranch(b.id);
                  setInfoOpenBranchId(b.id);
                }}
                onCloseInfo={() => setInfoOpenBranchId(null)}
              />
            ))}

          {gbpPinPoint && (
            <AdvancedMarker
              position={{ lat: gbpPinPoint.lat, lng: gbpPinPoint.lng }}
              title={gbpPinPoint.label}
              zIndex={60}
            >
              <Pin
                background="#dc2626"
                borderColor="#ffffff"
                glyphColor="#fde047"
                scale={1.15}
              />
            </AdvancedMarker>
          )}
        </GoogleMap>
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
          Perlu Tindakan / Titik Asli Maps
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#00529C]" />
          Cabang Dipilih (Master BRI)
        </span>
      </div>
    </div>
  );
}

export function IndonesiaBranchMap(props: IndonesiaBranchMapProps) {
  if (!props.mapsApiKey) {
    return (
      <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] space-y-4">
        <div>
          <h3 className="font-display text-base font-semibold text-[#1a1b22]">
            Peta Google Maps Jaringan BRI
          </h3>
          <p className="text-xs text-[#64748b]">Menyiapkan koneksi Google Maps Platform...</p>
        </div>
        <div className="h-[340px] sm:h-[380px] w-full rounded-2xl bg-[#f4f2fc] border border-[#e2e8f0] flex flex-col items-center justify-center p-6 text-center space-y-2">
          <p className="font-display text-sm font-semibold text-[#1a1b22]">
            Menyiapkan Koneksi Google Maps Platform
          </p>
          <p className="text-xs text-[#64748b] max-w-sm">
            Kunci API Google Maps sedang dimuat. Pastikan konfigurasi Maps aktif di lingkungan aplikasi.
          </p>
        </div>
      </div>
    );
  }

  return <IndonesiaBranchMapWithApi {...props} />;
}
