import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createBlackHoleBentArcMaterial,
  createBlackHoleDiskMaterial,
  createBlackHoleLensingMaterial,
  createRelativisticJetMaterial,
  createSolarCoronaMaterial,
  createStarfieldMaterial,
} from './cosmicShaders';
import {
  createDiffractionStarTexture,
  createGlowSpriteTexture,
  createHullPlatingTextures,
  createNebulaCloudTexture,
  createPlanetTextures,
  createRingTexture,
  createSolarPanelTexture,
  createStarTexture,
} from './proceduralTextures';
import {
  computeOrbitalPosition,
  GALAXY_OVERVIEW_CAMERA,
  getSolarSystemById,
  SOLAR_SYSTEMS,
  type CelestialPlanetSpec,
  type SolarSystemId,
  type SolarSystemSpec,
} from './solarSystemsData';

export interface ProjectedMarker {
  id: string;
  kind: 'system' | 'planet';
  systemId: SolarSystemId;
  sectorCode?: string;
  phenomenonLabel?: string;
  label: string;
  sublabel: string;
  accentHex: string;
  x: number;
  y: number;
  visible: boolean;
  planetSpec?: CelestialPlanetSpec;
}

export interface GalaxySceneCallbacks {
  onSelectSystem: (systemId: SolarSystemId) => void;
  onSelectPlanet: (planet: CelestialPlanetSpec) => void;
  onContextLost?: () => void;
}

interface RuntimeBody {
  spec: CelestialPlanetSpec;
  pivot: THREE.Group;
  spinMesh: THREE.Object3D;
  moons: Array<{ group: THREE.Group; speed: number }>;
  angle: number;
  baseClusterPos?: THREE.Vector3;
  bobPhase: number;
  beamLine?: THREE.Line;
  packetMesh?: THREE.Mesh;
  packetPhase?: number;
}

interface RuntimeSystem {
  spec: SolarSystemSpec;
  root: THREE.Group;
  coreSpinners: Array<{ obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }>;
  nebulaSprites: Array<{ sprite: THREE.Sprite; basePos: THREE.Vector3; phase: number; speed: number }>;
  stationSpireLocal?: THREE.Vector3;
  bodies: RuntimeBody[];
}

interface FilamentPulse {
  curve: THREE.QuadraticBezierCurve3;
  mesh: THREE.Mesh;
  speed: number;
  offset: number;
}

interface CometState {
  group: THREE.Group;
  start: THREE.Vector3;
  end: THREE.Vector3;
  speed: number;
  phase: number;
}

// Reusable module-scope scratch math helpers (zero GC inside render loop)
const _worldPos = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _tempA = new THREE.Vector3();
const _tempB = new THREE.Vector3();
const _color = new THREE.Color();

