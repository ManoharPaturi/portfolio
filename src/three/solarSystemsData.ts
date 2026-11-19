import {
  ARCHIVE_REPOS,
  FLAGSHIP_PROJECTS,
  IDENTITY,
  OSS_ORGANIZATIONS,
} from '../data/manoharData';
import type { PlanetTextureStyle } from './proceduralTextures';

export type SolarSystemId = 'projects' | 'oss' | 'archive' | 'connect';

export type SpacePhenomenonType =
  | 'solar-system'
  | 'black-hole'
  | 'nebula-cluster'
  | 'relay-station';

export interface CelestialPlanetSpec {
  id: string;
  systemId: SolarSystemId;
  label: string;
  sublabel: string;
  orbitRadius: number;
  orbitSpeed: number;
  initialAngle: number;
  inclination: number;
  radius: number;
  style: PlanetTextureStyle;
  baseHex: string;
  accentHex: string;
  deepHex: string;
  hasRing?: boolean;
  ringColor?: string;
  moonCount?: number;
  clusterPosition?: [number, number, number];
  bodyArchetype?: 'planet' | 'accretion-node' | 'nebula-star' | 'relay-satellite';
  payloadType: 'project' | 'oss-org' | 'archive-lang' | 'connect-node';
  payloadId: string;
}

export interface SolarSystemSpec {
  id: SolarSystemId;
  phenomenon: SpacePhenomenonType;
  phenomenonLabel: string;
  sectorCode: string;
  title: string;
  subtitle: string;
  metricBadge: string;
  /** Perspective-verified physical scale: Nebula (1.88) > Black Hole (1.38) > Solar System (0.78) > Observatory Station (0.44) */
  visualScale: number;
  center: [number, number, number];
  cameraOffset: [number, number, number];
  starRadius: number;
  starPrimaryHex: string;
  starSecondaryHex: string;
  starGlowRgba: string;
  starMidRgba: string;
  accentHex: string;
  planets: CelestialPlanetSpec[];
}

// Cinematic wide framing where real-life astronomical scale hierarchy reads unmistakably at first glance
export const GALAXY_OVERVIEW_CAMERA = {
  position: [0, 22, 106] as [number, number, number],
  target: [-2, 0, 0] as [number, number, number],
};

const PROJECT_PLANET_PALETTES: Array<{
  style: PlanetTextureStyle;
  base: string;
  accent: string;
  deep: string;
  ring?: boolean;
  ringColor?: string;
  moons?: number;
}> = [
  { style: 'gas-giant', base: '#C88446', accent: '#F3DEC0', deep: '#633B1C', ring: true, ringColor: '#E8B86D', moons: 1 },
  { style: 'metallic', base: '#3A4659', accent: '#E8B86D', deep: '#111827', ring: true, ringColor: '#9AA6BA', moons: 1 },
  { style: 'terrestrial', base: '#244A7C', accent: '#B8D4F5', deep: '#0E1C33', moons: 2 },
  { style: 'contour', base: '#4C586B', accent: '#E8C589', deep: '#1B2332', moons: 1 },
  { style: 'terrestrial', base: '#1E5B58', accent: '#99D5CF', deep: '#0F2E2D' },
  { style: 'volcanic', base: '#8B4527', accent: '#F0B68A', deep: '#35170D' },
  { style: 'ice', base: '#2C6F94', accent: '#DFF1FA', deep: '#0F3047' },
  { style: 'metallic', base: '#5E6C80', accent: '#D1DAE6', deep: '#1E2736' },
  { style: 'volcanic', base: '#9A5B2C', accent: '#F2CFA0', deep: '#3E2210' },
  { style: 'contour', base: '#5F6C7F', accent: '#E2E8F0', deep: '#1B2433', ring: true, ringColor: '#CBD5E1' },
];

