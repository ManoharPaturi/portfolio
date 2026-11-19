import type {
  ArchiveRepo,
  ArchiveSort,
  DomainFilter,
  FlagshipProject,
  GitHubApiRepo,
  InquiryFormInput,
  InquiryValidationResult,
  MergedPrEntry,
  OssOrgContribution,
  ProjectDomain,
} from '../types/portfolio';

export function filterFlagshipProjects(
  projects: readonly FlagshipProject[],
  domain: DomainFilter,
  query = '',
): FlagshipProject[] {
  const normalizedQuery = query.trim().toLowerCase();
  return projects.filter((project) => {
    if (domain !== 'All' && project.domain !== domain) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const haystack = [
      project.name,
      project.tagline,
      project.summary,
      project.domain,
      ...project.technologies,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function getArchiveLanguages(repos: readonly ArchiveRepo[]): string[] {
  const counts = new Map<string, number>();
  for (const repo of repos) {
    const lang = repo.language || 'Other';
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return [
    'All',
    ...Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([lang]) => lang),
  ];
}

export function filterAndSortArchive(
  repos: readonly ArchiveRepo[],
  language: string,
  query: string,
  sortBy: ArchiveSort,
): ArchiveRepo[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = repos.filter((repo) => {
    if (language !== 'All' && repo.language !== language) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const haystack = [
      repo.name,
      repo.owner,
      repo.description,
      repo.language,
      repo.domain,
      ...repo.topics,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const sorted = [...filtered];
  if (sortBy === 'recent') {
    sorted.sort((a, b) => b.pushedAt.localeCompare(a.pushedAt) || a.name.localeCompare(b.name));
  } else if (sortBy === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    sorted.sort((a, b) => a.domain.localeCompare(b.domain) || b.pushedAt.localeCompare(a.pushedAt));
  }
  return sorted;
}

export interface OssSummary {
  totalMergedPrs: number;
  organizationCount: number;
  maxOrgPrs: number;
  withShare: Array<OssOrgContribution & { sharePercent: number; barPercent: number }>;
}

export function computeOssSummary(orgs: readonly OssOrgContribution[]): OssSummary {
  const sorted = [...orgs].sort(
    (a, b) => b.mergedPrs - a.mergedPrs || a.organization.localeCompare(b.organization),
  );
  const totalMergedPrs = sorted.reduce((acc, item) => acc + item.mergedPrs, 0);
  const maxOrgPrs = sorted.reduce((max, item) => Math.max(max, item.mergedPrs), 0);

  return {
    totalMergedPrs,
    organizationCount: sorted.length,
    maxOrgPrs,
    withShare: sorted.map((item) => ({
      ...item,
      sharePercent: totalMergedPrs > 0 ? Number(((item.mergedPrs / totalMergedPrs) * 100).toFixed(1)) : 0,
      barPercent: maxOrgPrs > 0 ? Math.max(4, Math.round((item.mergedPrs / maxOrgPrs) * 100)) : 0,
    })),
  };
}

export function filterMergedPrs(
  prs: readonly MergedPrEntry[],
  organization: string,
): MergedPrEntry[] {
  if (organization === 'All') {
    return [...prs];
  }
  return prs.filter((pr) => pr.organization.toLowerCase() === organization.toLowerCase());
}

export function inferDomainFromRepo(repo: Pick<GitHubApiRepo, 'name' | 'description' | 'language' | 'topics'>): ProjectDomain {
  const text = `${repo.name} ${repo.description ?? ''} ${repo.language ?? ''} ${(repo.topics ?? []).join(' ')}`.toLowerCase();
  if (/(opencv|mediapipe|omr|sketch|vision|mocap|stereo|gan|image|camera)/.test(text)) {
    return 'Computer Vision';
  }
  if (/(posix|linux|os|gtk|syscall|socket|osi|c\+\+|kernel|system-calls|libzip|data-structures)/.test(text)) {
    return 'Systems & OS';
  }
  if (/(rag|agent|llm|ollama|gemma|qwen|chatbot|ai_made_easy|callpilot)/.test(text)) {
    return 'AI & Agents';
  }
  if (/(dqn|reinforcement|eeg|svd|admm|dmd|bio|matlab|signal|probabilistic)/.test(text)) {
    return 'Research & RL';
  }
  return 'Full-Stack';
}

export function mergeLiveGithubRepos(
  seedRepos: readonly ArchiveRepo[],
  apiRepos: readonly GitHubApiRepo[],
): ArchiveRepo[] {
  const byKey = new Map<string, ArchiveRepo>();
  for (const repo of seedRepos) {
    byKey.set(`${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}`, { ...repo });
  }

  for (const raw of apiRepos) {
    if (raw.fork) continue;
    if (!raw.name || raw.name.toLowerCase() === 'manoharpaturi') continue;
    const owner = raw.owner?.login || 'ManoharPaturi';
    const key = `${owner.toLowerCase()}/${raw.name.toLowerCase()}`;
    const existing = byKey.get(key);
    const pushedAt = raw.pushed_at ? raw.pushed_at.slice(0, 10) : existing?.pushedAt ?? '2026-01-01';

    if (existing) {
      byKey.set(key, {
        ...existing,
        description: raw.description?.trim() || existing.description,
        language: raw.language || existing.language,
        pushedAt,
        topics: raw.topics && raw.topics.length > 0 ? raw.topics : existing.topics,
        homepageUrl: raw.homepage?.trim() || existing.homepageUrl,
        stars: typeof raw.stargazers_count === 'number' ? raw.stargazers_count : existing.stars,
        forks: typeof raw.forks_count === 'number' ? raw.forks_count : existing.forks,
        source: 'github-live',
      });
    } else {
      byKey.set(key, {
        name: raw.name,
        owner,
        description: raw.description?.trim() || 'Original public repository on GitHub.',
        language: raw.language || 'Other',
        domain: inferDomainFromRepo(raw),
        pushedAt,
        topics: raw.topics ?? [],
        repoUrl: raw.html_url,
        homepageUrl: raw.homepage?.trim() || undefined,
        stars: raw.stargazers_count ?? 0,
        forks: raw.forks_count ?? 0,
        source: 'github-live',
      });
    }
  }

  return Array.from(byKey.values()).sort(
    (a, b) => b.pushedAt.localeCompare(a.pushedAt) || a.name.localeCompare(b.name),
  );
}

export function validateInquiryForm(input: InquiryFormInput): InquiryValidationResult {
  const errors: Partial<Record<keyof InquiryFormInput, string>> = {};
  const trimmedName = input.name.trim();
  const trimmedEmail = input.email.trim();
  const trimmedMessage = input.message.trim();

  if (trimmedName.length < 2) {
    errors.name = 'Please enter your name (at least 2 characters).';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.email = 'Please enter a valid email address.';
  }
  if (trimmedMessage.length < 12) {
    errors.message = 'Please include a short note (at least 12 characters).';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
