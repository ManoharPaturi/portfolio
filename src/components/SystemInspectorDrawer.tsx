import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  GitPullRequest,
  Github,
  Linkedin,
  Mail,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  ARCHIVE_REPOS,
  ENGINEERING_PRINCIPLES,
  FLAGSHIP_PROJECTS,
  IDENTITY,
  OSS_ORGANIZATIONS,
  VERIFIED_MERGED_PRS,
} from '../data/manoharData';
import type {
  ArchiveRepo,
  ArchiveSort,
  DomainFilter,
  GitHubApiRepo,
  InquiryFormInput,
} from '../types/portfolio';
import {
  computeOssSummary,
  filterAndSortArchive,
  filterFlagshipProjects,
  filterMergedPrs,
  getArchiveLanguages,
  mergeLiveGithubRepos,
  validateInquiryForm,
} from '../utils/portfolioLogic';
import {
  CONNECT_NODES,
  getSolarSystemById,
  type CelestialPlanetSpec,
  type SolarSystemId,
} from '../three/solarSystemsData';

interface SystemInspectorDrawerProps {
  open: boolean;
  systemId: SolarSystemId;
  focusedPlanet: CelestialPlanetSpec | null;
  onClose: () => void;
  onFocusPlanet: (planet: CelestialPlanetSpec) => void;
}

const DOMAIN_FILTERS: DomainFilter[] = [
  'All',
  'AI & Agents',
  'Systems & OS',
  'Computer Vision',
  'Research & RL',
];

const PR_ORG_FILTERS = ['All', 'Microsoft', 'Meta', 'Linux / liburing'];