const OSS_PALETTES: Array<{
  style: PlanetTextureStyle;
  base: string;
  accent: string;
  deep: string;
  ring?: boolean;
  ringColor?: string;
}> = [
  { style: 'gas-giant', base: '#2175A6', accent: '#CFEBFD', deep: '#0A253B', ring: true, ringColor: '#7DD3FC' },
  { style: 'gas-giant', base: '#4654A3', accent: '#D0D8FA', deep: '#161C42', ring: true, ringColor: '#93A5F8' },
  { style: 'terrestrial', base: '#1C7863', accent: '#B8EFE0', deep: '#083329', ring: true, ringColor: '#6EE7C8' },
  { style: 'ice', base: '#266C85', accent: '#C6EEF9', deep: '#0F2E3B' },
  { style: 'metallic', base: '#5A697D', accent: '#DCE4EE', deep: '#1A222E' },
  { style: 'contour', base: '#3B66A8', accent: '#D6E6FA', deep: '#152A4D' },
  { style: 'metallic', base: '#44546B', accent: '#7DD3FC', deep: '#0E1726' },
  { style: 'ice', base: '#1C5E87', accent: '#DCF2FC', deep: '#0B2B42' },
  { style: 'terrestrial', base: '#1B7373', accent: '#B8F0EE', deep: '#0B3536' },
  { style: 'contour', base: '#5862A8', accent: '#D8DCF9', deep: '#1F244C' },
  { style: 'ice', base: '#206E96', accent: '#E3F4FC', deep: '#0B3045' },
  { style: 'metallic', base: '#4E5563', accent: '#D4D9E2', deep: '#161920' },
  { style: 'volcanic', base: '#A66A36', accent: '#F8E3C2', deep: '#452811' },
];

// Asymmetric 3D volumetric star-nursery positions inside the Carina Archive Nebula
const NEBULA_CLUSTER_ANCHORS: Array<[number, number, number]> = [
  [-1.8, 1.2, 2.4],    // Python
  [5.8, 2.4, -1.6],    // TypeScript
  [-6.8, -1.8, -2.2],  // MATLAB
  [2.4, -3.6, 4.8],    // Dart
  [-8.4, 3.1, 3.2],    // HTML
  [7.6, -1.6, 3.8],    // C
  [-1.6, 4.6, -5.8],   // C++
  [6.2, 4.4, -6.2],    // Java
];

function buildArchiveNebulaNodes(): CelestialPlanetSpec[] {
  const counts = new Map<string, number>();
  for (const repo of ARCHIVE_REPOS) {
    counts.set(repo.language, (counts.get(repo.language) ?? 0) + 1);
  }
  const ordered = Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  // Realistic O/B/A/F/G/K stellar photosphere spectral tints
  const starColors: Array<{ base: string; accent: string; deep: string }> = [
    { base: '#FFE7C2', accent: '#FFF8EB', deep: '#D99352' }, // Warm G-star (Python)
    { base: '#B8D8FF', accent: '#F0F7FF', deep: '#5B94E5' }, // Blue-white B-star (TypeScript)
    { base: '#F5C4A1', accent: '#FFF1E6', deep: '#C96D4B' }, // K-giant (MATLAB)
    { base: '#C7EFE6', accent: '#F0FDF9', deep: '#4EA89B' }, // Cyan A-star (Dart)
    { base: '#FCE2AE', accent: '#FFFBEB', deep: '#C88D3B' }, // F-star (HTML)
    { base: '#D8CEFF', accent: '#F5F3FF', deep: '#7C6CD9' }, // Hot O-star (C)
    { base: '#BAE6FD', accent: '#F0F9FF', deep: '#3E8EC7' }, // Blue A-star (C++)
    { base: '#F7C9B0', accent: '#FFF3EC', deep: '#B86245' }, // Warm K-star (Java)
  ];

  return ordered.map(([lang, count], idx) => {
    const pal = starColors[idx % starColors.length];
    const anchor = NEBULA_CLUSTER_ANCHORS[idx] ?? [
      Math.cos(idx * 1.4) * 8,
      ((idx % 3) - 1) * 3,
      Math.sin(idx * 1.4) * 8,
    ];
    return {
      id: `archive-lang-${lang.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '')}`,
      systemId: 'archive',
      label: lang,
      sublabel: `${count} ${count === 1 ? 'repo' : 'repos'}`,
      orbitRadius: Math.hypot(anchor[0], anchor[2]),
      orbitSpeed: 0.04,
      initialAngle: Math.atan2(anchor[2], anchor[0]),
      inclination: 0,
      radius: Math.min(0.92, 0.42 + Math.sqrt(count) * 0.14),
      style: 'ice',
      baseHex: pal.base,
      accentHex: pal.accent,
      deepHex: pal.deep,
      clusterPosition: anchor,
      bodyArchetype: 'nebula-star',
      payloadType: 'archive-lang',
      payloadId: lang,
    };
  });
}

