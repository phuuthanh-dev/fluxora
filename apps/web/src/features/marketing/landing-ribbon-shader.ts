// Gradient-noise interpolation with a quintic fade (Perlin technique).
// Local GLSL implementation; no remote textures or shader source.
const noise = `
  vec2 gradient(vec2 p) {
    float angle = fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453) * 6.283185;
    return vec2(cos(angle), sin(angle));
  }
  float perlin(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    vec2 fade = f*f*f*(f*(f*6.0-15.0)+10.0);
    float a = dot(gradient(cell), f);
    float b = dot(gradient(cell+vec2(1.0,0.0)), f-vec2(1.0,0.0));
    float c = dot(gradient(cell+vec2(0.0,1.0)), f-vec2(0.0,1.0));
    float d = dot(gradient(cell+vec2(1.0,1.0)), f-vec2(1.0,1.0));
    return mix(mix(a,b,fade.x), mix(c,d,fade.x), fade.y);
  }
`;

export const ribbonVertexShader = `
  attribute vec3 aAcross;
  uniform float uTime;
  uniform float uProgress;
  varying vec2 vUv;
  varying float vDepth;
  ${noise}
  void main() {
    vUv = uv;
    vec3 p = position;
    float drift = perlin(vec2(uv.y * .36, uTime * .10)) * .15;
    p += aAcross * drift;
    p.z += sin(uv.y * .4 + uTime * .2) * .18;
    vDepth = .7 + .3 * clamp((p.z + 1.0) / 2.0, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

export const ribbonFragmentShader = `
  precision highp float;
  uniform float uTime;
  uniform float uProgress;
  uniform vec2 uResolution;
  varying vec2 vUv;
  varying float vDepth;
  ${noise}
  void main() {
    vec3 light = vec3(0.0);
    float billow = perlin(vec2(vUv.y * .28, uTime * .08)) * .055;
    float spread = .24 + .12 * sin(vUv.y * .3 + uProgress * 2.0);
    for (int i = 0; i < 24; i++) {
      float n = float(i);
      float strand = .5 + (n / 23.0 - .5) * spread
        + billow + sin(vUv.y * (.8 + n*.007) + n + uTime*.15) * .012;
      float d = abs(vUv.x - strand);
      float aa = max(fwidth(vUv.x), .0006);
      float core = 1.0 - smoothstep(.0005, .0005 + aa, d);
      float glow = exp(-d*d / .00007);
      float bloom = exp(-d*d / .0018);
      float packet = pow(.5 + .5*sin(vUv.y*3.5-uTime*1.6+n*.4), 24.0);
      vec3 tint = mod(n, 7.0) < 1.0 ? vec3(.20,.57,.79) : vec3(.69,1.0,.13);
      light += tint * (core*(.18+packet*.24) + glow*.035 + bloom*.007);
    }
    float edge = smoothstep(0.0,.2,vUv.x) * smoothstep(0.0,.2,1.0-vUv.x);
    float screenX = gl_FragCoord.x / uResolution.x;
    float readingMask = mix(.55,1.0,smoothstep(.12,.48,abs(screenX-.5)));
    light *= edge * readingMask * vDepth;
    float alpha = clamp(max(max(light.r,light.g),light.b), 0.0, .72);
    gl_FragColor = vec4(clamp(light / max(alpha,.001),0.0,1.0),alpha);
  }
`;
