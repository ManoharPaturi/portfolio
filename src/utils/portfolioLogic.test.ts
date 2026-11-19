import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeOssSummary,
  filterAndSortArchive,
  filterFlagshipProjects,
  filterMergedPrs,
  getArchiveLanguages,
  mergeLiveGithubRepos,
  validateInquiryForm,
} from './portfolioLogic';
import {
  ARCHIVE_REPOS,
  FLAGSHIP_PROJECTS,
  OSS_ORGANIZATIONS,
  VERIFIED_MERGED_PRS,
} from '../data/manoharData';

test('filterFlagshipProjects filters accurately by domain and search text', () => {
  const systemsOnly = filterFlagshipProjects(FLAGSHIP_PROJECTS, 'Systems & OS');
  assert.ok(systemsOnly.length >= 2);
  assert.ok(systemsOnly.every((p) => p.domain === 'Systems & OS'));

  const searchResult = filterFlagshipProjects(FLAGSHIP_PROJECTS, 'All', 'wayland');
  assert.equal(searchResult.length, 1);
  assert.equal(searchResult[0].id, 'mano-os');
});

test('computeOssSummary matches verified 107 merged PRs across 13 organizations', () => {
  const summary = computeOssSummary(OSS_ORGANIZATIONS);
  assert.equal(summary.totalMergedPrs, 107);
  assert.equal(summary.organizationCount, 13);
  assert.equal(summary.withShare[0].organization, 'Microsoft');
  assert.equal(summary.withShare[0].barPercent, 100);
});

test('filterMergedPrs isolates organization PRs cleanly', () => {
  const metaPrs = filterMergedPrs(VERIFIED_MERGED_PRS, 'Meta');
  assert.ok(metaPrs.length >= 4);
  assert.ok(metaPrs.every((pr) => pr.organization === 'Meta'));

  const allPrs = filterMergedPrs(VERIFIED_MERGED_PRS, 'All');
  assert.equal(allPrs.length, VERIFIED_MERGED_PRS.length);
});

test('filterAndSortArchive supports language filtering, EEG search, and sorting', () => {
  const languages = getArchiveLanguages(ARCHIVE_REPOS);
  assert.equal(languages[0], 'All');
  assert.ok(languages.includes('Python'));
  assert.ok(languages.includes('C'));

  const eegRepos = filterAndSortArchive(ARCHIVE_REPOS, 'All', 'EEG', 'recent');
  assert.equal(eegRepos.length, 2);
  assert.ok(eegRepos.some((r) => r.name.includes('SVD-BASED-NOISE-REDUCTION')));

  const byName = filterAndSortArchive(ARCHIVE_REPOS, 'C', '', 'name');
  assert.equal(byName.length, 1);
  assert.equal(byName[0].name, 'File-Management-System-Using-Basic-System-Calls-in-C');
});

test('mergeLiveGithubRepos excludes forks and profile README while updating existing and adding new repos', () => {
  const merged = mergeLiveGithubRepos(ARCHIVE_REPOS, [
    {
      name: 'ManoharPaturi',
      owner: { login: 'ManoharPaturi' },
      fork: false,
      description: 'Profile README',
      language: 'Python',
      pushed_at: '2026-11-19T00:00:00Z',
      html_url: 'https://github.com/ManoharPaturi/ManoharPaturi',
    },
    {
      name: 'zstd',
      owner: { login: 'ManoharPaturi' },
      fork: true,
      description: 'Forked repo',
      language: 'C',
      pushed_at: '2026-11-18T00:00:00Z',
      html_url: 'https://github.com/ManoharPaturi/zstd',
    },
    {
      name: 'projX',
      owner: { login: 'ManoharPaturi' },
      fork: false,
      description: null,
      language: 'Dart',
      pushed_at: '2026-11-18T12:00:00Z',
      stargazers_count: 14,
      forks_count: 2,
      html_url: 'https://github.com/ManoharPaturi/projX',
    },
    {
      name: 'orbital-telemetry-c',
      owner: { login: 'ManoharPaturi' },
      fork: false,
      description: 'Low-level POSIX telemetry daemon',
      language: 'C',
      pushed_at: '2026-11-19T12:00:00Z',
      topics: ['posix', 'c'],
      html_url: 'https://github.com/ManoharPaturi/orbital-telemetry-c',
    },
  ]);

  assert.ok(!merged.some((r) => r.name === 'zstd'));
  assert.ok(!merged.some((r) => r.name === 'ManoharPaturi'));
  const updatedProjX = merged.find((r) => r.name === 'projX');
  assert.ok(updatedProjX);
  assert.equal(updatedProjX.stars, 14);
  assert.ok(updatedProjX.description.includes('OMR'));
  const added = merged.find((r) => r.name === 'orbital-telemetry-c');
  assert.ok(added);
  assert.equal(added.domain, 'Systems & OS');
});

test('validateInquiryForm rejects invalid inputs and accepts complete messages', () => {
  const invalid = validateInquiryForm({
    name: 'A',
    email: 'not-an-email',
    topic: 'Research',
    message: 'hi',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.name);
  assert.ok(invalid.errors.email);
  assert.ok(invalid.errors.message);

  const valid = validateInquiryForm({
    name: 'Ada Lovelace',
    email: 'ada@observatory.org',
    topic: 'Open Source',
    message: 'Would love to collaborate on systems tooling and ML evaluation.',
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
});
