// Adapted from the owner-supplied GetLayers Relay specification, 2026-10-30.
// Provenance and intentional Fluxora differences: docs/30-relay-reference-adoption.md.

export const spinePrelude = `
  uniform sampler2D uCurve;
  uniform float uHalfH, uCamZ, uPx, uLen;
  uniform vec3 uView; // half viewport width, half height (CSS px), scrollY
  vec4 curveRow(float u, float row) {
    float x = clamp(u, 0.0, 1.0) * 2047.0;
    float i = floor(x);
    float v = (row + 0.5) / 2.0;
    vec4 a = texture2D(uCurve, vec2((i + 0.5) / 2048.0, v));
    vec4 b = texture2D(uCurve, vec2((min(i + 1.0, 2047.0) + 0.5) / 2048.0, v));
    return mix(a, b, x - i);
  }
  // a point offset from the spine: o.x across it (design px), o.y in depth
  vec3 onSpine(float u, vec2 o) {
    vec4 p = curveRow(u, 0.0);
    vec2 n = curveRow(u, 1.0).xy;
    vec2 page = p.xy + n * o.x * uPx * uView.y;
    return vec3(
      (page.x - uView.x) / uView.y,
      (uView.y - (page.y - uView.z)) / uView.y,
      p.z + o.y * uPx
    );
  }
  uniform float uTurnHold, uBreath, uBreathWave, uBreathSpeed, uTimeS;
  // stream radius at u (design px): pinched, breathing, held under the turn
  float widthAt(float u, float pinch, float narrow, float wide) {
    float a = u * uLen;
    float swell = 1.0 + uBreath * sin(a / uBreathWave * 6.2831 - uTimeS * uBreathSpeed);
    float w = mix(wide, narrow, pinch) * swell;
    // a soft min: a hard one kinks the outer strands where it takes over
    float r = max(curveRow(u, 1.0).z * uTurnHold, 1.0);
    return w * r / pow(pow(w, 4.0) + pow(r, 4.0), 0.25);
  }
  vec3 toWorld(vec3 s) {
    float k = (uCamZ - s.z) / uCamZ;
    return vec3(s.x * uHalfH * k, s.y * uHalfH * k, s.z);
  }
`;

export const pointsVertex = `
  attribute float aU;
  attribute float aSeed;
  attribute float aSize;
  attribute float aKind;
  attribute vec2 aOff;
  uniform float uTime, uFlow, uScrollU, uRevealPx, uFadeIn, uFadeOut, uSpread,
    uSpreadEnds, uSpray, uBokeh, uDust, uWobble, uSize, uScale, uFocal, uDof,
    uDofSize, uTwinkle, uHeat, uAltShare;
  uniform vec3 uColMain, uColAlt, uColCore, uColDeep, uColSpark;
  varying vec3 vColor;
  varying float vBlur;
  void main() {
    float ph = aSeed * 6.2831;
    // stream (0) and spray (1) ride at speed; bokeh (2) and dust (3) drift
    float speed = (aKind < 1.5 ? 1.0 : 0.3) * (0.65 + 0.7 * fract(aSeed * 7.13));
    float u = fract(aU + uTime * uFlow * speed + uScrollU);
    float pinch = curveRow(u, 0.0).w;
    float spread = widthAt(u, pinch, uSpread, uSpreadEnds);
    if (aKind > 2.5) spread *= uDust;
    else if (aKind > 1.5) spread *= uBokeh;
    else if (aKind > 0.5) spread *= uSpray;
    vec2 o = aOff * spread
      + vec2(sin(uTime * 0.7 + ph), cos(uTime * 0.6 + ph * 1.3)) * uWobble;
    vec3 s = onSpine(u, o);
    s.z += position.z; // bokeh sits toward the camera, dust away from it
    float a = u * uLen;
    float fade = smoothstep(0.0, uFadeIn, a) * smoothstep(uLen, uLen - uFadeOut, a)
      * smoothstep(uRevealPx, uRevealPx - 220.0, a);
    float heat = pinch * (aKind < 1.5 ? 1.0 : 0.3);
    // a share of the motes carry the second hue
    vec3 hue = fract(aSeed * 3.77) < uAltShare ? uColAlt : uColMain;
    vec3 base = mix(uColDeep, hue, 0.55 + 0.45 * fract(aSeed * 5.31));
    vec4 mv = modelViewMatrix * vec4(toWorld(s), 1.0);
    float depth = -mv.z;
    float blur = clamp(abs(depth - (uCamZ - uFocal)) * uDof, 0.0, 1.0);
    if (aKind > 1.5 && aKind < 2.5) blur = max(blur, 0.8);
    vBlur = blur;
    float tw = 0.55 + 0.45 * sin(uTime * uTwinkle + ph);
    vec3 c = mix(base, uColCore, clamp(heat * 0.85, 0.0, 1.0)) * (1.0 + heat * uHeat);
    if (fract(aSeed * 13.7) < 0.05) c = uColSpark * 1.3;
    // a blurred mote spreads the same light over a bigger disc
    float spreadOut = 1.0 + blur * uDofSize;
    vColor = c * fade * tw / (spreadOut * spreadOut);
    gl_PointSize = uSize * aSize * uScale * (uCamZ / depth) * spreadOut;
    gl_Position = projectionMatrix * mv;
  }
`;

