// Locally authored gradient noise and analytic light; no external texture/video.
const noise = `
  float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  vec2 gradient(vec2 p) {
    float a = hash(p)*6.283185;
    return vec2(cos(a),sin(a));
  }
  float perlin(vec2 p) {
    vec2 c=floor(p), f=fract(p), fade=f*f*f*(f*(f*6.0-15.0)+10.0);
    return mix(mix(dot(gradient(c),f),dot(gradient(c+vec2(1,0)),f-vec2(1,0)),fade.x),
      mix(dot(gradient(c+vec2(0,1)),f-vec2(0,1)),dot(gradient(c+vec2(1,1)),f-vec2(1,1)),fade.x),fade.y);
  }
`;

export const ribbonVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv=uv;
    gl_Position=vec4(position.xy,0.0,1.0);
  }
`;

export const ribbonFragmentShader = `
  precision highp float;
  uniform float uTime;
  uniform float uHead;
  uniform float uHeroEnd;
  uniform vec2 uResolution;
  uniform sampler2D uPath;
  uniform vec2 uPathRange;
  uniform float uViewportHeight;
  uniform float uScroll;
  varying vec2 vUv;
  ${noise}
  void main() {
    float worldY=uScroll+(1.0-vUv.y)*uViewportHeight;
    float pathY=clamp((worldY-uPathRange.x)/(uPathRange.y-uPathRange.x),0.0,1.0);
    vec4 path=texture2D(uPath,vec2(pathY,.5));
    float previousX=texture2D(uPath,vec2(pathY-.0005,.5)).r;
    float nextX=texture2D(uPath,vec2(pathY+.0005,.5)).r;
    float slope=(nextX-previousX)/(.001*(uPathRange.y-uPathRange.x));
    float drift=sin(path.g*.23+uTime*.12)*.09+sin(path.g*.41-uTime*.17)*.035;
    float distance=((vUv.x-.5)*10.0-path.r-drift)/sqrt(1.0+min(slope*slope,12.0));
    vec2 flow=vec2(.5+distance/(2.0*path.b),path.g);
    vec3 envelope=vec3(path.b,path.a,worldY);
    float reveal=1.0-smoothstep(uHead-.9,uHead+.9,flow.y);
    if(reveal<.001) discard;
    float depth=smoothstep(uHeroEnd*.8,uHeroEnd*1.28,envelope.z);
    float billow=perlin(vec2(flow.y*.32,uTime*.10))*.04;
    float span=.54+.05*sin(flow.y*.31-uTime*.19);
    float aa=max(fwidth(flow.x),.00045);
    vec3 light=vec3(0.0);
    // Evaluate only neighboring filaments at this fragment, not all 36.
    float nearest=floor(((flow.x-.5-billow)/span+.5)*35.0);
    for(int i=-2;i<=2;i++) {
      float n=nearest+float(i);
      if(n<0.0 || n>35.0) continue;
      float seed=hash(vec2(n,4.0));
      float offset=(n/35.0-.5)*span+(seed-.5)*.006;
      float wave=sin(flow.y*(.30+seed*.24)-uTime*(.10+seed*.08)+n*1.73)*.008;
      float weave=sin(flow.y*.75-uTime*.21+n*.47)*.005;
      float strand=.5+offset+billow+wave+weave;
      float d=abs(flow.x-strand);
      float softness=mix(.00035+seed*.0005,.009+seed*.006,depth);
      float core=exp(-pow(d/(softness+aa),2.0));
      float halo=exp(-pow(d/(.012+depth*.025),2.0));
      // Blue stays in a small inner family instead of repeating every nth wire.
      float blue=1.0-smoothstep(.02,.08,abs(n/35.0-.58));
      vec3 tint=mix(vec3(.72,1.0,.20),vec3(.22,.66,1.0),blue*.85);
      float packet=pow(.5+.5*sin(flow.y*1.8-uTime*1.15+seed*6.28),12.0);
      float energy=mix(.28,.035,depth)*(1.0+envelope.y*2.0)*(.25+.75*seed);
      light+=tint*(core*energy*(.65+packet*.65)+halo*.012);
    }
    // A broad atmospheric envelope gives the ribbon volume; the inner bend pools light.
    float axis=flow.x-.5-billow;
    float pool=exp(-axis*axis/.045);
    light+=vec3(.59,.85,.20)*pool*(.18+envelope.y*.30);
    // Sparse drifting motes and soft bokeh share the ribbon's coordinate system.
    vec2 cellUV=vec2(flow.x*44.0,(flow.y-uTime*.36)*2.4);
    vec2 cell=floor(cellUV), local=fract(cellUV)-.5;
    float seed=hash(cell);
    float radius=mix(.035,.23,hash(cell+7.2));
    float particle=exp(-dot(local,local)/(radius*radius));
    float probability=step(.91,seed);
    light+=mix(vec3(.62,.95,.23),vec3(.16,.52,.78),step(.96,seed))
      *particle*probability*.20*exp(-axis*axis/.13);
    float screenX=gl_FragCoord.x/uResolution.x;
    float readingMask=mix(.72,1.0,smoothstep(.18,.46,abs(screenX-.5)));
    float edge=smoothstep(0.0,.16,flow.x)*smoothstep(0.0,.16,1.0-flow.x);
    light*=readingMask*edge*reveal;
    // Tone mapping preserves lime detail at the pinch instead of clipping to neon white.
    light=1.0-exp(-light*1.20);
    float alpha=clamp(max(max(light.r,light.g),light.b),0.0,.88);
    gl_FragColor=vec4(light/max(alpha,.001),alpha);
  }
`;