export const CONNECT_NODES = [
  {
    id: 'connect-about',
    label: 'About & Principles',
    sublabel: 'Amrita · AI Engineering',
    description: IDENTITY.bio,
  },
  {
    id: 'connect-github',
    label: 'GitHub',
    sublabel: '@ManoharPaturi',
    description: '22+ original builds and 107+ merged upstream pull requests across 13 organizations.',
    href: IDENTITY.githubUrl,
  },
  {
    id: 'connect-linkedin',
    label: 'LinkedIn',
    sublabel: 'in/manoharpaturi',
    description: 'Connect regarding funded research collaborations, AI/ML engineering internships, and systems roles.',
    href: IDENTITY.linkedinUrl,
  },
  {
    id: 'connect-email',
    label: 'Direct Transmission',
    sublabel: IDENTITY.email,
    description: 'Copy direct email or prepare a structured collaboration draft right from the observatory.',
    href: `mailto:${IDENTITY.email}`,
  },
];

// Asymmetric 3D Galactic Spiral Arm arrangement (dramatic depth + elevation, zero rigid 2x2 grid)
export const SOLAR_SYSTEMS: SolarSystemSpec[] = [
  {
    id: 'projects',
    phenomenon: 'solar-system',
    phenomenonLabel: 'Planetary System',
    sectorCode: 'SECTOR I · G2V',
    title: 'Projects',
    subtitle: 'Planetary System · 10 Flagship ML, Vision & Linux Builds',
    metricBadge: '10 Flagships',
    visualScale: 0.78,
    center: [-26, -15, 8],
    cameraOffset: [0, 10.2, 20.5],
    starRadius: 2.35,
    starPrimaryHex: '#E8B86D',
    starSecondaryHex: '#A66324',
    starGlowRgba: 'rgba(255, 238, 200, 0.92)',
    starMidRgba: 'rgba(232, 184, 109, 0.28)',
    accentHex: '#E8B86D',
    planets: FLAGSHIP_PROJECTS.map((proj, idx) => {
      const pal = PROJECT_PLANET_PALETTES[idx % PROJECT_PLANET_PALETTES.length];
      return {
        id: `planet-proj-${proj.id}`,
        systemId: 'projects',
        label: proj.shortLabel,
        sublabel: proj.domain,
        orbitRadius: 4.6 + idx * 1.46,
        orbitSpeed: 0.26 / (1 + idx * 0.24),
        initialAngle: idx * 0.92 + 0.35,
        inclination: ((idx % 5) - 2) * 0.055,
        radius: idx < 2 ? 1.02 : idx < 4 ? 0.85 : 0.65,
        style: pal.style,
        baseHex: pal.base,
        accentHex: pal.accent,
        deepHex: pal.deep,
        hasRing: pal.ring,
        ringColor: pal.ringColor,
        moonCount: pal.moons,
        bodyArchetype: 'planet',
        payloadType: 'project',
        payloadId: proj.id,
      };
    }),
  },
  {
    id: 'oss',
    phenomenon: 'black-hole',
    phenomenonLabel: 'Relativistic Quasar',
    sectorCode: 'SECTOR II · SGR-A*',
    title: 'Open Source',
    subtitle: 'Accretion Quasar · 107 Merged PRs Across 13 Upstream Orgs',
    metricBadge: '107 Merged PRs',
    visualScale: 1.38,
    center: [24, 13, -4],
    cameraOffset: [0, 15.5, 36.5],
    starRadius: 2.25,
    starPrimaryHex: '#7DD3FC',
    starSecondaryHex: '#4338CA',
    starGlowRgba: 'rgba(224, 242, 254, 0.92)',
    starMidRgba: 'rgba(125, 211, 252, 0.30)',
    accentHex: '#7DD3FC',
    planets: OSS_ORGANIZATIONS.map((org, idx) => {
      const pal = OSS_PALETTES[idx % OSS_PALETTES.length];
      const scaledRadius = Math.min(1.18, 0.44 + Math.log2(org.mergedPrs + 1) * 0.13);
      const armOffset = (idx % 2) * Math.PI;
      const armStep = Math.floor(idx / 2);
      const orbitRadius = 5.8 + armStep * 2.15 + (idx % 2) * 0.85;
      const spiralAngle = armOffset + armStep * 0.64 + 0.35;
      return {
        id: `planet-oss-${org.id}`,
        systemId: 'oss',
        label: org.organization,
        sublabel: `${org.mergedPrs} ${org.mergedPrs === 1 ? 'PR' : 'PRs'}`,
        orbitRadius,
        orbitSpeed: 0.3 / (1 + armStep * 0.28),
        initialAngle: spiralAngle,
        inclination: -0.22 + ((idx % 3) - 1) * 0.04,
        radius: scaledRadius,
        style: pal.style,
        baseHex: pal.base,
        accentHex: pal.accent,
        deepHex: pal.deep,
        hasRing: pal.ring,
        ringColor: pal.ringColor,
        bodyArchetype: 'accretion-node',
        payloadType: 'oss-org',
        payloadId: org.organization,
      };
    }),
  },
  {
    id: 'archive',
    phenomenon: 'nebula-cluster',
    phenomenonLabel: 'Emission Nebula',
    sectorCode: 'SECTOR III · NGC-3372',
    title: 'Archive',
    subtitle: 'Stellar Nursery · 22 Original Repositories Across 8 Languages',
    metricBadge: `${ARCHIVE_REPOS.length} Original Repos`,
    visualScale: 1.88,
    center: [-39, 12, -8],
    cameraOffset: [0, 14.5, 39.0],
    starRadius: 2.0,
    starPrimaryHex: '#E59876',
    starSecondaryHex: '#9F3A4B',
    starGlowRgba: 'rgba(255, 232, 210, 0.88)',
    starMidRgba: 'rgba(229, 152, 118, 0.26)',
    accentHex: '#E59876',
    planets: buildArchiveNebulaNodes(),
  },
  {
    id: 'connect',
    phenomenon: 'relay-station',
    phenomenonLabel: 'L2 Observatory',
    sectorCode: 'SECTOR IV · L2-RELAY',
    title: 'Connect',
    subtitle: 'Deep-Space Observatory · Principles & Direct Channels',
    metricBadge: 'Coimbatore · IN',
    visualScale: 0.44,
    center: [31, -16, 10],
    cameraOffset: [0, 4.4, 9.6],
    starRadius: 2.1,
    starPrimaryHex: '#F3DFC1',
    starSecondaryHex: '#C59247',
    starGlowRgba: 'rgba(255, 246, 224, 0.90)',
    starMidRgba: 'rgba(232, 184, 109, 0.24)',
    accentHex: '#E8B86D',
    planets: [
      {
        id: 'planet-connect-about',
        systemId: 'connect',
        label: 'About & Principles',
        sublabel: 'Observatory Log',
        orbitRadius: 5.4,
        orbitSpeed: 0.14,
        initialAngle: 0.6,
        inclination: 0.15,
        radius: 0.88,
        style: 'metallic',
        baseHex: '#334155',
        accentHex: '#E8B86D',
        deepHex: '#0F172A',
        bodyArchetype: 'relay-satellite',
        payloadType: 'connect-node',
        payloadId: 'connect-about',
      },
      {
        id: 'planet-connect-github',
        systemId: 'connect',
        label: 'GitHub',
        sublabel: '@ManoharPaturi',
        orbitRadius: 6.6,
        orbitSpeed: 0.11,
        initialAngle: 2.25,
        inclination: -0.14,
        radius: 0.86,
        style: 'metallic',
        baseHex: '#1E293B',
        accentHex: '#E2E8F0',
        deepHex: '#020617',
        bodyArchetype: 'relay-satellite',
        payloadType: 'connect-node',
        payloadId: 'connect-github',
      },
      {
        id: 'planet-connect-linkedin',
        systemId: 'connect',
        label: 'LinkedIn',
        sublabel: 'in/manoharpaturi',
        orbitRadius: 7.5,
        orbitSpeed: 0.095,
        initialAngle: 3.9,
        inclination: 0.12,
        radius: 0.84,
        style: 'ice',
        baseHex: '#0284C7',
        accentHex: '#7DD3FC',
        deepHex: '#0C4A6E',
        bodyArchetype: 'relay-satellite',
        payloadType: 'connect-node',
        payloadId: 'connect-linkedin',
      },
      {
        id: 'planet-connect-email',
        systemId: 'connect',
        label: 'Send a Note',
        sublabel: IDENTITY.email,
        orbitRadius: 8.5,
        orbitSpeed: 0.08,
        initialAngle: 5.4,
        inclination: -0.1,
        radius: 0.9,
        style: 'gas-giant',
        baseHex: '#C59247',
        accentHex: '#FFF4DE',
        deepHex: '#78350F',
        bodyArchetype: 'relay-satellite',
        payloadType: 'connect-node',
        payloadId: 'connect-email',
      },
    ],
  },
];

export function getSolarSystemById(id: SolarSystemId): SolarSystemSpec {
  const found = SOLAR_SYSTEMS.find((s) => s.id === id);
  if (!found) {
    throw new Error(`Unknown solar system: ${id}`);
  }
  return found;
}

export function computeOrbitalPosition(
  orbitRadius: number,
  angle: number,
  inclination: number,
): [number, number, number] {
  const x = Math.cos(angle) * orbitRadius;
  const z = Math.sin(angle) * orbitRadius;
  const y = Math.sin(angle) * orbitRadius * Math.sin(inclination);
  return [x, y, z];
}
