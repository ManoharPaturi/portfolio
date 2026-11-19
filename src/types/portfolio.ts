export type ProjectDomain =
  | 'AI & Agents'
  | 'Computer Vision'
  | 'Systems & OS'
  | 'Research & RL'
  | 'Full-Stack';

export type DomainFilter = 'All' | ProjectDomain;

export interface FlagshipProject {
  id: string;
  name: string;
  shortLabel: string;
  repoFullName: string;
  tagline: string;
  summary: string;
  domain: ProjectDomain;
  technologies: string[];
  year: string;
  status: string;
  repoUrl: string;
  homepageUrl?: string;
  imageUrl?: string;
  imageAlt?: string;
  featuredSpan?: 'wide' | 'standard';
  orbitalRing: 1 | 2 | 3 | 4;
  orbitalAngleDeg: number;
  problem: string;
  architecture: string;
  highlights: string[];
}

export interface WorkbenchItem {
  id: string;
  projectId?: string;
  name: string;
  sector: string;
  status: string;
  note: string;
  nextStep: string;
  repoUrl: string;
}

export interface OssOrgContribution {
  id: string;
  organization: string;
  mergedPrs: number;
  focusArea: string;
  keyRepos: string[];
  searchUrl: string;
}

export interface MergedPrEntry {
  id: string;
  organization: string;
  repo: string;
  number: number;
  title: string;
  mergedDate: string;
  area: string;
  url: string;
}

export interface ArchiveRepo {
  name: string;
  owner: string;
  description: string;
  language: string;
  domain: ProjectDomain;
  pushedAt: string;
  topics: string[];
  repoUrl: string;
  homepageUrl?: string;
  stars: number;
  forks: number;
  source: 'curated' | 'github-live';
}

export type ArchiveSort = 'recent' | 'name' | 'domain';

export interface GitHubApiRepo {
  name: string;
  owner?: { login?: string };
  fork?: boolean;
  description: string | null;
  language: string | null;
  pushed_at: string | null;
  topics?: string[];
  html_url: string;
  homepage?: string | null;
  stargazers_count?: number;
  forks_count?: number;
}

export interface InquiryFormInput {
  name: string;
  email: string;
  topic: string;
  message: string;
}

export interface InquiryValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof InquiryFormInput, string>>;
}