function detectSoftwareGl(): boolean {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) ?? '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class GalaxyScene {
  private container: HTMLElement;
  private callbacks: GalaxySceneCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private interactables: THREE.Object3D[] = [];
  private systems: RuntimeSystem[] = [];
  private animatedShaders: THREE.ShaderMaterial[] = [];
  private filamentPulses: FilamentPulse[] = [];
  private comets: CometState[] = [];
  private disposables: Array<{ dispose: () => void }> = [];

  private activeSystem: SolarSystemId | null = null;
  private activePlanetId: string | null = null;
  private paused = false;
  private disposed = false;

  // Camera flight state (no pointer parallax fighting OrbitControls!)
  private desiredCamPos = new THREE.Vector3(...GALAXY_OVERVIEW_CAMERA.position);
  private desiredTarget = new THREE.Vector3(...GALAXY_OVERVIEW_CAMERA.target);
  private isFlying = false;

  private markerElements = new Map<string, HTMLElement>();
  private markerVisCache = new Map<string, boolean>();
  private isPointerDown = false;
  private viewportWidth = 1;
  private viewportHeight = 1;

  private elapsedTime = 0;
  private lastTickTs = 0;
  private frameId = 0;
  private pointerDownPos = { x: 0, y: 0 };

  constructor(container: HTMLElement, callbacks: GalaxySceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    this.viewportWidth = width;
    this.viewportHeight = height;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03050b);
    this.scene.fog = new THREE.FogExp2(0x03050b, 0.0026);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.2, 620);
    this.computeOverviewCameraPos(width / height, this.desiredCamPos);
    this.camera.position.copy(this.desiredCamPos);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    // Adaptive DPR cap so 4K/Retina displays stay locked at 60fps with crisp detail
    const maxDpr = width * height > 2_000_000 ? 1.25 : 1.5;
    const pixelRatio = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, maxDpr);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = false;

    container.appendChild(this.renderer.domElement);

    // Studio RoomEnvironment reflections so titanium observatory, hex beryllium mirrors & metallic worlds gleam
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = envRT.texture;
    this.disposables.push(envRT);
    pmrem.dispose();

    // Calibrated 3-point celestial lighting (zero scene-wide PointLight PBR multiplier overhead!)
    const hemi = new THREE.HemisphereLight(0xb8d4ff, 0x0a1020, 0.85);
    this.scene.add(hemi);

    const keyDir = new THREE.DirectionalLight(0xfff1dc, 1.85);
    keyDir.position.set(36, 52, 46);
    this.scene.add(keyDir);

    const rimDir = new THREE.DirectionalLight(0x7dd3fc, 0.72);
    rimDir.position.set(-42, 18, -36);
    this.scene.add(rimDir);

    // OrbitControls — instant, silky-smooth inertial camera interaction
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...GALAXY_OVERVIEW_CAMERA.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.085;
    this.controls.rotateSpeed = 0.78;
    this.controls.zoomSpeed = 0.92;
    this.controls.minDistance = 4.2;
    this.controls.maxDistance = 220;
    this.controls.maxPolarAngle = Math.PI * 0.88;
    this.controls.addEventListener('start', this.onControlStart);
    this.controls.update();

    this.buildDeepStarfieldAndMilkyWay(pixelRatio);
    this.buildComets();
    this.buildGalacticFilaments();
    this.buildAllSpaceSystems(pixelRatio);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.lastTickTs = performance.now();
    this.renderOnceAndEmitMarkers();
    this.scheduleNextTick();
  }

  private onControlStart = () => {
    this.isFlying = false;
  };

  private bindEvents() {
    window.addEventListener('resize', this.handleResize);
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.handlePointerDown);
    el.addEventListener('pointerup', this.handlePointerUp);
    el.addEventListener('pointermove', this.handlePointerMove);
    el.addEventListener('webglcontextlost', this.handleContextLost);
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost?.();
  };

  private computeOverviewCameraPos(aspect: number, out: THREE.Vector3) {
    const [bx, by, bz] = GALAXY_OVERVIEW_CAMERA.position;
    const [tx, ty, tz] = GALAXY_OVERVIEW_CAMERA.target;
    const scale = aspect < 1.15 ? Math.min(2.15, 1.18 / Math.max(aspect, 0.54)) : 1;
    out.set(
      tx + (bx - tx) * scale,
      ty + (by - ty) * scale,
      tz + (bz - tz) * scale,
    );
  }

  public bindMarkerElement(id: string, el: HTMLElement | null) {
    if (el) {
      this.markerElements.set(id, el);
      this.markerVisCache.delete(id);
      this.updateMarkerPositions();
    } else {
      this.markerElements.delete(id);
      this.markerVisCache.delete(id);
    }
  }

  private handleResize = () => {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (!this.activeSystem && !this.activePlanetId) {
      this.computeOverviewCameraPos(this.camera.aspect, this.desiredCamPos);
      this.camera.position.copy(this.desiredCamPos);
      this.controls.target.set(...GALAXY_OVERVIEW_CAMERA.target);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    }
    this.updateMarkerPositions();
  };

  private handlePointerDown = (e: PointerEvent) => {
    this.isPointerDown = true;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private handlePointerUp = (e: PointerEvent) => {
    this.isPointerDown = false;
    const moved = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y,
    );
    if (moved > 6) return;

    const hit = this.pickInteractable(e);
    if (!hit) return;

    const { kind, systemId, planetSpec } = hit.userData as {
      kind: 'system' | 'planet';
      systemId: SolarSystemId;
      planetSpec?: CelestialPlanetSpec;
    };

    if (kind === 'system') {
      this.flyToSystem(systemId);
      this.callbacks.onSelectSystem(systemId);
    } else if (kind === 'planet' && planetSpec) {
      if (this.activeSystem !== systemId) {
        this.flyToSystem(systemId);
        this.callbacks.onSelectSystem(systemId);
      } else {
        this.flyToPlanet(planetSpec.id);
        this.callbacks.onSelectPlanet(planetSpec);
      }
    }
  };

  private lastHoverCheck = 0;
  private handlePointerMove = (e: PointerEvent) => {
    if (this.isPointerDown) return; // Zero raycast overhead during OrbitControls drag
    const now = performance.now();
    if (now - this.lastHoverCheck < 110) return;
    this.lastHoverCheck = now;
    const hit = this.pickInteractable(e);
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
  };

  private pickInteractable(e: PointerEvent): THREE.Object3D | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactables, false);
    return hits.length > 0 ? hits[0].object : null;
  }

  /**
   * 3,200 pinpoint stars with real spectral colors + subtle diagonal Milky Way galactic ribbon.
   */
  private buildDeepStarfieldAndMilkyWay(pixelRatio: number) {
    const count = 3200;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    const spectralPalette = [
      new THREE.Color('#9BB8FF'), // O/B blue-white
      new THREE.Color('#CADBFF'), // A white-blue
      new THREE.Color('#F8FAFC'), // F pure white
      new THREE.Color('#FFF2DC'), // G solar warm
      new THREE.Color('#FFD6A5'), // K amber
      new THREE.Color('#E8B86D'), // faint gold giant
    ];

    let seed = 9187;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < count; i++) {
      // 42% concentrated gently along a diagonal Milky Way band; 58% spherical deep sky
      const inBand = i < count * 0.42;
      const r = 175 + rand() * 210;
      const theta = rand() * Math.PI * 2;
      let x: number;
      let y: number;
      let z: number;

      if (inBand) {
        const bandSpread = (rand() - 0.5) * 0.34;
        const px = Math.cos(theta) * r;
        const pz = Math.sin(theta) * r;
        const py = bandSpread * r;
        // Tilt Milky Way plane diagonally across background
        const tilt = 0.44;
        x = px;
        y = py * Math.cos(tilt) - px * Math.sin(tilt) * 0.38;
        z = pz;
      } else {
        const phi = Math.acos(2 * rand() - 1);
        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.cos(phi) * 0.78;
        z = r * Math.sin(phi) * Math.sin(theta);
      }

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Realistic magnitude distribution: many tiny faint pinpoints, few bright beacons
      const mag = Math.pow(rand(), 3.2);
      sizes[i] = 1.2 + mag * 4.4;
      phases[i] = rand();

      const col = spectralPalette[Math.floor(rand() * spectralPalette.length)];
      const brightness = 0.52 + mag * 0.48;
      colors[i * 3] = col.r * brightness;
      colors[i * 3 + 1] = col.g * brightness;
      colors[i * 3 + 2] = col.b * brightness;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    const mat = createStarfieldMaterial();
    mat.uniforms.uPixelRatio.value = pixelRatio;
    this.animatedShaders.push(mat);

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this.disposables.push(geo, mat);

    // Subtle deep-background Milky Way dust veil (3 sprites to minimize alpha overdraw)
    const bandTexA = createNebulaCloudTexture('rgba(56, 84, 148, 0.11)', 'rgba(24, 36, 74, 0.06)', 1201);
    const bandTexB = createNebulaCloudTexture('rgba(166, 118, 86, 0.08)', 'rgba(32, 44, 88, 0.05)', 1207);
    this.disposables.push(bandTexA, bandTexB);

    for (let i = 0; i < 3; i++) {
      const sMat = new THREE.SpriteMaterial({
        map: i % 2 === 0 ? bandTexA : bandTexB,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(sMat);
      sp.position.set(-64 + i * 64, -14 + i * 16, -155 - (i % 2) * 24);
      sp.scale.set(96, 40, 1);
      this.scene.add(sp);
      this.disposables.push(sMat);
    }
  }

  /**
   * 3 living deep-space comets with luminous comas and tapering ion tails gliding across the sky.
   */
  private buildComets() {
    const headTex = createGlowSpriteTexture('rgba(255,255,255,0.95)', 'rgba(125,211,252,0.32)');
    this.disposables.push(headTex);

    const cometPaths: Array<{ start: [number, number, number]; end: [number, number, number]; speed: number; phase: number }> = [
      { start: [-95, 42, -55], end: [98, -14, -42], speed: 0.022, phase: 0.15 },
      { start: [88, 36, -68], end: [-84, -28, -28], speed: 0.017, phase: 0.62 },
      { start: [-62, -34, -48], end: [76, 38, -72], speed: 0.019, phase: 0.38 },
    ];

    const tailMat = new THREE.LineBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(tailMat);

    for (const cfg of cometPaths) {
      const group = new THREE.Group();
      const headMat = new THREE.SpriteMaterial({
        map: headTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const head = new THREE.Sprite(headMat);
      head.scale.setScalar(2.4);
      group.add(head);
      this.disposables.push(headMat);

      const start = new THREE.Vector3(...cfg.start);
      const end = new THREE.Vector3(...cfg.end);
      const dir = end.clone().sub(start).normalize();
      const tailGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        dir.clone().multiplyScalar(-9.5),
      ]);
      group.add(new THREE.Line(tailGeo, tailMat));
      this.disposables.push(tailGeo);

      group.position.copy(start).lerp(end, cfg.phase);
      this.scene.add(group);
      this.comets.push({ group, start, end, speed: cfg.speed, phase: cfg.phase });
    }
  }

  /**
   * Subtle astronomical transit arcs connecting the 4 cosmic systems with smoothly traveling photon pulses.
   */
  private buildGalacticFilaments() {
    const centers = SOLAR_SYSTEMS.map((s) => new THREE.Vector3(...s.center));
    // Connect along the sweeping spiral arm: Archive -> Projects -> Connect -> Open Source -> Archive
    const pairs: Array<[number, number]> = [
      [2, 0], // Archive Nebula -> Projects Solar System
      [0, 3], // Projects Solar System -> Connect Observatory
      [3, 1], // Connect Observatory -> Open Source Black Hole
      [1, 2], // Open Source Black Hole -> Archive Nebula
      [0, 1], // Projects -> Open Source diagonal
    ];

    const lineMat = new THREE.LineDashedMaterial({
      color: 0x3b4a66,
      dashSize: 1.2,
      gapSize: 2.2,
      transparent: true,
      opacity: 0.34,
    });
    const pulseGeo = new THREE.SphereGeometry(0.24, 10, 8);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0xfef3c7,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(lineMat, pulseGeo, pulseMat);

    pairs.forEach(([a, b], idx) => {
      const mid = centers[a].clone().lerp(centers[b], 0.5);
      mid.y += idx % 2 === 0 ? -4.2 : 3.6;
      const curve = new THREE.QuadraticBezierCurve3(centers[a], mid, centers[b]);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(44));
      const line = new THREE.Line(geo, lineMat);
      line.computeLineDistances();
      this.scene.add(line);
      this.disposables.push(geo);

      const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
      this.scene.add(pulseMesh);
      this.filamentPulses.push({
        curve,
        mesh: pulseMesh,
        speed: 0.055 + idx * 0.012,
        offset: idx * 0.21,
      });
    });
  }

  private buildAllSpaceSystems(pixelRatio: number) {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    for (let sIdx = 0; sIdx < SOLAR_SYSTEMS.length; sIdx++) {
      const spec = SOLAR_SYSTEMS[sIdx];
      let built: RuntimeSystem;
      if (spec.phenomenon === 'solar-system') {
        built = this.buildSolarSystem(spec, sIdx, maxAniso);
      } else if (spec.phenomenon === 'black-hole') {
        built = this.buildBlackHoleSystem(spec, sIdx, maxAniso);
      } else if (spec.phenomenon === 'nebula-cluster') {
        built = this.buildNebulaCluster(spec, sIdx, pixelRatio);
      } else {
        built = this.buildRelayStation(spec, sIdx, maxAniso);
      }
      // Apply real-life astronomical relative scale (Nebula > Black Hole > Solar System > Observatory)
      built.root.scale.setScalar(spec.visualScale);
      this.systems.push(built);
    }
  }

  private addSystemHitSphere(root: THREE.Group, radius: number, systemId: SolarSystemId) {
    const hitGeo = new THREE.SphereGeometry(radius, 12, 12);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.userData = { kind: 'system', systemId };
    root.add(hitMesh);
    this.interactables.push(hitMesh);
    this.disposables.push(hitGeo, hitMat);
  }

  private addBodyHitSphere(pivot: THREE.Group, radius: number, pSpec: CelestialPlanetSpec) {
    const pHitGeo = new THREE.SphereGeometry(Math.max(radius * 1.8, 1.25), 10, 10);
    const pHitMat = new THREE.MeshBasicMaterial({ visible: false });
    const pHitMesh = new THREE.Mesh(pHitGeo, pHitMat);
    pHitMesh.userData = { kind: 'planet', systemId: pSpec.systemId, planetSpec: pSpec };
    pivot.add(pHitMesh);
    this.interactables.push(pHitMesh);
    this.disposables.push(pHitGeo, pHitMat);
  }

  // 1. PROJECTS — PHOTOREALISTIC PLANETARY SOLAR SYSTEM
  private buildSolarSystem(
    spec: SolarSystemSpec,
    sIdx: number,
    maxAniso: number,
  ): RuntimeSystem {
    const root = new THREE.Group();
    root.position.set(...spec.center);
    this.scene.add(root);

    const starTex = createStarTexture(spec.starPrimaryHex, spec.starSecondaryHex, 101, maxAniso);
    const starGeo = new THREE.SphereGeometry(spec.starRadius, 32, 24);
    const starMat = new THREE.MeshBasicMaterial({ map: starTex });
    const starMesh = new THREE.Mesh(starGeo, starMat);
    root.add(starMesh);
    this.disposables.push(starTex, starGeo, starMat);

    // Custom Fresnel solar corona rim shader
    const coronaGeo = new THREE.SphereGeometry(spec.starRadius * 1.18, 28, 22);
    const coronaMat = createSolarCoronaMaterial(spec.starPrimaryHex);
    this.animatedShaders.push(coronaMat);
    root.add(new THREE.Mesh(coronaGeo, coronaMat));
    this.disposables.push(coronaGeo, coronaMat);

    const glowTex = createGlowSpriteTexture(spec.starGlowRgba, spec.starMidRgba);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.setScalar(spec.starRadius * 5.6);
    root.add(glowSprite);
    this.disposables.push(glowTex, glowMat);

    this.addSystemHitSphere(root, spec.starRadius * 2.0, spec.id);

    const orbitLineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(spec.accentHex),
      transparent: true,
      opacity: 0.19,
    });
    this.disposables.push(orbitLineMat);

    const bodies: RuntimeBody[] = [];
    for (let pIdx = 0; pIdx < spec.planets.length; pIdx++) {
      const pSpec = spec.planets[pIdx];

      const orbitPts: THREE.Vector3[] = [];
      for (let k = 0; k <= 72; k++) {
        const ang = (k / 72) * Math.PI * 2;
        const [ox, oy, oz] = computeOrbitalPosition(pSpec.orbitRadius, ang, pSpec.inclination);
        orbitPts.push(new THREE.Vector3(ox, oy, oz));
      }
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
      root.add(new THREE.Line(orbitGeo, orbitLineMat));
      this.disposables.push(orbitGeo);

      const pivot = new THREE.Group();
      const [ix, iy, iz] = computeOrbitalPosition(pSpec.orbitRadius, pSpec.initialAngle, pSpec.inclination);
      pivot.position.set(ix, iy, iz);
      root.add(pivot);

      const { map, bumpMap } = createPlanetTextures(
        pSpec.style,
        pSpec.baseHex,
        pSpec.accentHex,
        pSpec.deepHex,
        500 + sIdx * 100 + pIdx * 17,
        maxAniso,
      );
      const bodyGeo = new THREE.SphereGeometry(pSpec.radius, 28, 22);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map,
        bumpMap,
        bumpScale: 0.045,
        roughness: pSpec.style === 'metallic' ? 0.24 : pSpec.style === 'ice' ? 0.26 : 0.68,
        metalness: pSpec.style === 'metallic' ? 0.84 : pSpec.style === 'contour' ? 0.42 : 0.14,
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.rotation.z = 0.22;
      pivot.add(bodyMesh);
      this.disposables.push(map, bumpMap, bodyGeo, bodyMat);

      // Subtle atmospheric Fresnel glow
      const atmoGeo = new THREE.SphereGeometry(pSpec.radius * 1.07, 20, 16);
      const atmoMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(pSpec.accentHex),
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      pivot.add(new THREE.Mesh(atmoGeo, atmoMat));
      this.disposables.push(atmoGeo, atmoMat);

      if (pSpec.hasRing) {
        const rTex = createRingTexture(pSpec.ringColor || pSpec.accentHex, 'rgba(226,232,240,0.32)');
        const rGeo = new THREE.RingGeometry(pSpec.radius * 1.38, pSpec.radius * 2.18, 48);
        const posAttr = rGeo.attributes.position;
        const uvAttr = rGeo.attributes.uv;
        for (let v = 0; v < posAttr.count; v++) {
          const dist = Math.hypot(posAttr.getX(v), posAttr.getY(v));
          const u = (dist - pSpec.radius * 1.38) / (pSpec.radius * 0.8);
          uvAttr.setXY(v, THREE.MathUtils.clamp(u, 0, 1), 0.5);
        }
        const rMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: rTex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
          roughness: 0.46,
          metalness: 0.22,
          depthWrite: false,
        });
        const rMesh = new THREE.Mesh(rGeo, rMat);
        rMesh.rotation.x = Math.PI / 2 - 0.34;
        pivot.add(rMesh);
        this.disposables.push(rTex, rGeo, rMat);
      }

      const moons: Array<{ group: THREE.Group; speed: number }> = [];
      for (let m = 0; m < (pSpec.moonCount ?? 0); m++) {
        const mGroup = new THREE.Group();
        const mGeo = new THREE.SphereGeometry(pSpec.radius * 0.19, 12, 10);
        const mMat = new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.72, metalness: 0.22 });
        const mMesh = new THREE.Mesh(mGeo, mMat);
        mMesh.position.set(pSpec.radius * (1.75 + m * 0.52), m * 0.22, 0);
        mGroup.add(mMesh);
        mGroup.rotation.y = m * 2.1;
        pivot.add(mGroup);
        moons.push({ group: mGroup, speed: 0.85 + m * 0.5 });
        this.disposables.push(mGeo, mMat);
      }

      this.addBodyHitSphere(pivot, pSpec.radius, pSpec);
      bodies.push({
        spec: pSpec,
        pivot,
        spinMesh: bodyMesh,
        moons,
        angle: pSpec.initialAngle,
        bobPhase: pIdx,
      });
    }

    return {
      spec,
      root,
      coreSpinners: [{ obj: starMesh, axis: 'y', speed: 0.14 }],
      nebulaSprites: [],
      bodies,
    };
  }

  // 2. OPEN SOURCE — GARGANTUA RELATIVISTIC BLACK HOLE (Custom GLSL Disk + Fresnel Lensing + Smooth Gaussian Jets)
  private buildBlackHoleSystem(
    spec: SolarSystemSpec,
    sIdx: number,
    maxAniso: number,
  ): RuntimeSystem {
    const root = new THREE.Group();
    root.position.set(...spec.center);
    this.scene.add(root);

    const coreSpinners: RuntimeSystem['coreSpinners'] = [];

    // Pure pitch-black event horizon singularity
    const horizonGeo = new THREE.SphereGeometry(spec.starRadius * 0.96, 36, 28);
    const horizonMat = new THREE.MeshBasicMaterial({ color: 0x010205 });
    root.add(new THREE.Mesh(horizonGeo, horizonMat));
    this.disposables.push(horizonGeo, horizonMat);

    // Smooth Fresnel gravitational photon-ring lensing shell (replaces hard white Torus!)
    const lensGeo = new THREE.SphereGeometry(spec.starRadius * 1.18, 36, 28);
    const lensMat = createBlackHoleLensingMaterial();
    this.animatedShaders.push(lensMat);
    root.add(new THREE.Mesh(lensGeo, lensMat));
    this.disposables.push(lensGeo, lensMat);

    // Animated Gargantua GLSL swirling accretion disk (CircleGeometry skips corner overdraw!)
    const diskMat = createBlackHoleDiskMaterial();
    this.animatedShaders.push(diskMat);
    const diskGeo = new THREE.CircleGeometry(spec.starRadius * 5.3, 48);
    const diskMesh = new THREE.Mesh(diskGeo, diskMat);
    diskMesh.rotation.x = Math.PI / 2 - 0.22;
    root.add(diskMesh);

    // Lightweight zero-noise bent-light upper/lower gravitational lensing arc
    const bentArcMat = createBlackHoleBentArcMaterial();
    this.animatedShaders.push(bentArcMat);
    const bentDiskGeo = new THREE.CircleGeometry(spec.starRadius * 2.75, 40);
    const bentDiskMesh = new THREE.Mesh(bentDiskGeo, bentArcMat);
    bentDiskMesh.rotation.y = 0.18;
    root.add(bentDiskMesh);
    this.disposables.push(diskGeo, bentDiskGeo, diskMat, bentArcMat);

    // Smooth Gaussian-faded volumetric relativistic polar jets (ZERO hard cone edges!)
    const jetMat = createRelativisticJetMaterial();
    this.animatedShaders.push(jetMat);
    const jetGroup = new THREE.Group();
    jetGroup.rotation.x = -0.22;
    jetGroup.rotation.z = 0.08;

    const jetGeo = new THREE.CylinderGeometry(1.45, 0.22, 11.5, 24, 1, true);
    const northJet = new THREE.Mesh(jetGeo, jetMat);
    northJet.position.y = 6.3;
    jetGroup.add(northJet);

    const southJet = new THREE.Mesh(jetGeo, jetMat);
    southJet.position.y = -6.3;
    southJet.rotation.z = Math.PI;
    jetGroup.add(southJet);
    root.add(jetGroup);
    this.disposables.push(jetGeo, jetMat);

    // Subtle soft ice-blue ambient accretion halo
    const bhGlowTex = createGlowSpriteTexture('rgba(205,236,255,0.42)', 'rgba(96,165,250,0.16)');
    const bhGlowMat = new THREE.SpriteMaterial({
      map: bhGlowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const bhGlow = new THREE.Sprite(bhGlowMat);
    bhGlow.scale.setScalar(spec.starRadius * 6.8);
    root.add(bhGlow);
    this.disposables.push(bhGlowTex, bhGlowMat);

    this.addSystemHitSphere(root, spec.starRadius * 2.2, spec.id);

    // Fine logarithmic gravitational spiral trails
    const spiralGroup = new THREE.Group();
    const spiralMat = new THREE.LineBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(spiralMat);
    for (let arm = 0; arm < 2; arm++) {
      const pts: THREE.Vector3[] = [];
      const baseAngle = arm * Math.PI;
      for (let step = 0; step <= 72; step++) {
        const t = step / 72;
        const r = 4.2 + t * 17.5;
        const a = baseAngle + t * 4.4;
        const [sx, sy, sz] = computeOrbitalPosition(r, a, -0.22);
        pts.push(new THREE.Vector3(sx, sy, sz));
      }
      const sGeo = new THREE.BufferGeometry().setFromPoints(pts);
      spiralGroup.add(new THREE.Line(sGeo, spiralMat));
      this.disposables.push(sGeo);
    }
    root.add(spiralGroup);
    coreSpinners.push({ obj: spiralGroup, axis: 'y', speed: 0.04 });

    // 13 Upstream Orgs swirling along the relativistic accretion disk
    const bodies: RuntimeBody[] = [];
    for (let pIdx = 0; pIdx < spec.planets.length; pIdx++) {
      const pSpec = spec.planets[pIdx];
      const pivot = new THREE.Group();
      const [ix, iy, iz] = computeOrbitalPosition(pSpec.orbitRadius, pSpec.initialAngle, pSpec.inclination);
      pivot.position.set(ix, iy, iz);
      root.add(pivot);

      const { map, bumpMap } = createPlanetTextures(
        pSpec.style,
        pSpec.baseHex,
        pSpec.accentHex,
        pSpec.deepHex,
        600 + sIdx * 100 + pIdx * 19,
        maxAniso,
      );
      const bodyGeo = new THREE.SphereGeometry(pSpec.radius, 24, 18);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map,
        bumpMap,
        bumpScale: 0.035,
        roughness: 0.34,
        metalness: 0.36,
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      pivot.add(bodyMesh);
      this.disposables.push(map, bumpMap, bodyGeo, bodyMat);

      const wakeGeo = new THREE.SphereGeometry(pSpec.radius * 1.1, 16, 14);
      const wakeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(pSpec.accentHex),
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      pivot.add(new THREE.Mesh(wakeGeo, wakeMat));
      this.disposables.push(wakeGeo, wakeMat);

      if (pSpec.hasRing) {
        const rTex = createRingTexture(pSpec.ringColor || '#7DD3FC', 'rgba(186,230,253,0.22)');
        const rGeo = new THREE.RingGeometry(pSpec.radius * 1.35, pSpec.radius * 2.02, 40);
        const posAttr = rGeo.attributes.position;
        const uvAttr = rGeo.attributes.uv;
        for (let v = 0; v < posAttr.count; v++) {
          const dist = Math.hypot(posAttr.getX(v), posAttr.getY(v));
          const u = (dist - pSpec.radius * 1.35) / (pSpec.radius * 0.67);
          uvAttr.setXY(v, THREE.MathUtils.clamp(u, 0, 1), 0.5);
        }
        const rMat = new THREE.MeshBasicMaterial({
          map: rTex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const rMesh = new THREE.Mesh(rGeo, rMat);
        rMesh.rotation.x = Math.PI / 2 - 0.24;
        pivot.add(rMesh);
        this.disposables.push(rTex, rGeo, rMat);
      }

      this.addBodyHitSphere(pivot, pSpec.radius, pSpec);
      bodies.push({
        spec: pSpec,
        pivot,
        spinMesh: bodyMesh,
        moons: [],
        angle: pSpec.initialAngle,
        bobPhase: pIdx,
      });
    }

    return {
      spec,
      root,
      coreSpinners,
      nebulaSprites: [],
      bodies,
    };
  }

  // 3. ARCHIVE — WEBB CARINA-STYLE EMISSION NEBULA & JWST DIFFRACTION-SPIKE STAR CLUSTER
  private buildNebulaCluster(
    spec: SolarSystemSpec,
    sIdx: number,
    pixelRatio: number,
  ): RuntimeSystem {
    const root = new THREE.Group();
    root.position.set(...spec.center);
    this.scene.add(root);

    const nebulaSprites: RuntimeSystem['nebulaSprites'] = [];

    // Restrained Webb/Carina dust clouds (6 sculpted non-stacked sprites for monumental breadth with minimal fill-rate)
    const cloudPalettes: Array<[string, string]> = [
      ['rgba(214, 132, 84, 0.24)', 'rgba(134, 70, 42, 0.13)'],
      ['rgba(176, 74, 96, 0.20)', 'rgba(98, 38, 60, 0.11)'],
      ['rgba(82, 128, 178, 0.20)', 'rgba(40, 66, 114, 0.11)'],
      ['rgba(228, 174, 114, 0.19)', 'rgba(142, 96, 52, 0.10)'],
    ];
    const cloudTextures = cloudPalettes.map(([a, b], idx) =>
      createNebulaCloudTexture(a, b, 901 + idx * 53),
    );
    this.disposables.push(...cloudTextures);

    let nSeed = 4219 + sIdx * 97;
    const nRand = () => {
      nSeed = (nSeed * 16807) % 2147483647;
      return (nSeed - 1) / 2147483646;
    };

    const cloudAnchors: Array<[number, number, number, number]> = [
      [-6.5, 2.2, -3.0, 15.5],
      [6.2, -1.8, -2.5, 14.8],
      [-1.5, -2.8, 3.2, 13.6],
      [2.8, 3.6, -4.8, 14.2],
      [-8.2, -1.4, 2.4, 12.6],
      [7.4, 2.6, 2.8, 12.2],
    ];

    for (let i = 0; i < cloudAnchors.length; i++) {
      const [px, py, pz, sc] = cloudAnchors[i];
      const tex = cloudTextures[i % cloudTextures.length];
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(px, py, pz);
      sprite.scale.set(sc * 1.42, sc * 0.92, 1);
      root.add(sprite);
      nebulaSprites.push({
        sprite,
        basePos: new THREE.Vector3(px, py, pz),
        phase: nRand() * Math.PI * 2,
        speed: 0.18 + nRand() * 0.18,
      });
      this.disposables.push(mat);
    }

    // 650 crisp pinpoint twinkling cluster stars inside the nebula (replaces chunky octahedron confetti!)
    const clusterStarCount = 650;
    const cPos = new Float32Array(clusterStarCount * 3);
    const cSize = new Float32Array(clusterStarCount);
    const cPhase = new Float32Array(clusterStarCount);
    const cCol = new Float32Array(clusterStarCount * 3);

    const nurseryTints = [
      new THREE.Color('#FFE8C8'),
      new THREE.Color('#FFD2A6'),
      new THREE.Color('#C8E2FF'),
      new THREE.Color('#F8FAFC'),
    ];

    for (let i = 0; i < clusterStarCount; i++) {
      const u = nRand() * Math.PI * 2;
      const r = 1.2 + Math.pow(nRand(), 0.78) * 13.5;
      const y = (nRand() - 0.5) * 8.6;
      cPos[i * 3] = Math.cos(u) * r;
      cPos[i * 3 + 1] = y;
      cPos[i * 3 + 2] = Math.sin(u) * r * 0.85;

      const mag = Math.pow(nRand(), 2.4);
      cSize[i] = 0.75 + mag * 2.1;
      cPhase[i] = nRand();

      const tc = nurseryTints[Math.floor(nRand() * nurseryTints.length)];
      cCol[i * 3] = tc.r;
      cCol[i * 3 + 1] = tc.g;
      cCol[i * 3 + 2] = tc.b;
    }

    const clusterGeo = new THREE.BufferGeometry();
    clusterGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
    clusterGeo.setAttribute('aSize', new THREE.BufferAttribute(cSize, 1));
    clusterGeo.setAttribute('aPhase', new THREE.BufferAttribute(cPhase, 1));
    clusterGeo.setAttribute('aColor', new THREE.BufferAttribute(cCol, 3));

    const clusterMat = createStarfieldMaterial();
    clusterMat.uniforms.uPixelRatio.value = pixelRatio;
    this.animatedShaders.push(clusterMat);

    const clusterPoints = new THREE.Points(clusterGeo, clusterMat);
    root.add(clusterPoints);
    this.disposables.push(clusterGeo, clusterMat);

    this.addSystemHitSphere(root, 5.2, spec.id);

    // Hair-thin astrometry constellation filaments connecting the 8 language stars
    const starPositions = spec.planets.map(
      (p) => new THREE.Vector3(...(p.clusterPosition ?? [0, 0, 0])),
    );
    const webMat = new THREE.LineBasicMaterial({
      color: 0xe5c4a1,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(webMat);
    for (let i = 0; i < starPositions.length; i++) {
      const next = (i + 1) % starPositions.length;
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        starPositions[i],
        starPositions[next],
      ]);
      root.add(new THREE.Line(lineGeo, webMat));
      this.disposables.push(lineGeo);
      if (i > 0 && i < 4) {
        const hubGeo = new THREE.BufferGeometry().setFromPoints([
          starPositions[0],
          starPositions[i + 2],
        ]);
        root.add(new THREE.Line(hubGeo, webMat));
        this.disposables.push(hubGeo);
      }
    }

    // 8 Photorealistic Young Stellar Objects with JWST 6-point optical diffraction spikes & faint dust discs
    const spikeTex = createDiffractionStarTexture();
    this.disposables.push(spikeTex);

    const bodies: RuntimeBody[] = [];
    for (let pIdx = 0; pIdx < spec.planets.length; pIdx++) {
      const pSpec = spec.planets[pIdx];
      const anchor = starPositions[pIdx];
      const pivot = new THREE.Group();
      pivot.position.copy(anchor);
      root.add(pivot);

      const starNodeGroup = new THREE.Group();
      // Smooth incandescent stellar core sphere (replaces low-poly diamond!)
      const coreGeo = new THREE.SphereGeometry(pSpec.radius * 0.56, 20, 16);
      const coreMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(pSpec.accentHex),
      });
      starNodeGroup.add(new THREE.Mesh(coreGeo, coreMat));
      this.disposables.push(coreGeo, coreMat);

      // Subtle tilted proto-planetary accretion dust halo
      const dustRingTex = createRingTexture(pSpec.baseHex, 'rgba(255,255,255,0.08)');
      const dustRingGeo = new THREE.RingGeometry(pSpec.radius * 0.85, pSpec.radius * 1.75, 36);
      const posAttr = dustRingGeo.attributes.position;
      const uvAttr = dustRingGeo.attributes.uv;
      for (let v = 0; v < posAttr.count; v++) {
        const dist = Math.hypot(posAttr.getX(v), posAttr.getY(v));
        const u = (dist - pSpec.radius * 0.85) / (pSpec.radius * 0.9);
        uvAttr.setXY(v, THREE.MathUtils.clamp(u, 0, 1), 0.5);
      }
      const dustRingMat = new THREE.MeshBasicMaterial({
        map: dustRingTex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const dustRingMesh = new THREE.Mesh(dustRingGeo, dustRingMat);
      dustRingMesh.rotation.set(Math.PI / 2.6, pIdx * 0.5, 0.3);
      starNodeGroup.add(dustRingMesh);
      this.disposables.push(dustRingTex, dustRingGeo, dustRingMat);

      pivot.add(starNodeGroup);

      // JWST 6-point optical diffraction-spike starlight sprite
      const sMat = new THREE.SpriteMaterial({
        map: spikeTex,
        color: new THREE.Color(pSpec.baseHex),
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sSprite = new THREE.Sprite(sMat);
      sSprite.scale.setScalar(pSpec.radius * 6.2);
      pivot.add(sSprite);
      this.disposables.push(sMat);

      this.addBodyHitSphere(pivot, pSpec.radius * 1.35, pSpec);
      bodies.push({
        spec: pSpec,
        pivot,
        spinMesh: starNodeGroup,
        moons: [],
        angle: pSpec.initialAngle,
        baseClusterPos: anchor.clone(),
        bobPhase: pIdx * 1.15,
      });
    }

    return {
      spec,
      root,
      coreSpinners: [{ obj: clusterPoints, axis: 'y', speed: 0.018 }],
      nebulaSprites,
      bodies,
    };
  }

  // 4. CONNECT — AEROSPACE JWST / ENDURANCE L2 DEEP-SPACE OBSERVATORY STATION & 4 LASER-LINKED PROBES
  private buildRelayStation(
    spec: SolarSystemSpec,
    _sIdx: number,
    maxAniso: number,
  ): RuntimeSystem {
    const root = new THREE.Group();
    root.position.set(...spec.center);
    this.scene.add(root);

    const coreSpinners: RuntimeSystem['coreSpinners'] = [];

    const hullTextures = createHullPlatingTextures(maxAniso);
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0xdbe4f0,
      map: hullTextures.map,
      bumpMap: hullTextures.bumpMap,
      bumpScale: 0.03,
      metalness: 0.84,
      roughness: 0.28,
    });
    const darkCarbonMat = new THREE.MeshStandardMaterial({
      color: 0x161f30,
      map: hullTextures.map,
      bumpMap: hullTextures.bumpMap,
      bumpScale: 0.02,
      metalness: 0.76,
      roughness: 0.36,
    });
    const berylliumGoldMat = new THREE.MeshStandardMaterial({
      color: 0xe6b55c,
      metalness: 0.94,
      roughness: 0.14,
    });
    const sunshieldMat = new THREE.MeshStandardMaterial({
      color: 0x9aa8bd,
      metalness: 0.88,
      roughness: 0.22,
      side: THREE.DoubleSide,
    });
    const beaconEmissiveMat = new THREE.MeshBasicMaterial({
      color: 0xfff3d6,
    });
    const solarTex = createSolarPanelTexture();
    const solarMat = new THREE.MeshStandardMaterial({
      map: solarTex,
      metalness: 0.65,
      roughness: 0.22,
      side: THREE.DoubleSide,
    });
    this.disposables.push(
      hullTextures.map,
      hullTextures.bumpMap,
      titaniumMat,
      darkCarbonMat,
      berylliumGoldMat,
      sunshieldMat,
      beaconEmissiveMat,
      solarTex,
      solarMat,
    );

    const stationGroup = new THREE.Group();
    stationGroup.rotation.z = 0.16;
    stationGroup.rotation.x = 0.18;
    root.add(stationGroup);

    // 1. Layered Diamond Thermal Sunshield (JWST-inspired silver Kapton foils)
    const shieldShape = new THREE.Shape();
    shieldShape.moveTo(0, 2.8);
    shieldShape.lineTo(2.1, 0);
    shieldShape.lineTo(0, -2.8);
    shieldShape.lineTo(-2.1, 0);
    shieldShape.closePath();
    const shieldGeo = new THREE.ShapeGeometry(shieldShape);
    for (let layer = 0; layer < 3; layer++) {
      const foil = new THREE.Mesh(shieldGeo, sunshieldMat);
      foil.rotation.x = Math.PI / 2;
      foil.position.y = -1.15 - layer * 0.18;
      foil.scale.setScalar(1.0 + layer * 0.06);
      stationGroup.add(foil);
    }
    this.disposables.push(shieldGeo);

    // 2. Central Anodized Spine + Docking Hub
    const spindleGeo = new THREE.CylinderGeometry(0.36, 0.48, 5.4, 16);
    stationGroup.add(new THREE.Mesh(spindleGeo, titaniumMat));
    const hubGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.92, 16);
    stationGroup.add(new THREE.Mesh(hubGeo, darkCarbonMat));
    const windowRingGeo = new THREE.TorusGeometry(0.97, 0.035, 8, 40);
    const windowRing = new THREE.Mesh(windowRingGeo, beaconEmissiveMat);
    windowRing.rotation.x = Math.PI / 2;
    stationGroup.add(windowRing);
    this.disposables.push(spindleGeo, hubGeo, windowRingGeo);

    // 3. 18-Segment Golden Hexagonal Beryllium Primary Mirror Array (batched into 1 InstancedMesh!)
    const mirrorGroup = new THREE.Group();
    mirrorGroup.position.set(0, 1.55, 1.05);
    mirrorGroup.rotation.x = -0.32;
    const hexGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 6);
    const hexCoords: Array<[number, number]> = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      hexCoords.push([Math.cos(a) * 0.64, Math.sin(a) * 0.64]);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rad = i % 2 === 0 ? 1.28 : 1.12;
      hexCoords.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    const hexInst = new THREE.InstancedMesh(hexGeo, berylliumGoldMat, hexCoords.length);
    const dummy = new THREE.Object3D();
    hexCoords.forEach(([hx, hy], idx) => {
      dummy.position.set(hx, hy, 0);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      hexInst.setMatrixAt(idx, dummy.matrix);
    });
    hexInst.instanceMatrix.needsUpdate = true;
    mirrorGroup.add(hexInst);

    // Secondary mirror tripod struts
    const strutGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.75, 6);
    for (let s = 0; s < 3; s++) {
      const ang = (s / 3) * Math.PI * 2 + Math.PI / 6;
      const strut = new THREE.Mesh(strutGeo, darkCarbonMat);
      strut.position.set(Math.cos(ang) * 0.55, Math.sin(ang) * 0.55, 0.72);
      strut.lookAt(0, 0, 1.55);
      strut.rotateX(Math.PI / 2);
      mirrorGroup.add(strut);
    }
    const secMirrorGeo = new THREE.CylinderGeometry(0.2, 0.24, 0.14, 12);
    const secMirror = new THREE.Mesh(secMirrorGeo, titaniumMat);
    secMirror.rotation.x = Math.PI / 2;
    secMirror.position.set(0, 0, 1.52);
    mirrorGroup.add(secMirror);
    stationGroup.add(mirrorGroup);
    this.disposables.push(hexGeo, strutGeo, secMirrorGeo);

    // 4. Counter-Rotating Sleek Endurance Centrifuge Ring (12 modules batched into 1 InstancedMesh!)
    const centrifugeGroup = new THREE.Group();
    const ringRailGeo = new THREE.TorusGeometry(3.35, 0.08, 10, 56);
    const ringRail = new THREE.Mesh(ringRailGeo, titaniumMat);
    ringRail.rotation.x = Math.PI / 2;
    centrifugeGroup.add(ringRail);

    const modGeo = new THREE.BoxGeometry(0.46, 0.3, 0.78);
    const modInst = new THREE.InstancedMesh(modGeo, titaniumMat, 12);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 3.35, 0, Math.sin(a) * 3.35);
      dummy.rotation.set(0, -a, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      modInst.setMatrixAt(i, dummy.matrix);
      _color.setHex(i % 4 === 0 ? 0xe6eef8 : 0x3a4962);
      modInst.setColorAt(i, _color);
    }
    modInst.instanceMatrix.needsUpdate = true;
    if (modInst.instanceColor) modInst.instanceColor.needsUpdate = true;
    centrifugeGroup.add(modInst);

    const spokeGeo = new THREE.CylinderGeometry(0.045, 0.045, 6.6, 8);
    for (let s = 0; s < 2; s++) {
      const spoke = new THREE.Mesh(spokeGeo, titaniumMat);
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.y = (s * Math.PI) / 2;
      centrifugeGroup.add(spoke);
    }
    stationGroup.add(centrifugeGroup);
    coreSpinners.push({ obj: centrifugeGroup, axis: 'y', speed: 0.24 });
    this.disposables.push(ringRailGeo, modGeo, spokeGeo);

    // 5. Realistic Dark Monocrystalline Silicon Solar Wings
    const wingPanelGeo = new THREE.BoxGeometry(3.8, 0.04, 1.08);
    const wingLeft = new THREE.Mesh(wingPanelGeo, solarMat);
    wingLeft.position.set(-5.2, 0.5, 0);
    wingLeft.rotation.x = 0.28;
    stationGroup.add(wingLeft);

    const wingRight = new THREE.Mesh(wingPanelGeo, solarMat);
    wingRight.position.set(5.2, 0.5, 0);
    wingRight.rotation.x = 0.28;
    stationGroup.add(wingRight);

    const trussGeo = new THREE.CylinderGeometry(0.04, 0.04, 11.4, 8);
    const truss = new THREE.Mesh(trussGeo, titaniumMat);
    truss.rotation.z = Math.PI / 2;
    truss.position.y = 0.5;
    stationGroup.add(truss);
    this.disposables.push(wingPanelGeo, trussGeo);

    // 6. Upper Telemetry Spire & Soft Optical Relay Beacon
    const spireGeo = new THREE.CylinderGeometry(0.03, 0.08, 2.2, 8);
    const spireMesh = new THREE.Mesh(spireGeo, titaniumMat);
    spireMesh.position.y = 3.5;
    stationGroup.add(spireMesh);

    const tipBeaconGeo = new THREE.SphereGeometry(0.14, 12, 10);
    const tipBeacon = new THREE.Mesh(tipBeaconGeo, beaconEmissiveMat);
    tipBeacon.position.y = 4.6;
    stationGroup.add(tipBeacon);

    const beaconTex = createGlowSpriteTexture('rgba(255,248,228,0.85)', 'rgba(232,184,109,0.22)');
    const beaconSpriteMat = new THREE.SpriteMaterial({
      map: beaconTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beaconSprite = new THREE.Sprite(beaconSpriteMat);
    beaconSprite.position.y = 4.6;
    beaconSprite.scale.setScalar(2.8);
    stationGroup.add(beaconSprite);
    this.disposables.push(spireGeo, tipBeaconGeo, beaconTex, beaconSpriteMat);

    // Subtle astrometry calibration ring
    const holoGeo = new THREE.TorusGeometry(4.8, 0.018, 8, 72);
    const holoMat = new THREE.MeshBasicMaterial({
      color: 0xe8b86d,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
    });
    const holoRing = new THREE.Mesh(holoGeo, holoMat);
    holoRing.rotation.x = Math.PI / 2 - 0.16;
    root.add(holoRing);
    coreSpinners.push({ obj: holoRing, axis: 'z', speed: -0.1 });
    this.disposables.push(holoGeo, holoMat);

    this.addSystemHitSphere(root, 4.8, spec.id);

    const stationSpireLocal = new THREE.Vector3(-0.74, 4.45, 0.82);

    // 4 Sleek Deep-Space Relay Probes + Optical Laser Links + Traveling Data Packet Motes
    const satBusGeo = new THREE.CylinderGeometry(0.32, 0.36, 0.62, 8);
    const satWingGeo = new THREE.BoxGeometry(2.3, 0.03, 0.48);
    const satDishPoints = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.16, 0.04),
      new THREE.Vector2(0.32, 0.14),
      new THREE.Vector2(0.42, 0.28),
    ];
    const satDishGeo = new THREE.LatheGeometry(satDishPoints, 18);
    const beamMat = new THREE.LineBasicMaterial({
      color: 0xe8b86d,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    const packetGeo = new THREE.SphereGeometry(0.11, 8, 8);
    const packetMat = new THREE.MeshBasicMaterial({
      color: 0xfff8e6,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(satBusGeo, satWingGeo, satDishGeo, beamMat, packetGeo, packetMat);

    const bodies: RuntimeBody[] = [];
    for (let pIdx = 0; pIdx < spec.planets.length; pIdx++) {
      const pSpec = spec.planets[pIdx];
      const pivot = new THREE.Group();
      const [ix, iy, iz] = computeOrbitalPosition(pSpec.orbitRadius, pSpec.initialAngle, pSpec.inclination);
      pivot.position.set(ix, iy, iz);
      root.add(pivot);

      const satGroup = new THREE.Group();
      satGroup.add(new THREE.Mesh(satBusGeo, pIdx % 2 === 0 ? berylliumGoldMat : titaniumMat));

      const wings = new THREE.Mesh(satWingGeo, solarMat);
      wings.rotation.x = 0.36;
      satGroup.add(wings);

      const dish = new THREE.Mesh(satDishGeo, titaniumMat);
      dish.position.y = 0.36;
      satGroup.add(dish);

      const transGeo = new THREE.SphereGeometry(0.09, 10, 8);
      const transMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pSpec.accentHex) });
      const trans = new THREE.Mesh(transGeo, transMat);
      trans.position.y = 0.68;
      satGroup.add(trans);
      this.disposables.push(transGeo, transMat);

      pivot.add(satGroup);

      const beamGeo = new THREE.BufferGeometry().setFromPoints([
        stationSpireLocal.clone(),
        pivot.position.clone(),
      ]);
      const beamLine = new THREE.Line(beamGeo, beamMat);
      root.add(beamLine);
      this.disposables.push(beamGeo);

      const packetMesh = new THREE.Mesh(packetGeo, packetMat);
      root.add(packetMesh);

      this.addBodyHitSphere(pivot, 1.3, pSpec);
      bodies.push({
        spec: pSpec,
        pivot,
        spinMesh: satGroup,
        moons: [],
        angle: pSpec.initialAngle,
        bobPhase: pIdx,
        beamLine,
        packetMesh,
        packetPhase: pIdx * 0.27,
      });
    }

    return {
      spec,
      root,
      coreSpinners,
      nebulaSprites: [],
      stationSpireLocal,
      bodies,
    };
  }

  public flyToOverview() {
    this.activeSystem = null;
    this.activePlanetId = null;
    this.computeOverviewCameraPos(this.camera.aspect, this.desiredCamPos);
    this.desiredTarget.set(...GALAXY_OVERVIEW_CAMERA.target);
    if (this.isSoftwareGl) {
      this.camera.position.copy(this.desiredCamPos);
      this.controls.target.copy(this.desiredTarget);
      this.controls.update();
      this.isFlying = false;
      this.renderOnceAndEmitMarkers();
    } else {
      this.isFlying = true;
    }
  }

  public flyToSystem(systemId: SolarSystemId) {
    const sys = getSolarSystemById(systemId);
    this.activeSystem = systemId;
    this.activePlanetId = null;
    this.desiredTarget.set(...sys.center);
    this.desiredCamPos.set(
      sys.center[0] + sys.cameraOffset[0],
      sys.center[1] + sys.cameraOffset[1],
      sys.center[2] + sys.cameraOffset[2],
    );
    if (this.isSoftwareGl) {
      this.camera.position.copy(this.desiredCamPos);
      this.controls.target.copy(this.desiredTarget);
      this.controls.update();
      this.isFlying = false;
      this.renderOnceAndEmitMarkers();
    } else {
      this.isFlying = true;
    }
  }

  public flyToPlanet(planetId: string) {
    for (const sys of this.systems) {
      const found = sys.bodies.find((b) => b.spec.id === planetId);
      if (found) {
        this.activeSystem = sys.spec.id;
        this.activePlanetId = planetId;
        found.pivot.getWorldPosition(_worldPos);
        const worldRadius = found.spec.radius * sys.spec.visualScale;
        this.desiredTarget.copy(_worldPos);
        this.desiredCamPos.set(
          _worldPos.x + Math.max(worldRadius * 4.8, 3.6),
          _worldPos.y + Math.max(worldRadius * 2.9, 2.3),
          _worldPos.z + Math.max(worldRadius * 5.9, 4.4),
        );
        if (this.isSoftwareGl) {
          this.camera.position.copy(this.desiredCamPos);
          this.controls.target.copy(this.desiredTarget);
          this.controls.update();
          this.isFlying = false;
          this.renderOnceAndEmitMarkers();
        } else {
          this.isFlying = true;
        }
        return;
      }
    }
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
  }

  private renderOnceAndEmitMarkers() {
    this.renderer.render(this.scene, this.camera);
    this.updateMarkerPositions();
  }

  /**
   * Direct GPU-composited DOM transform update inside rAF (60fps, ZERO React re-renders!).
   */
  private updateMarkerPositions() {
    const width = this.viewportWidth;
    const height = this.viewportHeight;
    if (width <= 0 || height <= 0 || this.markerElements.size === 0) return;

    if (!this.activeSystem) {
      for (const sys of this.systems) {
        const key = `sys-${sys.spec.id}`;
        const el = this.markerElements.get(key);
        if (!el) continue;
        _projVec.set(...sys.spec.center);
        const baseLift =
          sys.spec.phenomenon === 'nebula-cluster'
            ? 5.8
            : sys.spec.phenomenon === 'black-hole'
              ? 6.4
              : sys.spec.phenomenon === 'relay-station'
                ? 5.4
                : sys.spec.starRadius + 3.2;
        _projVec.y += baseLift * sys.spec.visualScale;
        _projVec.project(this.camera);

        const x = ((_projVec.x + 1) * 0.5) * width;
        const y = ((-_projVec.y + 1) * 0.5) * height;
        const visible =
          _projVec.z < 1 &&
          _projVec.z > -1 &&
          x >= 16 &&
          x <= width - 16 &&
          y >= 64 &&
          y <= height - 88;

        const prevVis = this.markerVisCache.get(key);
        if (visible) {
          el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -100%)`;
          if (prevVis !== true) {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            this.markerVisCache.set(key, true);
          }
        } else if (prevVis !== false) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          this.markerVisCache.set(key, false);
        }
      }
    } else {
      const focusedSys = this.systems.find((s) => s.spec.id === this.activeSystem);
      if (!focusedSys) return;
      for (const body of focusedSys.bodies) {
        const key = body.spec.id;
        const el = this.markerElements.get(key);
        if (!el) continue;
        body.pivot.getWorldPosition(_projVec);
        _projVec.y += (body.spec.radius + 0.95) * focusedSys.spec.visualScale;
        _projVec.project(this.camera);

        const x = ((_projVec.x + 1) * 0.5) * width;
        const y = ((-_projVec.y + 1) * 0.5) * height;
        const visible =
          _projVec.z < 1 &&
          _projVec.z > -1 &&
          x >= 16 &&
          x <= width - 16 &&
          y >= 64 &&
          y <= height - 88;

        const prevVis = this.markerVisCache.get(key);
        if (visible) {
          el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -100%)`;
          if (prevVis !== true) {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            this.markerVisCache.set(key, true);
          }
        } else if (prevVis !== false) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          this.markerVisCache.set(key, false);
        }
      }
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 6);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 85);
        }
      };
      this.frameId = window.setTimeout(poll, 6);
    } else {
      this.frameId = window.setTimeout(cb, 100);
    }
  }

  private scheduleNextTick() {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = window.requestAnimationFrame(this.tick);
    }
  }

  private tick = () => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTickTs) / 1000, 0.1);
    this.lastTickTs = now;

    if (!this.paused) {
      this.elapsedTime += dt;

      // Advance all GLSL shaders (Black Hole plasma, polar jets, solar corona, star scintillation)
      for (const sh of this.animatedShaders) {
        if (sh.uniforms.uTime) {
          sh.uniforms.uTime.value = this.elapsedTime;
        }
      }

      // Advance traveling photon pulses along inter-system galactic transit arcs (zero arc-length LUT)
      for (const pulse of this.filamentPulses) {
        const t = (this.elapsedTime * pulse.speed + pulse.offset) % 1;
        pulse.curve.getPoint(t, pulse.mesh.position);
      }

      // Advance living deep-space comets
      for (const comet of this.comets) {
        const t = (this.elapsedTime * comet.speed + comet.phase) % 1;
        comet.group.position.copy(comet.start).lerp(comet.end, t);
      }

      for (const sys of this.systems) {
        for (const spinner of sys.coreSpinners) {
          spinner.obj.rotation[spinner.axis] += dt * spinner.speed;
        }
        for (const cloud of sys.nebulaSprites) {
          cloud.sprite.position.y =
            cloud.basePos.y + Math.sin(this.elapsedTime * cloud.speed + cloud.phase) * 0.42;
        }
        for (const body of sys.bodies) {
          if (sys.spec.phenomenon === 'nebula-cluster' && body.baseClusterPos) {
            body.pivot.position.set(
              body.baseClusterPos.x + Math.cos(this.elapsedTime * 0.22 + body.bobPhase) * 0.22,
              body.baseClusterPos.y + Math.sin(this.elapsedTime * 0.44 + body.bobPhase) * 0.34,
              body.baseClusterPos.z,
            );
            body.spinMesh.rotation.y += dt * 0.35;
          } else {
            body.angle += dt * body.spec.orbitSpeed;
            const [px, py, pz] = computeOrbitalPosition(
              body.spec.orbitRadius,
              body.angle,
              body.spec.inclination,
            );
            body.pivot.position.set(px, py, pz);
            body.spinMesh.rotation.y += dt * 0.36;

            if (sys.spec.phenomenon === 'relay-station' && body.beamLine && sys.stationSpireLocal) {
              body.spinMesh.lookAt(sys.root.position);
              const posAttr = body.beamLine.geometry.attributes.position as THREE.BufferAttribute;
              posAttr.setXYZ(0, sys.stationSpireLocal.x, sys.stationSpireLocal.y, sys.stationSpireLocal.z);
              posAttr.setXYZ(1, px, py, pz);
              posAttr.needsUpdate = true;

              if (body.packetMesh) {
                const pt = (this.elapsedTime * 0.36 + (body.packetPhase ?? 0)) % 1;
                _tempA.copy(sys.stationSpireLocal);
                _tempB.set(px, py, pz);
                body.packetMesh.position.lerpVectors(_tempA, _tempB, pt);
              }
            }

            for (const moon of body.moons) {
              moon.group.rotation.y += dt * moon.speed;
            }
          }
        }
      }
    }

    if (this.isFlying) {
      const lambda = 7.2;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.desiredCamPos.x, lambda, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.desiredCamPos.y, lambda, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.desiredCamPos.z, lambda, dt);

      this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.desiredTarget.x, lambda, dt);
      this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.desiredTarget.y, lambda, dt);
      this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.desiredTarget.z, lambda, dt);

      if (
        this.camera.position.distanceTo(this.desiredCamPos) < 0.08 &&
        this.controls.target.distanceTo(this.desiredTarget) < 0.08
      ) {
        this.isFlying = false;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateMarkerPositions();
    this.scheduleNextTick();
  };

  public dispose() {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);

    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.handlePointerDown);
    el.removeEventListener('pointerup', this.handlePointerUp);
    el.removeEventListener('pointermove', this.handlePointerMove);
    el.removeEventListener('webglcontextlost', this.handleContextLost);

    this.controls.removeEventListener('start', this.onControlStart);
    this.controls.dispose();

    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];

    this.renderer.dispose();
    if (el.parentNode === this.container) {
      this.container.removeChild(el);
    }
  }
}