export const pointsFragment = `
  uniform float uBright;
  varying vec3 vColor;
  varying float vBlur;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    // sharp glint in focus, soft rimmed disc out of it
    float glint = exp(-r * r * 6.0);
    float disc = smoothstep(1.0, 0.6, r) * 0.5
      + smoothstep(0.5, 0.92, r) * (1.0 - smoothstep(0.9, 1.0, r)) * 0.55;
    gl_FragColor = vec4(vColor * mix(glint, disc, vBlur) * uBright, 1.0);
  }
`;

export const linesVertex = `
  attribute float aU;
  attribute vec4 aStrand; // x normal offset, y depth offset, z phase, w end
  uniform float uTime, uRevealPx, uFadeIn, uFadeOut, uSpread, uSpreadEnds,
    uLineSpread, uLineWavelength, uLineWaveAmp, uLineWaveSpeed, uPulseGain,
    uLineBase, uHeat, uAltStrands;
  uniform vec3 uColMain, uColAlt, uColCore, uColDeep;
  varying vec3 vColor;
  varying vec3 vPulse;
  varying float vA;
  varying float vPhase;
  void main() {
    float u = aU;
    float a = u * uLen;
    float pinch = curveRow(u, 0.0).w;
    float spread = widthAt(u, pinch, uSpread, uSpreadEnds) * uLineSpread;
    float wave = sin(a / uLineWavelength * 6.2831 + aStrand.z + uTime * uLineWaveSpeed) * uLineWaveAmp;
    vec3 s = onSpine(u, vec2(aStrand.x + wave, aStrand.y) * spread);
    float fade = smoothstep(0.0, uFadeIn, a) * smoothstep(uLen * aStrand.w, uLen * aStrand.w - uFadeOut, a)
      * smoothstep(uRevealPx, uRevealPx - 260.0, a);
    // a share of the strands run in the second hue
    vec3 hue = fract(aStrand.z * 1.618) < uAltStrands ? uColAlt : uColMain;
    vec3 c = mix(mix(uColDeep, hue, 0.75), uColCore, pinch * 0.6);
    vColor = c * fade * uLineBase * (1.0 + pinch * uHeat);
    vPulse = c * fade * uPulseGain;
    // the pulse is placed per fragment from the arc length — per vertex it
    // hopped from vertex to vertex
    vA = a;
    vPhase = aStrand.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(toWorld(s), 1.0);
  }
`;

export const linesFragment = `
  uniform float uBright, uPulseSpacing, uPulseShift, uPulseSharp;
  varying vec3 vColor;
  varying vec3 vPulse;
  varying float vA;
  varying float vPhase;
  void main() {
    float p = fract((vA - uPulseShift) / uPulseSpacing + vPhase) - 0.5;
    float pulse = exp(-p * p * uPulseSharp * uPulseSharp);
    gl_FragColor = vec4((vColor + vPulse * pulse) * uBright, 1.0);
  }
`;
