import { ArrowLeft, Eye, EyeOff, Layers, Pause, Play } from 'lucide-react';
import {
  SOLAR_SYSTEMS,
  getSolarSystemById,
  type SolarSystemId,
} from '../three/solarSystemsData';

interface GalaxyDockProps {
  activeSystem: SolarSystemId | null;
  paused: boolean;
  hudHidden: boolean;
  drawerOpen: boolean;
  onSelectOverview: () => void;
  onSelectSystem: (systemId: SolarSystemId) => void;
  onTogglePause: () => void;
  onToggleHud: () => void;
  onOpenInspector: () => void;
}

const SYSTEM_SHORT_LABELS: Record<SolarSystemId, string> = {
  projects: 'Projects',
  oss: 'Open Source',
  archive: 'Archive',
  connect: 'Connect',
};

export function GalaxyDock({
  activeSystem,
  paused,
  hudHidden,
  drawerOpen,
  onSelectOverview,
  onSelectSystem,
  onTogglePause,
  onToggleHud,
  onOpenInspector,
}: GalaxyDockProps) {
  const currentSpec = activeSystem ? getSolarSystemById(activeSystem) : null;

  return (
    <>
      {/* Top Editorial Observatory Header (airier, zero heavy box clutter) */}
      <header className="pointer-events-none fixed top-0 left-0 right-0 z-20 flex items-start justify-between gap-4 px-5 py-5 sm:px-7 sm:py-6">
        <div className="pointer-events-auto flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onSelectOverview}
            className="group flex items-center gap-3 text-left focus:outline-none"
          >
            <span
              className="h-7 w-[2px] shrink-0 transition-colors"
              style={{ backgroundColor: currentSpec ? currentSpec.accentHex : '#E8B86D' }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="cosmos-callout-shadow font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-[#F4F6FA] whitespace-nowrap transition-colors group-hover:text-white">
                Manohar Paturi
              </div>
              <div className="cosmos-callout-shadow mt-0.5 font-mono text-[10.5px] tracking-[0.06em] text-[#9AA6BA] whitespace-nowrap">
                {currentSpec
                  ? `${currentSpec.sectorCode} · ${currentSpec.phenomenonLabel}`
                  : 'AI Engineering · Systems · Open Source'}
              </div>
            </div>
          </button>

          {currentSpec && (
            <button
              type="button"
              onClick={onSelectOverview}
              className="flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-[#070B14]/92 px-3.5 py-1.5 font-mono text-[11px] tracking-[0.04em] text-[#E6ECF5] whitespace-nowrap shrink-0 transition-colors hover:border-[#E8B86D]/70 hover:text-[#FFF8EB]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cosmos</span>
            </button>
          )}
        </div>

        {/* Quiet astronomical orientation readout on desktop (no chunky border box) */}
        {!hudHidden && !drawerOpen && (
          <div className="pointer-events-none hidden lg:flex flex-col items-end text-right">
            <span className="cosmos-callout-shadow font-mono text-[11px] tracking-[0.05em] text-[#D4DCE8]">
              {currentSpec
                ? currentSpec.subtitle
                : 'Planetary System · Quasar Black Hole · Emission Nebula · L2 Observatory'}
            </span>
            <span className="cosmos-callout-shadow mt-0.5 font-mono text-[10px] tracking-[0.08em] text-[#7D8A9E]">
              {currentSpec
                ? 'Select any orbiting body or satellite to inspect · Keys 0–4 navigate'
                : 'Drag to orbit · Scroll to zoom · Click any sector to warp · Press H for Zen view'}
            </span>
          </div>
        )}
      </header>

      {/* Bottom-Center Architectural Control Dock */}
      <nav
        aria-label="Cosmic sector navigation"
        className="pointer-events-none fixed bottom-5 left-1/2 z-20 flex w-full max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-col items-center"
      >
        {hudHidden ? (
          <button
            type="button"
            onClick={onToggleHud}
            aria-label="Show navigation controls"
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/[0.12] bg-[#070B14]/94 px-4 py-2 font-mono text-[11px] tracking-[0.06em] text-[#E6ECF5] whitespace-nowrap shrink-0 transition-colors hover:border-[#E8B86D]/80"
          >
            <Eye className="h-3.5 w-3.5 text-[#E8B86D]" aria-hidden="true" />
            <span>Show HUD (H)</span>
          </button>
        ) : (
          <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/[0.11] bg-[#070B14]/95 px-2 py-1.5 shadow-[0_14px_40px_rgba(0,0,0,0.65)]">
            <button
              type="button"
              onClick={onSelectOverview}
              aria-pressed={activeSystem === null}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium tracking-[0.01em] whitespace-nowrap shrink-0 transition-colors ${
                activeSystem === null
                  ? 'bg-white/[0.1] text-[#FFF8EB]'
                  : 'text-[#9AA6BA] hover:bg-white/[0.05] hover:text-[#F4F6FA]'
              }`}
            >
              Cosmos
            </button>

            {SOLAR_SYSTEMS.map((sys) => {
              const isActive = activeSystem === sys.id;
              return (
                <button
                  key={sys.id}
                  type="button"
                  onClick={() => onSelectSystem(sys.id)}
                  aria-pressed={isActive}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-medium tracking-[0.01em] whitespace-nowrap shrink-0 transition-colors ${
                    isActive
                      ? 'bg-white/[0.1] text-[#F4F6FA]'
                      : 'text-[#9AA6BA] hover:bg-white/[0.05] hover:text-[#F4F6FA]'
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: sys.accentHex }}
                    aria-hidden="true"
                  />
                  <span>{SYSTEM_SHORT_LABELS[sys.id]}</span>
                </button>
              );
            })}

            <div className="mx-1.5 h-4 w-px shrink-0 bg-white/[0.1]" aria-hidden="true" />

            <button
              type="button"
              onClick={onOpenInspector}
              className="flex items-center gap-1.5 rounded-full bg-[#E8B86D] px-3.5 py-1.5 text-[12px] font-semibold tracking-[0.01em] text-[#050810] whitespace-nowrap shrink-0 transition-colors hover:bg-[#F2C984]"
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{currentSpec ? `Inspect ${SYSTEM_SHORT_LABELS[currentSpec.id]}` : 'Inspect'}</span>
            </button>

            <button
              type="button"
              onClick={onTogglePause}
              aria-label={paused ? 'Resume orbital motion' : 'Pause orbital motion'}
              aria-pressed={paused}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#9AA6BA] shrink-0 transition-colors hover:bg-white/[0.06] hover:text-[#F4F6FA]"
              title="Pause / Resume motion (Space)"
            >
              {paused ? (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleHud}
              aria-label="Hide navigation controls"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#7D8A9E] shrink-0 transition-colors hover:bg-white/[0.06] hover:text-[#F4F6FA]"
              title="Zen mode / Hide HUD (H)"
            >
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </nav>
    </>
  );
}