export function SystemInspectorDrawer({
  open,
  systemId,
  focusedPlanet,
  onClose,
  onFocusPlanet,
}: SystemInspectorDrawerProps) {
  const systemSpec = getSolarSystemById(systemId);

  // Projects state
  const [projectDomain, setProjectDomain] = useState<DomainFilter>('All');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(FLAGSHIP_PROJECTS[0].id);

  // OSS state
  const [selectedOrgName, setSelectedOrgName] = useState<string>(OSS_ORGANIZATIONS[0].organization);
  const [prOrgFilter, setPrOrgFilter] = useState<string>('All');

  // Archive state
  const [repos, setRepos] = useState<ArchiveRepo[]>(ARCHIVE_REPOS);
  const [archiveLanguage, setArchiveLanguage] = useState<string>('All');
  const [archiveQuery, setArchiveQuery] = useState<string>('');
  const [archiveSort, setArchiveSort] = useState<ArchiveSort>('recent');
  const [syncState, setSyncState] = useState<'idle' | 'loading' | 'synced' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('');

  // Connect state
  const [activeConnectNode, setActiveConnectNode] = useState<string>('connect-about');
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [formState, setFormState] = useState<InquiryFormInput>({
    name: '',
    email: '',
    topic: 'Research / ML Collaboration',
    message: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof InquiryFormInput, string>>>({});
  const [draftPrepared, setDraftPrepared] = useState(false);

  // Sync drawer focus whenever the user clicks a 3D celestial body
  useEffect(() => {
    if (!focusedPlanet) return;
    if (focusedPlanet.payloadType === 'project') {
      setProjectDomain('All');
      setSelectedProjectId(focusedPlanet.payloadId);
    } else if (focusedPlanet.payloadType === 'oss-org') {
      setSelectedOrgName(focusedPlanet.payloadId);
      if (PR_ORG_FILTERS.includes(focusedPlanet.payloadId)) {
        setPrOrgFilter(focusedPlanet.payloadId);
      } else {
        setPrOrgFilter('All');
      }
    } else if (focusedPlanet.payloadType === 'archive-lang') {
      setArchiveLanguage(focusedPlanet.payloadId);
    } else if (focusedPlanet.payloadType === 'connect-node') {
      setActiveConnectNode(focusedPlanet.payloadId);
    }
  }, [focusedPlanet]);

  const filteredProjects = useMemo(
    () => filterFlagshipProjects(FLAGSHIP_PROJECTS, projectDomain),
    [projectDomain],
  );

  const activeProject = useMemo(() => {
    return (
      filteredProjects.find((p) => p.id === selectedProjectId) ??
      FLAGSHIP_PROJECTS.find((p) => p.id === selectedProjectId) ??
      filteredProjects[0] ??
      FLAGSHIP_PROJECTS[0]
    );
  }, [filteredProjects, selectedProjectId]);

  const ossSummary = useMemo(() => computeOssSummary(OSS_ORGANIZATIONS), []);
  const selectedOrg = useMemo(
    () =>
      ossSummary.withShare.find((o) => o.organization === selectedOrgName) ??
      ossSummary.withShare[0],
    [ossSummary, selectedOrgName],
  );
  const visiblePrs = useMemo(
    () => filterMergedPrs(VERIFIED_MERGED_PRS, prOrgFilter),
    [prOrgFilter],
  );

  const archiveLanguages = useMemo(() => getArchiveLanguages(repos), [repos]);
  const visibleRepos = useMemo(
    () => filterAndSortArchive(repos, archiveLanguage, archiveQuery, archiveSort),
    [repos, archiveLanguage, archiveQuery, archiveSort],
  );

  async function handleLiveGithubSync() {
    setSyncState('loading');
    setSyncMessage('');
    try {
      const response = await fetch(
        'https://api.github.com/users/ManoharPaturi/repos?per_page=100&sort=updated',
        { headers: { Accept: 'application/vnd.github+json' } },
      );
      if (!response.ok) {
        throw new Error(`GitHub returned ${response.status}`);
      }
      const payload = (await response.json()) as GitHubApiRepo[];
      const merged = mergeLiveGithubRepos(ARCHIVE_REPOS, payload);
      setRepos(merged);
      setSyncState('synced');
      setSyncMessage(`Synced ${merged.length} original repositories live from GitHub.`);
    } catch {
      setSyncState('error');
      setSyncMessage('GitHub public rate limit reached — displaying verified repository catalog.');
    }
  }

  async function handleCopyEmail() {
    try {
      await navigator.clipboard.writeText(IDENTITY.email);
      setCopiedEmail(true);
      window.setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      setCopiedEmail(false);
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateInquiryForm(formState);
    if (!validation.valid) {
      setFormErrors(validation.errors);
      setDraftPrepared(false);
      return;
    }
    setFormErrors({});
    setDraftPrepared(true);
  }

  function focusPlanetByPayload(payloadId: string) {
    const match = systemSpec.planets.find((p) => p.payloadId === payloadId);
    if (match) {
      onFocusPlanet(match);
    }
  }

  const mailtoHref = `mailto:${IDENTITY.email}?subject=${encodeURIComponent(
    `[${formState.topic}] Note from ${formState.name.trim()}`,
  )}&body=${encodeURIComponent(
    `From: ${formState.name.trim()} (${formState.email.trim()})\n\n${formState.message.trim()}`,
  )}`;

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-30 flex justify-end transition-all duration-200 ease-out ${
        open ? 'pointer-events-auto visible opacity-100' : 'pointer-events-none invisible opacity-0'
      }`}
    >
      {/* Semi-transparent click-away overlay (zero backdrop-blur for smooth WebGL) */}
      <button
        type="button"
        aria-label="Close inspector backdrop"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className="flex-1 bg-[#03050B]/45"
      />

      <aside
        role="dialog"
        aria-modal={open}
        aria-labelledby="inspector-drawer-title"
        style={{ willChange: 'transform' }}
        className={`flex h-full w-full max-w-[560px] flex-col border-l border-white/[0.09] bg-[#070B14] text-[#F4F6FA] shadow-[0_0_60px_rgba(0,0,0,0.85)] transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Editorial Drawer Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-5">
          <div className="min-w-0">
            <div
              className="font-mono text-[10px] font-medium uppercase tracking-[0.2em]"
              style={{ color: systemSpec.accentHex }}
            >
              {systemSpec.sectorCode} · {systemSpec.phenomenonLabel}
            </div>
            <h2
              id="inspector-drawer-title"
              className="mt-1.5 font-display text-[22px] font-semibold tracking-[-0.025em] text-[#F4F6FA]"
            >
              {systemId === 'projects' && activeProject.name}
              {systemId === 'oss' && 'Upstream Open-Source Ledger'}
              {systemId === 'archive' && 'Original Repository Archive'}
              {systemId === 'connect' && 'Identity & Direct Contact'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.03] text-[#9AA6BA] transition-colors hover:border-[#E8B86D]/70 hover:text-[#FFF8EB]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* 1. PROJECTS — PLANETARY SYSTEM */}
          {systemId === 'projects' && (
            <div className="space-y-6">
              {/* Domain filter tabs */}
              <div className="flex flex-wrap gap-1 border-b border-white/[0.08] pb-4">
                {DOMAIN_FILTERS.map((domain) => {
                  const active = projectDomain === domain;
                  return (
                    <button
                      key={domain}
                      type="button"
                      onClick={() => {
                        setProjectDomain(domain);
                        const nextList = filterFlagshipProjects(FLAGSHIP_PROJECTS, domain);
                        if (nextList.length > 0 && !nextList.some((p) => p.id === selectedProjectId)) {
                          setSelectedProjectId(nextList[0].id);
                          focusPlanetByPayload(nextList[0].id);
                        }
                      }}
                      className={`rounded-full px-3 py-1 text-[11.5px] font-medium whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-white/[0.1] text-[#FFF8EB]'
                          : 'text-[#8B98AE] hover:bg-white/[0.04] hover:text-[#F4F6FA]'
                      }`}
                    >
                      {domain}
                    </button>
                  );
                })}
              </div>

              {/* Flagship Planet Switcher */}
              <div>
                <div className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#7D8A9E]">
                  Orbiting Flagships ({filteredProjects.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {filteredProjects.map((proj) => {
                    const isCurrent = proj.id === activeProject.id;
                    return (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => {
                          setSelectedProjectId(proj.id);
                          focusPlanetByPayload(proj.id);
                        }}
                        className={`rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                          isCurrent
                            ? 'border-[#E8B86D]/80 bg-[#E8B86D]/10 text-[#FFF8EB]'
                            : 'border-white/[0.08] bg-white/[0.02] text-[#A8B4C7] hover:border-white/[0.18] hover:text-[#F4F6FA]'
                        }`}
                      >
                        {proj.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Project Dossier */}
              <article className="space-y-6 border-t border-white/[0.08] pt-6">
                {activeProject.imageUrl && (
                  <div className="overflow-hidden rounded-lg border border-white/[0.09] bg-[#040710]">
                    <img
                      src={activeProject.imageUrl}
                      alt={activeProject.imageAlt ?? activeProject.name}
                      className="aspect-video w-full object-cover"
                    />
                  </div>
                )}

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[#8B98AE]">
                    <span>{activeProject.repoFullName}</span>
                    <span>
                      {activeProject.domain} · {activeProject.year}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[15px] font-medium leading-relaxed text-[#F4F6FA]">
                    {activeProject.tagline}
                  </p>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-[#9AA6BA]">
                    {activeProject.summary}
                  </p>
                </div>

                <div className="space-y-4 border-y border-white/[0.08] py-5">
                  <div>
                    <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#E8B86D]">
                      Problem Statement
                    </h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#C8D1DF]">
                      {activeProject.problem}
                    </p>
                  </div>
                  <div className="pt-2">
                    <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#7DD3FC]">
                      System Architecture
                    </h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#C8D1DF]">
                      {activeProject.architecture}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#8B98AE]">
                    Engineering Notes
                  </h3>
                  <ul className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-[#C8D1DF]">
                    {activeProject.highlights.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#E8B86D]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border-t border-white/[0.08] pt-5">
                  <div className="font-mono text-[11.5px] tracking-[0.02em] text-[#8B98AE]">
                    {activeProject.technologies.join(' · ')}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <a
                      href={activeProject.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-[#E8B86D] px-4 py-2 text-[12px] font-semibold text-[#050810] transition-colors hover:bg-[#F2C984]"
                    >
                      <Github className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>View on GitHub</span>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                    <span className="font-mono text-[11px] text-[#7D8A9E]">
                      {activeProject.status}
                    </span>
                  </div>
                </div>
              </article>
            </div>
          )}

          {/* 2. OPEN SOURCE — ACCRETION QUASAR */}
          {systemId === 'oss' && (
            <div className="space-y-6">
              {/* Hairline Metric Row */}
              <div className="grid grid-cols-3 divide-x divide-white/[0.08] border-y border-white/[0.08] py-4">
                <div className="pr-4">
                  <div className="font-display text-[26px] font-semibold tabular-nums tracking-[-0.03em] text-[#7DD3FC]">
                    {ossSummary.totalMergedPrs}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B98AE]">
                    Merged PRs
                  </div>
                </div>
                <div className="px-4">
                  <div className="font-display text-[26px] font-semibold tabular-nums tracking-[-0.03em] text-[#F4F6FA]">
                    {ossSummary.organizationCount}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B98AE]">
                    Organizations
                  </div>
                </div>
                <div className="pl-4">
                  <div className="font-display text-[26px] font-semibold tabular-nums tracking-[-0.03em] text-[#E8B86D]">
                    12 mo
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B98AE]">
                    Verified span
                  </div>
                </div>
              </div>

              {/* Selected Org Spotlight */}
              <div className="rounded-lg border border-white/[0.09] bg-[#0B101D] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-[16px] font-semibold tracking-[-0.015em] text-[#F4F6FA]">
                      {selectedOrg.organization}
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[#9AA6BA]">
                      {selectedOrg.focusArea}
                    </p>
                  </div>
                  <div className="text-right font-mono text-[13px] font-medium tabular-nums text-[#7DD3FC] whitespace-nowrap">
                    {selectedOrg.mergedPrs} {selectedOrg.mergedPrs === 1 ? 'PR' : 'PRs'}
                  </div>
                </div>
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3">
                  <span className="font-mono text-[11px] text-[#C8D1DF]">
                    {selectedOrg.keyRepos.join(' · ')}
                  </span>
                  <a
                    href={selectedOrg.searchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-[#7DD3FC] hover:underline"
                  >
                    <span>Verify on GitHub</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              </div>

              {/* 13-Org Calibrated Bar Chart */}
              <div>
                <h3 className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#8B98AE]">
                  Distribution Across 13 Upstream Organizations
                </h3>
                <div className="space-y-1.5">
                  {ossSummary.withShare.map((org) => {
                    const isSelected = org.organization === selectedOrg.organization;
                    return (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => {
                          setSelectedOrgName(org.organization);
                          focusPlanetByPayload(org.organization);
                        }}
                        className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? 'border-[#7DD3FC]/60 bg-[#7DD3FC]/[0.07]'
                            : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.14]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 text-[12.5px]">
                          <span className="font-medium text-[#F4F6FA]">{org.organization}</span>
                          <span className="font-mono text-[11px] tabular-nums text-[#9AA6BA]">
                            {org.mergedPrs} · {org.sharePercent}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
                          <div
                            className="h-full rounded-full bg-[#7DD3FC]"
                            style={{ width: `${org.barPercent}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Verified Recent Merged PR Ledger */}
              <div className="border-t border-white/[0.08] pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#8B98AE]">
                    Verified Recent Merged PRs
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {PR_ORG_FILTERS.map((orgFilter) => (
                      <button
                        key={orgFilter}
                        type="button"
                        onClick={() => setPrOrgFilter(orgFilter)}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                          prOrgFilter === orgFilter
                            ? 'bg-white/[0.1] text-[#7DD3FC]'
                            : 'text-[#8B98AE] hover:text-[#F4F6FA]'
                        }`}
                      >
                        {orgFilter}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3.5 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                  {visiblePrs.map((pr) => (
                    <a
                      key={pr.id}
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block py-3.5 transition-colors hover:bg-white/[0.02]"
                    >
                      <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-[#8B98AE]">
                        <span className="flex items-center gap-1.5 text-[#7DD3FC]">
                          <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>
                            {pr.repo} #{pr.number}
                          </span>
                        </span>
                        <span className="tabular-nums">{pr.mergedDate}</span>
                      </div>
                      <div className="mt-1.5 text-[13.5px] font-medium leading-snug text-[#F4F6FA]">
                        {pr.title}
                      </div>
                      <div className="mt-1 font-mono text-[10.5px] text-[#7D8A9E]">
                        {pr.organization} · {pr.area}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. ARCHIVE — STELLAR NEBULA */}
          {systemId === 'archive' && (
            <div className="space-y-5">
              <div className="space-y-3 border-b border-white/[0.08] pb-5">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#647187]"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={archiveQuery}
                    onChange={(e) => setArchiveQuery(e.target.value)}
                    aria-label="Search repositories"
                    placeholder="Filter by repo, language, or topic — e.g. EEG, Wayland, PyTorch"
                    className="w-full rounded-lg border border-white/[0.1] bg-[#0B101D] py-2.5 pr-3.5 pl-10 text-[13.5px] text-[#F4F6FA] placeholder-[#5E6B80] transition-colors focus:border-[#E59876]/80 focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 font-mono text-[11px] text-[#8B98AE]">
                    <span>Sort</span>
                    <select
                      value={archiveSort}
                      onChange={(e) => setArchiveSort(e.target.value as ArchiveSort)}
                      className="rounded-md border border-white/[0.1] bg-[#0B101D] px-2.5 py-1 text-[11.5px] text-[#F4F6FA] focus:border-[#E59876]/80 focus:outline-none"
                    >
                      <option value="recent">Most recent</option>
                      <option value="name">Name (A–Z)</option>
                      <option value="domain">Domain</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={handleLiveGithubSync}
                    disabled={syncState === 'loading'}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] text-[#D4DCE8] transition-colors hover:border-[#E59876]/80 hover:text-[#FFF8EB] disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${syncState === 'loading' ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    <span>{syncState === 'loading' ? 'Syncing...' : 'Sync live GitHub'}</span>
                  </button>
                </div>

                {syncMessage && (
                  <p className="font-mono text-[11px] text-[#E59876]">{syncMessage}</p>
                )}

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {archiveLanguages.map((lang) => {
                    const active = archiveLanguage === lang;
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => {
                          setArchiveLanguage(lang);
                          if (lang !== 'All') {
                            focusPlanetByPayload(lang);
                          }
                        }}
                        className={`rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors ${
                          active
                            ? 'bg-[#E59876]/15 text-[#FBE3D3] ring-1 ring-[#E59876]/60'
                            : 'bg-white/[0.03] text-[#8B98AE] hover:text-[#F4F6FA]'
                        }`}
                      >
                        {lang}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="font-mono text-[11px] text-[#7D8A9E]">
                Showing {visibleRepos.length} of {repos.length} original repositories
              </div>

              <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
                {visibleRepos.map((repo) => (
                  <div key={`${repo.owner}/${repo.name}`} className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <a
                          href={repo.repoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-display text-[14.5px] font-semibold tracking-[-0.01em] text-[#F4F6FA] transition-colors hover:text-[#E59876]"
                        >
                          {repo.owner}/{repo.name}
                        </a>
                        <div className="mt-0.5 font-mono text-[11px] text-[#8B98AE]">
                          {repo.language} · {repo.domain} · {repo.pushedAt}
                        </div>
                      </div>
                      <a
                        href={repo.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${repo.name} on GitHub`}
                        className="shrink-0 text-[#7D8A9E] transition-colors hover:text-[#E59876]"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#B6C2D4]">
                      {repo.description}
                    </p>
                    {repo.topics.length > 0 && (
                      <div className="mt-2 font-mono text-[10.5px] text-[#647187]">
                        {repo.topics.join(' · ')}
                      </div>
                    )}
                  </div>
                ))}

                {visibleRepos.length === 0 && (
                  <div className="py-8 text-center text-[13.5px] text-[#8B98AE]">
                    No repositories match your current filter.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. CONNECT — L2 DEEP-SPACE OBSERVATORY */}
          {systemId === 'connect' && (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-1 border-b border-white/[0.08] pb-4">
                {CONNECT_NODES.map((node) => {
                  const active = activeConnectNode === node.id;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => {
                        setActiveConnectNode(node.id);
                        focusPlanetByPayload(node.id);
                      }}
                      className={`rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors ${
                        active
                          ? 'bg-white/[0.1] text-[#FFF8EB]'
                          : 'text-[#8B98AE] hover:bg-white/[0.04] hover:text-[#F4F6FA]'
                      }`}
                    >
                      {node.label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3">
                <div className="font-mono text-[11px] tracking-[0.04em] text-[#E8B86D]">
                  {IDENTITY.roleLine}
                </div>
                <p className="text-[13.5px] leading-relaxed text-[#C8D1DF]">{IDENTITY.bio}</p>
                <div className="font-mono text-[11px] text-[#7D8A9E]">
                  {IDENTITY.interests.join(' · ')}
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.03] px-3.5 py-2 text-[12px] font-medium text-[#F4F6FA] transition-colors hover:border-[#E8B86D]/80"
                  >
                    {copiedEmail ? (
                      <Check className="h-3.5 w-3.5 text-[#34D399]" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-[#E8B86D]" aria-hidden="true" />
                    )}
                    <span>{copiedEmail ? 'Email copied' : IDENTITY.email}</span>
                  </button>

                  <a
                    href={IDENTITY.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.03] px-3.5 py-2 text-[12px] font-medium text-[#F4F6FA] transition-colors hover:border-[#E8B86D]/80"
                  >
                    <Github className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>GitHub</span>
                  </a>

                  <a
                    href={IDENTITY.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.03] px-3.5 py-2 text-[12px] font-medium text-[#F4F6FA] transition-colors hover:border-[#E8B86D]/80"
                  >
                    <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>LinkedIn</span>
                  </a>
                </div>
              </div>

              <div className="space-y-3 border-t border-white/[0.08] pt-5">
                <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#8B98AE]">
                  Engineering Principles
                </h3>
                <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
                  {ENGINEERING_PRINCIPLES.map((principle) => (
                    <div key={principle.index} className="py-3.5">
                      <div className="flex items-baseline gap-3">
                        <span className="font-mono text-[11px] text-[#E8B86D]">{principle.index}</span>
                        <h4 className="font-display text-[14px] font-semibold tracking-[-0.01em] text-[#F4F6FA]">
                          {principle.title}
                        </h4>
                      </div>
                      <p className="mt-1.5 pl-6 text-[12.5px] leading-relaxed text-[#9AA6BA]">
                        {principle.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#8B98AE]">
                  Prepare Email Draft
                </h3>
                <form onSubmit={handleFormSubmit} noValidate className="mt-3.5 space-y-3.5">
                  <div>
                    <label htmlFor="connect-name" className="block text-[12px] font-medium text-[#C8D1DF]">
                      Your name
                    </label>
                    <input
                      id="connect-name"
                      type="text"
                      placeholder="e.g. Elena Vance"
                      value={formState.name}
                      onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#0B101D] px-3.5 py-2.5 text-[13.5px] text-[#F4F6FA] placeholder-[#5E6B80] transition-colors focus:border-[#E8B86D]/80 focus:outline-none"
                    />
                    {formErrors.name && (
                      <p role="alert" className="mt-1 text-[11.5px] text-[#FCA5A5]">
                        {formErrors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="connect-email" className="block text-[12px] font-medium text-[#C8D1DF]">
                      Email address
                    </label>
                    <input
                      id="connect-email"
                      type="email"
                      placeholder="elena@research-lab.org"
                      value={formState.email}
                      onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#0B101D] px-3.5 py-2.5 text-[13.5px] text-[#F4F6FA] placeholder-[#5E6B80] transition-colors focus:border-[#E8B86D]/80 focus:outline-none"
                    />
                    {formErrors.email && (
                      <p role="alert" className="mt-1 text-[11.5px] text-[#FCA5A5]">
                        {formErrors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="connect-topic" className="block text-[12px] font-medium text-[#C8D1DF]">
                      Subject
                    </label>
                    <select
                      id="connect-topic"
                      value={formState.topic}
                      onChange={(e) => setFormState((prev) => ({ ...prev, topic: e.target.value }))}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#0B101D] px-3.5 py-2.5 text-[13.5px] text-[#F4F6FA] transition-colors focus:border-[#E8B86D]/80 focus:outline-none"
                    >
                      <option value="Research / ML Collaboration">Research / ML Collaboration</option>
                      <option value="AI / Systems Internship or Role">AI / Systems Internship or Role</option>
                      <option value="Open-Source Contribution">Open-Source Contribution</option>
                      <option value="General Inquiry">General Inquiry</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="connect-message" className="block text-[12px] font-medium text-[#C8D1DF]">
                      Message
                    </label>
                    <textarea
                      id="connect-message"
                      rows={3}
                      placeholder="Share a research problem, systems engineering role, or collaboration note..."
                      value={formState.message}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, message: e.target.value }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#0B101D] px-3.5 py-2.5 text-[13.5px] text-[#F4F6FA] placeholder-[#5E6B80] transition-colors focus:border-[#E8B86D]/80 focus:outline-none"
                    />
                    {formErrors.message && (
                      <p role="alert" className="mt-1 text-[11.5px] text-[#FCA5A5]">
                        {formErrors.message}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-full bg-[#E8B86D] px-4.5 py-2.5 text-[12px] font-semibold text-[#050810] transition-colors hover:bg-[#F2C984]"
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Prepare email draft</span>
                  </button>

                  {draftPrepared && (
                    <div className="rounded-lg border border-[#34D399]/40 bg-[#071815] p-4 text-[12.5px] text-[#D1FAE5]">
                      <div className="font-medium">Email draft ready</div>
                      <p className="mt-1 text-[#A7F3D0]">
                        Open your default mail client with your formatted message pre-filled for{' '}
                        {IDENTITY.email}.
                      </p>
                      <a
                        href={mailtoHref}
                        className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11.5px] text-[#FFF8EB] underline"
                      >
                        <span>Open mail client</span>
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </div>
                  )}
                </form>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
