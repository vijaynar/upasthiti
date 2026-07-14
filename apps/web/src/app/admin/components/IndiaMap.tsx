'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';
import { ExternalLink } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

interface MapCityItem {
  city: string;
  count: number;
  lat?: number;
  lng?: number;
}

interface IndiaMapProps {
  mapData?: MapCityItem[];
}

export default function IndiaMap({ mapData = [] }: IndiaMapProps) {
  const { mode } = useTheme();
  const isLight = mode === 'light';
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [L, setL] = useState<any>(null);

  // Load Leaflet dynamically on the client side to avoid SSR errors
  useEffect(() => {
    import('leaflet').then((leafletModule) => {
      setL(leafletModule);
    });
  }, []);

  const getCityCount = (cityName: string, defaultVal: number) => {
    const found = mapData.find((item) => item.city.toUpperCase() === cityName.toUpperCase());
    return found ? found.count : defaultVal;
  };

  const isLoaded = !!L;
  const mapDataString = JSON.stringify(mapData);

  useEffect(() => {
    if (!L || !mapContainerRef.current) return;

    // Clean up previous map instance if it exists
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    // Centered around geographic middle of India with a perfect zoom level to show the full country
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false, // Prevents zoom hijack on page scroll
    }).setView([22.2, 78.96], 4.2);

    mapRef.current = map;

    // Embed standard full-color Google Maps Roadmap tile layer for both modes
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 18,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(map);

    const markersToRender = (mapData && mapData.length > 0)
      ? mapData.map((item) => ({
          name: item.city,
          coords: [item.lat || 20.5937, item.lng || 78.9629] as [number, number],
          count: item.count
        }))
      : [
          { name: 'Delhi', coords: [28.6139, 77.2090] as [number, number], count: 6 },
          { name: 'Mumbai', coords: [19.0760, 72.8777] as [number, number], count: 7 },
          { name: 'Pune', coords: [18.5204, 73.8567] as [number, number], count: 4 },
          { name: 'Hyderabad', coords: [17.3850, 78.4867] as [number, number], count: 8 }
        ];

    // Add city markers with standard high-clarity white labels as requested
    markersToRender.forEach((city) => {
      const markerHtml = `
        <div class="relative flex items-center justify-center pointer-events-auto" style="width: 24px; height: 24px;">
          <!-- Solid Circular Dot with Outer Halo -->
          <div class="w-6 h-6 rounded-full bg-indigo-600/20 border border-indigo-600/30 flex items-center justify-center hover:scale-110 transition-transform duration-200">
            <span class="w-2.5 h-2.5 rounded-full animate-ping bg-indigo-600 opacity-60 shrink-0 absolute"></span>
            <span class="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0"></span>
          </div>
          <!-- High-Clarity Label Badge -->
          <div class="absolute top-[-28px] left-[50%] translate-x-[-50%] border border-slate-300/80 bg-white rounded px-1.5 py-0.5 text-[8px] font-extrabold font-sans tracking-wide whitespace-nowrap z-25 shadow select-none" style="color: #1e293b; font-family: sans-serif;">
            ${city.name.toUpperCase()}: ${city.count}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-map-marker',
        html: markerHtml,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      L.marker(city.coords, { icon: customIcon }).addTo(map);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isLoaded, mapDataString]);

  const containerBg = isLight 
    ? 'bg-slate-100/50 border-slate-200 shadow-sm' 
    : 'bg-slate-950/20 border-white/5 shadow-inner';

  return (
    <div className={`relative w-full aspect-[4/5] max-w-[450px] rounded-2xl overflow-hidden border ${containerBg}`}>
      <style>{`
        .custom-map-marker {
          background: transparent !important;
          border: none !important;
          overflow: visible !important;
        }
        /* Custom stylings for Leaflet controls */
        .leaflet-bar {
          border: 1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)'} !important;
          box-shadow: ${isLight ? '0 1px 3px rgba(0,0,0,0.05)' : '0 4px 12px rgba(0,0,0,0.25)'} !important;
          background: ${isLight ? '#ffffff' : 'rgba(15,23,42,0.85)'} !important;
          border-radius: 8px !important;
          overflow: hidden;
        }
        .leaflet-bar a {
          background: transparent !important;
          color: ${isLight ? '#475569' : '#94a3b8'} !important;
          border-bottom: 1px solid ${isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'} !important;
          transition: all 0.2s ease;
        }
        .leaflet-bar a:hover {
          color: var(--primary) !important;
          background: ${isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)'} !important;
        }
      `}</style>

      {/* Interactive Map DOM element - color rendering remains native for maximum clarity */}
      <div 
        ref={mapContainerRef} 
        className="w-full h-full z-10" 
      />
    </div>
  );
}
