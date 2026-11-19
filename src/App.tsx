import { useCallback, useEffect, useState } from 'react';
import { GalaxyDock } from './components/GalaxyDock';
import { GalaxyViewport } from './components/GalaxyViewport';
import { SystemInspectorDrawer } from './components/SystemInspectorDrawer';
import type { CelestialPlanetSpec, SolarSystemId } from './three/solarSystemsData';

export default function App() {
  const [activeSystem, setActiveSystem] = useState<SolarSystemId | null>(null);
  const [focusedPlanet, setFocusedPlanet] = useState<CelestialPlanetSpec | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hudHidden, setHudHidden] = useState(false);

  const handleSelectOverview = useCallback(() => {
    setActiveSystem(null);
    setFocusedPlanet(null);
    setDrawerOpen(false);
  }, []);

  const handleSelectSystem = useCallback((systemId: SolarSystemId) => {
    setActiveSystem(systemId);
    setFocusedPlanet(null);
    setDrawerOpen(false);
  }, []);

  const handleSelectPlanet = useCallback((planet: CelestialPlanetSpec) => {
    setActiveSystem(planet.systemId);
    setFocusedPlanet(planet);
    setDrawerOpen(true);
  }, []);

  const handleOpenInspector = useCallback(() => {
    if (!activeSystem) {
      setActiveSystem('projects');
    }
    setDrawerOpen(true);
  }, [activeSystem]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (event.key === 'Escape') {
        if (drawerOpen) {
          setDrawerOpen(false);
          setFocusedPlanet(null);
        } else if (activeSystem !== null) {
          handleSelectOverview();
        }
        return;
      }

      if (isTyping) return;

      if (event.key === '0') {
        handleSelectOverview();
      } else if (event.key === '1') {
        handleSelectSystem('projects');
      } else if (event.key === '2') {
        handleSelectSystem('oss');
      } else if (event.key === '3') {
        handleSelectSystem('archive');
      } else if (event.key === '4') {
        handleSelectSystem('connect');
      } else if (event.key === ' ') {
        event.preventDefault();
        setPaused((prev) => !prev);
      } else if (event.key === 'h' || event.key === 'H') {
        setHudHidden((prev) => !prev);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSystem, drawerOpen, handleSelectOverview, handleSelectSystem]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#04060D] text-[#E6ECF5] select-none">
      <GalaxyViewport
        activeSystem={activeSystem}
        focusedPlanetId={focusedPlanet?.id ?? null}
        paused={paused}
        onSelectSystem={handleSelectSystem}
        onSelectPlanet={handleSelectPlanet}
      />

      <GalaxyDock
        activeSystem={activeSystem}
        paused={paused}
        hudHidden={hudHidden}
        drawerOpen={drawerOpen}
        onSelectOverview={handleSelectOverview}
        onSelectSystem={handleSelectSystem}
        onTogglePause={() => setPaused((prev) => !prev)}
        onToggleHud={() => setHudHidden((prev) => !prev)}
        onOpenInspector={handleOpenInspector}
      />

      <SystemInspectorDrawer
        open={drawerOpen}
        systemId={activeSystem ?? 'projects'}
        focusedPlanet={focusedPlanet}
        onClose={() => {
          setDrawerOpen(false);
          setFocusedPlanet(null);
        }}
        onFocusPlanet={(planet) => {
          setActiveSystem(planet.systemId);
          setFocusedPlanet(planet);
        }}
      />
    </main>
  );
}
