import * as THREE from 'three';

const NOISE_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.56;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 2; i++) {
      v += a * noise2(p);
      p = rot * p * 2.08;
      a *= 0.48;
    }
    return v;
  }
`;

/**
 * Gargantua-inspired animated relativistic accretion disk with Keplerian shear,
 * hot inner photon edge, and subtle Doppler beaming asymmetry.
 */
export function createBlackHoleDiskMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      ${NOISE_GLSL}

      void main() {
        float r = length(vUv);
        // Clean inner event-horizon shadow and soft outer falloff
        float innerMask = smoothstep(0.21, 0.28, r);
        float outerMask = 1.0 - smoothstep(0.56, 0.98, r);
        float radialMask = innerMask * outerMask;
        if (radialMask < 0.002) discard;

        float angle = atan(vUv.y, vUv.x);
        // Differential Keplerian angular speed (faster near the inner ISCO)
        float swirl = angle + 4.8 / (r + 0.14) - uTime * (0.45 + 0.35 / (r + 0.2));

        vec2 polarUv = vec2(swirl * 1.45, r * 10.5);
        float filaments = fbm(polarUv);
        float fineRings = sin(r * 44.0 - uTime * 1.1 + filaments * 4.2) * 0.5 + 0.5;
        float turbulence = mix(filaments, fineRings, 0.4);

        // Relativistic Doppler beaming: approaching side burns brighter
        float doppler = 0.72 + 0.42 * cos(angle + 0.55);

        // Temperature gradient from white-hot inner photon boundary to ice-blue & deep indigo outer plasma
        vec3 colCore = vec3(0.96, 0.98, 1.0);
        vec3 colMid = vec3(0.42, 0.78, 0.98);
        vec3 colOuter = vec3(0.26, 0.31, 0.72);
        vec3 colEdge = vec3(0.11, 0.14, 0.34);

        float heat = clamp((1.0 - smoothstep(0.22, 0.78, r)) * (0.72 + turbulence * 0.55), 0.0, 1.0);
        vec3 color = mix(colEdge, colOuter, smoothstep(0.05, 0.35, heat));
        color = mix(color, colMid, smoothstep(0.32, 0.70, heat));
        color = mix(color, colCore, smoothstep(0.72, 0.98, heat));

        // Razor bright inner photon rim right at the ISCO
        float photonRim = exp(-pow((r - 0.255) / 0.032, 2.0)) * 1.35;
        color += colCore * photonRim;

        float alpha = radialMask * (0.34 + 0.66 * turbulence) * doppler;
        alpha = clamp(alpha + photonRim * 0.65, 0.0, 0.96);

        gl_FragColor = vec4(color * doppler, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Lightweight zero-noise analytical bent-light Einstein ring arc (replaces expensive 2nd FBM disk).
 */
export function createBlackHoleBentArcMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float r = length(vUv);
        float band = exp(-pow((r - 0.58) / 0.13, 2.0));
        float innerCore = exp(-pow((r - 0.48) / 0.045, 2.0));
        if (band + innerCore < 0.01) discard;
        float angle = atan(vUv.y, vUv.x);
        float shimmer = 0.85 + 0.15 * sin(angle * 3.0 - uTime * 0.9);
        vec3 col = mix(vec3(0.32, 0.72, 0.98), vec3(0.96, 0.98, 1.0), clamp(innerCore * 1.2, 0.0, 1.0));
        float alpha = clamp((band * 0.34 + innerCore * 0.55) * shimmer, 0.0, 0.85);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Smooth Fresnel gravitational lensing halo around the black hole event horizon.
 */
export function createBlackHoleLensingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        float ndv = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
        // Tight luminous rim at silhouette edge, pure void in center
        float rim = pow(1.0 - ndv, 3.6);
        float innerEdge = smoothstep(0.08, 0.52, rim);
        float shimmer = 0.92 + 0.08 * sin(uTime * 1.6 + vNormal.x * 6.0);
        vec3 color = mix(vec3(0.32, 0.74, 0.98), vec3(0.95, 0.98, 1.0), pow(rim, 1.6));
        gl_FragColor = vec4(color * shimmer, innerEdge * 0.9);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
}

/**
 * Volumetric Gaussian-faded relativistic polar jet shader (ZERO hard cone edges!).
 */
export function createRelativisticJetMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      ${NOISE_GLSL}

      void main() {
        // vUv.y runs 0 (base near black hole) -> 1 (far tip in space)
        float baseFade = smoothstep(0.0, 0.14, vUv.y);
        float tipFade = pow(1.0 - smoothstep(0.18, 1.0, vUv.y), 1.85);
        // Soft cylindrical edge falloff so no hard geometric silhouette ever shows
        float edgeSoft = pow(abs(dot(normalize(vNormal), normalize(vViewDir))), 1.65);

        float stream = fbm(vec2(vUv.x * 6.0, vUv.y * 5.0 - uTime * 1.35));
        float coreBeam = pow(edgeSoft, 2.2) * 0.85;

        vec3 colInner = vec3(0.88, 0.96, 1.0);
        vec3 colOuter = vec3(0.32, 0.68, 0.96);
        vec3 color = mix(colOuter, colInner, coreBeam);

        float alpha = baseFade * tipFade * edgeSoft * (0.28 + 0.52 * stream);
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(color, alpha * 0.58);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Animated solar photosphere rim glow for the Projects main-sequence star.
 */
export function createSolarCoronaMaterial(hexColor: string): THREE.ShaderMaterial {
  const c = new THREE.Color(hexColor);
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: c },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        float ndv = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
        float rim = pow(1.0 - ndv, 2.4);
        float breathe = 0.92 + 0.08 * sin(uTime * 1.1 + vNormal.y * 5.0);
        vec3 col = mix(uColor, vec3(1.0, 0.96, 0.86), rim * 0.6);
        gl_FragColor = vec4(col * breathe, rim * 0.72);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * GPU-accelerated pinpoint deep-space starfield with airy-disc falloff and subtle realistic scintillation.
 */
export function createStarfieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = aColor;
        float twinkle = 0.78 + 0.22 * sin(uTime * (0.9 + mod(aPhase, 1.4)) + aPhase * 6.2831);
        vAlpha = twinkle;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uPixelRatio * (190.0 / max(-mvPos.z, 1.0)), 1.1, 7.5);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p) * 2.0;
        if (d > 1.0) discard;
        // Soft pinpoint airy core + faint optical halo
        float core = exp(-d * d * 7.5);
        float halo = exp(-d * d * 2.4) * 0.35;
        float intensity = (core + halo) * vAlpha;
        gl_FragColor = vec4(vColor * (0.85 + core * 0.45), intensity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
