import * as THREE from 'three';

export type PlanetTextureStyle =
  | 'gas-giant'
  | 'terrestrial'
  | 'ice'
  | 'metallic'
  | 'volcanic'
  | 'contour';

function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createStarTexture(
  primaryHex: string,
  secondaryHex: string,
  seed: number,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(seed);

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, secondaryHex);
  grad.addColorStop(0.5, primaryHex);
  grad.addColorStop(1, secondaryHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Solar granulation plasma cells
  for (let i = 0; i < 420; i++) {
    const x = rand() * canvas.width;
    const y = rand() * canvas.height;
    const rx = 6 + rand() * 26;
    const ry = 4 + rand() * 14;
    ctx.fillStyle =
      rand() > 0.45 ? 'rgba(255, 255, 255, 0.22)' : 'rgba(15, 23, 42, 0.14)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bright equatorial convection bands
  for (let i = 0; i < 18; i++) {
    const y = rand() * canvas.height;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(0, y, canvas.width, 2 + rand() * 5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createPlanetTextures(
  style: PlanetTextureStyle,
  baseHex: string,
  accentHex: string,
  deepHex: string,
  seed: number,
  maxAnisotropy: number,
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const width = 256;
  const height = 128;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bCtx = bumpCanvas.getContext('2d')!;

  const rand = seededRandom(seed);

  // Base fill
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  if (style === 'gas-giant') {
    for (let y = 0; y < height; y += 3) {
      const wave = Math.sin((y / height) * Math.PI * 10 + seed) * 0.5 + 0.5;
      ctx.fillStyle = wave > 0.62 ? accentHex : wave < 0.32 ? deepHex : baseHex;
      ctx.globalAlpha = 0.25 + rand() * 0.35;
      ctx.fillRect(0, y, width, 3 + rand() * 4);

      const lum = Math.round(105 + wave * 45);
      bCtx.fillStyle = `rgb(${lum},${lum},${lum})`;
      bCtx.fillRect(0, y, width, 3);
    }
    ctx.globalAlpha = 1;
    // Swirling anticyclonic ovals
    for (let i = 0; i < 16; i++) {
      const x = rand() * width;
      const y = 32 + rand() * (height - 64);
      const rx = 14 + rand() * 34;
      const ry = 4 + rand() * 10;
      ctx.fillStyle = rand() > 0.5 ? accentHex : deepHex;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (style === 'metallic') {
    // Precision brushed titanium & panel seams
    for (let y = 0; y < height; y += 2) {
      ctx.fillStyle = rand() > 0.5 ? accentHex : deepHex;
      ctx.globalAlpha = 0.08 + rand() * 0.12;
      ctx.fillRect(0, y, width, 1.5);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = deepHex;
    ctx.lineWidth = 2;
    bCtx.strokeStyle = '#383838';
    bCtx.lineWidth = 3;
    for (let x = 32; x < width; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      bCtx.beginPath();
      bCtx.moveTo(x, 0);
      bCtx.lineTo(x, height);
      bCtx.stroke();
    }
    for (let y = 40; y < height; y += 44) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    // Glowing telemetry micro-ports
    ctx.fillStyle = accentHex;
    for (let i = 0; i < 36; i++) {
      ctx.fillRect(rand() * width, 24 + rand() * (height - 48), 5, 2);
    }
  } else if (style === 'contour') {
    // Bayesian topographic contours
    for (let i = 0; i < 24; i++) {
      const yBase = (i / 24) * height;
      ctx.strokeStyle = i % 3 === 0 ? accentHex : deepHex;
      ctx.lineWidth = i % 3 === 0 ? 2.2 : 1.2;
      ctx.globalAlpha = i % 3 === 0 ? 0.72 : 0.4;
      bCtx.strokeStyle = i % 3 === 0 ? '#d4d4d4' : '#525252';
      bCtx.lineWidth = 2;

      ctx.beginPath();
      bCtx.beginPath();
      for (let x = 0; x <= width; x += 16) {
        const dy =
          Math.sin((x / width) * Math.PI * 4 + i * 0.7) * 14 +
          Math.cos((x / width) * Math.PI * 2 - i * 0.4) * 8;
        if (x === 0) {
          ctx.moveTo(x, yBase + dy);
          bCtx.moveTo(x, yBase + dy);
        } else {
          ctx.lineTo(x, yBase + dy);
          bCtx.lineTo(x, yBase + dy);
        }
      }
      ctx.stroke();
      bCtx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (style === 'volcanic') {
    ctx.fillStyle = deepHex;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 95; i++) {
      const x = rand() * width;
      const y = rand() * height;
      const r = 6 + rand() * 24;
      ctx.fillStyle = baseHex;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      bCtx.fillStyle = '#4a4a4a';
      bCtx.beginPath();
      bCtx.arc(x, y, r, 0, Math.PI * 2);
      bCtx.fill();
    }
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      let x = rand() * width;
      let y = rand() * height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (rand() - 0.5) * 44;
        y += (rand() - 0.5) * 28;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (style === 'ice') {
    for (let i = 0; i < 65; i++) {
      const x = rand() * width;
      const y = rand() * height;
      ctx.fillStyle = rand() > 0.5 ? accentHex : deepHex;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.ellipse(x, y, 18 + rand() * 42, 8 + rand() * 18, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    bCtx.strokeStyle = '#cccccc';
    bCtx.lineWidth = 1.5;
    for (let i = 0; i < 34; i++) {
      const x = rand() * width;
      const y = rand() * height;
      const dx = (rand() - 0.5) * 90;
      const dy = (rand() - 0.5) * 50;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
      bCtx.beginPath();
      bCtx.moveTo(x, y);
      bCtx.lineTo(x + dx, y + dy);
      bCtx.stroke();
    }
    ctx.globalAlpha = 1;
  } else {
    // Terrestrial / rocky continents + craters
    for (let i = 0; i < 75; i++) {
      const x = rand() * width;
      const y = 16 + rand() * (height - 32);
      const rx = 12 + rand() * 44;
      const ry = 8 + rand() * 24;
      ctx.fillStyle = rand() > 0.4 ? accentHex : deepHex;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();

      bCtx.fillStyle = rand() > 0.4 ? '#b8b8b8' : '#585858';
      bCtx.beginPath();
      bCtx.ellipse(x, y, rx * 0.9, ry * 0.9, rand() * Math.PI, 0, Math.PI * 2);
      bCtx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

export function createRingTexture(innerHex: string, outerHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0.0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.14, innerHex);
  grad.addColorStop(0.42, outerHex);
  grad.addColorStop(0.48, 'rgba(0,0,0,0.06)'); // Cassini-style division
  grad.addColorStop(0.56, innerHex);
  grad.addColorStop(0.84, outerHex);
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Fine concentric ringlets
  for (let x = 30; x < 230; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, 0, 1, canvas.height);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createGlowSpriteTexture(innerRgba: string, midRgba: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
  grad.addColorStop(0, innerRgba);
  grad.addColorStop(0.32, midRgba);
  grad.addColorStop(0.7, 'rgba(0,0,0,0.04)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createAccretionDiskTexture(seed: number): THREE.CanvasTexture {
  const size = 512;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(seed);

  // Base radial plasma glow around dark inner event horizon hole
  const baseGrad = ctx.createRadialGradient(half, half, 54, half, half, half - 4);
  baseGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0)');
  baseGrad.addColorStop(0.06, 'rgba(240, 249, 255, 0.96)');
  baseGrad.addColorStop(0.16, 'rgba(125, 211, 252, 0.84)');
  baseGrad.addColorStop(0.38, 'rgba(56, 189, 248, 0.56)');
  baseGrad.addColorStop(0.65, 'rgba(79, 70, 229, 0.34)');
  baseGrad.addColorStop(0.86, 'rgba(30, 58, 138, 0.14)');
  baseGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  // Swirling relativistic spiral filaments
  ctx.save();
  ctx.translate(half, half);
  for (let i = 0; i < 64; i++) {
    const startAngle = rand() * Math.PI * 2;
    const rStart = 58 + rand() * 115;
    const sweep = 0.8 + rand() * 1.9;
    const rDelta = 26 + rand() * 58;
    ctx.beginPath();
    for (let s = 0; s <= 24; s++) {
      const t = s / 24;
      const a = startAngle + t * sweep;
      const r = rStart + t * rDelta;
      if (r > half - 8) break;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const isHot = rStart < 105;
    ctx.strokeStyle = isHot
      ? `rgba(224, 242, 254, ${(0.22 + rand() * 0.35).toFixed(2)})`
      : `rgba(99, 102, 241, ${(0.14 + rand() * 0.28).toFixed(2)})`;
    ctx.lineWidth = isHot ? 1.8 + rand() * 2.5 : 2.5 + rand() * 4.5;
    ctx.stroke();
  }
  ctx.restore();

  // Clear inner shadow cleanly
  ctx.globalCompositeOperation = 'destination-out';
  const holeGrad = ctx.createRadialGradient(half, half, 42, half, half, 60);
  holeGrad.addColorStop(0, 'rgba(0,0,0,1)');
  holeGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = holeGrad;
  ctx.beginPath();
  ctx.arc(half, half, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createNebulaCloudTexture(
  primaryRgba: string,
  secondaryRgba: string,
  seed: number,
): THREE.CanvasTexture {
  const size = 256;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(seed);

  // Sculpted wispy interstellar dust filaments — feathered edges, restrained luminance
  for (let i = 0; i < 18; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * 48;
    const cx = half + Math.cos(angle) * dist;
    const cy = half + Math.sin(angle) * dist;
    const rx = 38 + rand() * 62;
    const ry = 22 + rand() * 44;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rand() * Math.PI);
    ctx.scale(1, ry / rx);
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, rx);
    grad.addColorStop(0, i % 3 === 0 ? primaryRgba : secondaryRgba);
    grad.addColorStop(0.5, secondaryRgba.replace(/[\d.]+\)$/, '0.05)'));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createDiffractionStarTexture(): THREE.CanvasTexture {
  const size = 256;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Soft airy-disc radial core
  const coreGrad = ctx.createRadialGradient(half, half, 1, half, half, 72);
  coreGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  coreGrad.addColorStop(0.12, 'rgba(255, 248, 236, 0.82)');
  coreGrad.addColorStop(0.35, 'rgba(232, 184, 109, 0.22)');
  coreGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = coreGrad;
  ctx.fillRect(0, 0, size, size);

  // Subtle realistic JWST-inspired 6-point fine optical diffraction spikes
  const angles = [0, Math.PI / 3, (2 * Math.PI) / 3];
  for (const ang of angles) {
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(ang);
    const spikeGrad = ctx.createLinearGradient(-118, 0, 118, 0);
    spikeGrad.addColorStop(0.0, 'rgba(255,255,255,0)');
    spikeGrad.addColorStop(0.32, 'rgba(255,250,240,0.22)');
    spikeGrad.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    spikeGrad.addColorStop(0.68, 'rgba(255,250,240,0.22)');
    spikeGrad.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = spikeGrad;
    ctx.fillRect(-118, -1.1, 236, 2.2);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSolarPanelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Realistic deep monocrystalline silicon photovoltaic wafer base
  const grad = ctx.createLinearGradient(0, 0, 512, 256);
  grad.addColorStop(0, '#071124');
  grad.addColorStop(0.5, '#0c1f3f');
  grad.addColorStop(1, '#061020');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Fine wafer sub-cell hairlines
  ctx.strokeStyle = 'rgba(148, 197, 255, 0.24)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 0; y <= 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Ultra-fine silver micro-finger collector lines
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.1)';
  for (let x = 8; x < 512; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }

  // Sleek anodized structural frame perimeter
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 508, 252);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createHullPlatingTextures(
  maxAnisotropy: number,
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const width = 256;
  const height = 128;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = width;
  cCanvas.height = height;
  const ctx = cCanvas.getContext('2d')!;

  const bCanvas = document.createElement('canvas');
  bCanvas.width = width;
  bCanvas.height = height;
  const bCtx = bCanvas.getContext('2d')!;

  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  const rand = seededRandom(7741);

  // Subtle tonal panel variation like real orbital spacecraft thermal panels
  for (let y = 0; y < height; y += 32) {
    for (let x = 0; x < width; x += 64) {
      const shade = 132 + Math.floor(rand() * 34);
      ctx.fillStyle = `rgb(${shade}, ${shade + 6}, ${shade + 14})`;
      ctx.fillRect(x + 1, y + 1, 62, 30);

      const bShade = 115 + Math.floor(rand() * 25);
      bCtx.fillStyle = `rgb(${bShade},${bShade},${bShade})`;
      bCtx.fillRect(x + 1, y + 1, 62, 30);
    }
  }

  // Precision machined seams
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  bCtx.strokeStyle = '#303030';
  bCtx.lineWidth = 2;
  for (let x = 0; x <= width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(x, 0);
    bCtx.lineTo(x, height);
    bCtx.stroke();
  }
  for (let y = 0; y <= height; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(0, y);
    bCtx.lineTo(width, y);
    bCtx.stroke();
  }

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}


