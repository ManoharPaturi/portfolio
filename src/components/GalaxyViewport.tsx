import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GalaxyScene } from '../three/GalaxyScene';
import {
  getSolarSystemById,
  SOLAR_SYSTEMS,
  type CelestialPlanetSpec,
  type SolarSystemId,
} from '../three/solarSystemsData';

interface GalaxyViewportProps {
  activeSystem: SolarSystemId | null;
  focusedPlanetId: string | null;
  paused: boolean;
  onSelectSystem: (systemId: SolarSystemId) => void;
  onSelectPlanet: (planet: CelestialPlanetSpec) => void;
}

export function GalaxyViewport({
  activeSystem,
  focusedPlanetId,
  paused,
  onSelectSystem,
  onSelectPlanet,
}: GalaxyViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<GalaxyScene | null>(null);
  const markerDomCache = useRef<Map<string, HTMLElement>>(new Map());
  const markerRefCallbacks = useRef<Map<string, (el: HTMLButtonElement | null) => void>>(new Map());
  const callbacksRef = useRef({ onSelectSystem, onSelectPlanet });
  callbacksRef.current = { onSelectSystem, onSelectPlanet };

  const [contextLost, setContextLost] = useState(false);

  // Mount WebGLRenderer once so HUD state updates never recreate the 3D scene
  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    const galaxy = new GalaxyScene(mountEl, {
      onSelectSystem: (sysId) => callbacksRef.current.onSelectSystem(sysId),
      onSelectPlanet: (planet) => callbacksRef.current.onSelectPlanet(planet),
      onContextLost: () => setContextLost(true),
    });
    sceneRef.current = galaxy;

    // Bind any callout DOM nodes that mounted before scene construction
    for (const [id, el] of markerDomCache.current.entries()) {
      galaxy.bindMarkerElement(id, el);
    }

    return () => {
      galaxy.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (focusedPlanetId) {
      scene.flyToPlanet(focusedPlanetId);
    } else if (activeSystem) {
      scene.flyToSystem(activeSystem);
    } else {
      scene.flyToOverview();
    }
  }, [activeSystem, focusedPlanetId]);

  useEffect(() => {
    sceneRef.current?.setPaused(paused);
  }, [paused]);

  const registerMarkerRef = useCallback((id: string) => {
    let cb = markerRefCallbacks.current.get(id);
    if (!cb) {
      cb = (el: HTMLButtonElement | null) => {
        if (el) {
          markerDomCache.current.set(id, el);
        } else {
          markerDomCache.current.delete(id);
        }
        sceneRef.current?.bindMarkerElement(id, el);
      };
      markerRefCallbacks.current.set(id, cb);
    }
    return cb;
  }, []);

  const activePlanets = useMemo(
    () => (activeSystem ? getSolarSystemById(activeSystem).planets : []),
    [activeSystem],
  );
  const activeAccentHex = useMemo(
    () => (activeSystem ? getSolarSystemById(activeSystem).accentHex : '#E8B86D'),
    [activeSystem],
  );

  return (
    <div
      data-testid="galaxy-viewport"
      data-active-system={activeSystem ?? 'overview'}
      className="relative h-screen w-screen overflow-hidden bg-[#03050B]"
    >
      {/* Dedicated isolated WebGL canvas container */}
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {/* Graceful fallback if WebGL context is unavailable */}
      {contextLost && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#03050B] p-6 text-center">
          <div className="max-w-md border border-white/[0.1] bg-[#070B14] p-6">
            <h2 className="font-display text-lg font-medium tracking-tight text-[#F4F6FA]">
              WebGL renderer paused
            </h2>
            <p className="mt-2 text-sm text-[#9AA6BA]">
              Use the navigation dock below to inspect all four cosmic systems directly.
            </p>
          </div>
        </div>
      )}

      {/* 60fps GPU-composited Astronomical Star-Chart Callouts (zero React state re-renders during animation!) */}
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {!activeSystem
          ? SOLAR_SYSTEMS.map((sys) => {
              const markerId = `sys-${sys.id}`;
              return (
                <button
                  key={markerId}
                  ref={registerMarkerRef(markerId)}
                  type="button"
                  onClick={() => onSelectSystem(sys.id)}
                  style={{ opacity: 0 }}
                  className="cosmos-marker-btn group absolute top-0 left-0 flex flex-col items-center text-center focus:outline-none"
                >
                  <span
                    className="cosmos-callout-shadow font-mono text-[9.5px] font-medium uppercase tracking-[0.2em] whitespace-nowrap opacity-85 transition-opacity group-hover:opacity-100"
                    style={{ color: sys.accentHex }}
                  >
                    {sys.sectorCode}
                  </span>
                  <span className="cosmos-callout-shadow mt-0.5 font-display text-[15px] font-semibold tracking-[-0.015em] text-[#F4F6FA] whitespace-nowrap transition-colors group-hover:text-white">
                    {sys.title}
                  </span>
                  <span className="cosmos-callout-shadow font-mono text-[10px] tracking-[0.04em] text-[#9AA6BA] whitespace-nowrap">
                    {sys.phenomenonLabel} · {sys.metricBadge}
                  </span>
                  <span
                    className="mt-1.5 h-4 w-px transition-all duration-200 group-hover:h-6"
                    style={{
                      background: `linear-gradient(to bottom, ${sys.accentHex}, transparent)`,
                    }}
                    aria-hidden="true"
                  />
                </button>
              );
            })
          : activePlanets.map((planet) => {
              const isSelected = focusedPlanetId === planet.id;
              return (
                <button
                  key={planet.id}
                  ref={registerMarkerRef(planet.id)}
                  type="button"
                  onClick={() => onSelectPlanet(planet)}
                  style={{ opacity: 0 }}
                  className="cosmos-marker-btn group absolute top-0 left-0 flex flex-col items-center text-center focus:outline-none"
                >
                  <span
                    className={`cosmos-callout-shadow flex items-baseline gap-1.5 border-b pb-0.5 transition-colors ${
                      isSelected
                        ? 'border-[#E8B86D] text-[#FFF8EB]'
                        : 'border-transparent text-[#F4F6FA]/95 group-hover:border-white/40 group-hover:text-white'
                    }`}
                  >
                    <span className="font-display text-[12px] font-medium tracking-[-0.01em] whitespace-nowrap">
                      {planet.label}
                    </span>
                    <span
                      className="font-mono text-[10px] tracking-[0.02em] whitespace-nowrap"
                      style={{ color: isSelected ? '#E8B86D' : '#9AA6BA' }}
                    >
                      {planet.sublabel}
                    </span>
                  </span>
                  <span
                    className="mt-1 h-2.5 w-px opacity-65 transition-all group-hover:h-3.5 group-hover:opacity-100"
                    style={{ backgroundColor: isSelected ? '#E8B86D' : activeAccentHex }}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
      </div>
    </div>
  );
}
