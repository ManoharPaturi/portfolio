import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeOrbitalPosition,
  GALAXY_OVERVIEW_CAMERA,
  getSolarSystemById,
  SOLAR_SYSTEMS,
} from './solarSystemsData';
import { FLAGSHIP_PROJECTS, OSS_ORGANIZATIONS } from '../data/manoharData';

test('SOLAR_SYSTEMS defines exactly four distinct suspended space systems and phenomena', () => {
  assert.equal(SOLAR_SYSTEMS.length, 4);
  assert.deepEqual(
    SOLAR_SYSTEMS.map((s) => s.id),
    ['projects', 'oss', 'archive', 'connect'],
  );
  assert.deepEqual(
    SOLAR_SYSTEMS.map((s) => s.phenomenon),
    ['solar-system', 'black-hole', 'nebula-cluster', 'relay-station'],
  );

  // Every solar system is well-separated in 3D space (> 30 units apart)
  for (let i = 0; i < SOLAR_SYSTEMS.length; i++) {
    for (let j = i + 1; j < SOLAR_SYSTEMS.length; j++) {
      const a = SOLAR_SYSTEMS[i].center;
      const b = SOLAR_SYSTEMS[j].center;
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      assert.ok(dist > 30, `Systems ${SOLAR_SYSTEMS[i].id} and ${SOLAR_SYSTEMS[j].id} too close: ${dist}`);
    }
  }
});

test('Projects and Open Source solar systems account for all verified projects and orgs', () => {
  const projectsSys = getSolarSystemById('projects');
  assert.equal(projectsSys.planets.length, FLAGSHIP_PROJECTS.length);

  const ossSys = getSolarSystemById('oss');
  assert.equal(ossSys.planets.length, OSS_ORGANIZATIONS.length);
  // Microsoft (53 PRs) has a larger planetary radius than a 1-PR org
  const ms = ossSys.planets.find((p) => p.label === 'Microsoft');
  const mistral = ossSys.planets.find((p) => p.label === 'Mistral AI');
  assert.ok(ms && mistral && ms.radius > mistral.radius);
});

test('computeOrbitalPosition calculates inclined circular orbit cleanly', () => {
  const [x0, y0, z0] = computeOrbitalPosition(10, 0, 0.2);
  assert.equal(Math.round(x0), 10);
  assert.equal(Math.round(y0), 0);
  assert.equal(Math.round(z0), 0);

  const [x1, y1, z1] = computeOrbitalPosition(10, Math.PI / 2, 0.5);
  assert.ok(Math.abs(x1) < 1e-6);
  assert.ok(Math.abs(z1 - 10) < 1e-6);
  assert.ok(y1 > 4);
});

test('All celestial planet IDs across all solar systems are strictly unique', () => {
  const allIds = SOLAR_SYSTEMS.flatMap((s) => s.planets.map((p) => p.id));
  const uniqueIds = new Set(allIds);
  assert.equal(uniqueIds.size, allIds.length);
  assert.ok(uniqueIds.has('archive-lang-c'));
  assert.ok(uniqueIds.has('archive-lang-cplusplus'));
});

test('Cosmic systems follow real-life physical AND perspective-apparent scale hierarchy: Nebula > Black Hole > Solar System > Observatory', () => {
  const archive = getSolarSystemById('archive');
  const oss = getSolarSystemById('oss');
  const projects = getSolarSystemById('projects');
  const connect = getSolarSystemById('connect');
  assert.ok(archive.visualScale > oss.visualScale);
  assert.ok(oss.visualScale > projects.visualScale);
  assert.ok(projects.visualScale > connect.visualScale);

  const cam = GALAXY_OVERVIEW_CAMERA.position;
  const apparent = (s: typeof archive) => {
    const dist = Math.hypot(s.center[0] - cam[0], s.center[1] - cam[1], s.center[2] - cam[2]);
    return s.visualScale / dist;
  };
  assert.ok(apparent(archive) > apparent(oss) * 1.15, 'Nebula must read clearly larger than Black Hole in overview');
  assert.ok(apparent(oss) > apparent(projects) * 1.45, 'Black Hole must read clearly larger than Solar System in overview');
  assert.ok(apparent(projects) > apparent(connect) * 1.55, 'Solar System must read clearly larger than Observatory in overview');
});


