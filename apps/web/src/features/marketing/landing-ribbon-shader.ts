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
  vec3 motes(vec2 flow,vec2 gridScale,float speed,float salt,float density,float size) {
    vec2 grid=vec2(flow.x,flow.y-uTime*speed)*gridScale;
    vec2 cell=floor(grid), within=fract(grid);
    float seed=hash(cell+salt);
    vec2 center=.22+.56*vec2(hash(cell+salt+3.1),hash(cell+salt+9.7));
    vec2 delta=within-center;
    // Undo the curved field's local stretch so pinpoints stay round at bends.
    // Derivatives must be evaluated for every fragment, before the density mask.
    vec2 dx=dFdx(grid),dy=dFdy(grid);
    float determinant=dx.x*dy.y-dy.x*dx.y;
    vec2 pixelDelta=vec2(dy.y*delta.x-dy.x*delta.y,dx.x*delta.y-dx.y*delta.x)
      /max(abs(determinant),.000001);
    float radius=mix(.7,1.45,hash(cell+salt+17.0))*size*clamp(uResolution.x/1440.0,.6,2.0);
    float d=length(pixelDelta)/radius;
    float core=exp(-d*d);
    float halo=exp(-d*d*.10);
    float twinkle=.75+.25*sin(uTime*(.6+seed*.5)+seed*6.283185);
    float border=smoothstep(0.0,.12,within.x)*smoothstep(0.0,.12,1.0-within.x)
      *smoothstep(0.0,.12,within.y)*smoothstep(0.0,.12,1.0-within.y);
    // Stable colors per particle; lime leads, with icy and warm light accents.
    float color=hash(cell+salt+23.0);
    vec3 tint=vec3(.80,1.0,.32);
    tint=mix(tint,vec3(.88,.97,1.0),step(.40,color));
    tint=mix(tint,vec3(.20,1.0,.75),step(.52,color));
    tint=mix(tint,vec3(.24,.68,1.0),step(.68,color));
    tint=mix(tint,vec3(1.0,.78,.34),step(.82,color));
    tint=mix(tint,vec3(.74,.50,1.0),step(.92,color));
    return (mix(tint,vec3(1.0),.12)*core*.70+tint*halo*.055)
      *twinkle*border*step(1.0-density,seed);
  }
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
    // Evaluate only neighboring filaments at this fragment, not all 48.
    float nearest=floor(((flow.x-.5-billow)/span+.5)*47.0);
    for(int i=-2;i<=2;i++) {
      float n=nearest+float(i);
      if(n<0.0 || n>47.0) continue;
      float seed=hash(vec2(n,4.0));
      float offset=(n/47.0-.5)*span+(seed-.5)*.004;
      float wave=sin(flow.y*(.30+seed*.24)-uTime*(.10+seed*.08)+n*1.73)*.006;
      float weave=sin(flow.y*.75-uTime*.21+n*.47)*.004;
      float strand=.5+offset+billow+wave+weave;
      float d=abs(flow.x-strand);
      // Depth changes the glow, never dissolves the fine filament core.
      float coreWidth=(.00045+seed*.00055)*mix(1.0,1.2,depth);
      float core=exp(-pow(d/(coreWidth+aa*.7),2.0));
      float halo=exp(-pow(d/(.009+depth*.005),2.0));
      // Blue stays in a small inner family instead of repeating every nth wire.
      float blue=1.0-smoothstep(.02,.08,abs(n/47.0-.58));
      vec3 tint=mix(vec3(.72,1.0,.20),vec3(.22,.66,1.0),blue*.85);
      float packet=pow(.5+.5*sin(flow.y*1.8-uTime*1.15+seed*6.28),12.0);
      float energy=mix(.28,.24,depth)*(1.0+envelope.y*1.4)*(.3+.7*seed);
      light+=tint*(core*energy*(.65+packet*.65)+halo*.010);
    }
    // A broad atmospheric envelope gives the ribbon volume; the inner bend pools light.
    float axis=flow.x-.5-billow;
    float pool=exp(-axis*axis/.045);
    light+=vec3(.59,.85,.20)*pool*(.12+envelope.y*.22);
    // Two staggered fields: plentiful fine sparks, fewer larger drifting motes.
    // Hashed positions break the grid; independent speeds provide depth.
    light+=(motes(flow,vec2(66.0,6.0),.28,2.0,.28,1.0)
      +motes(flow,vec2(32.0,3.4),.46,41.0,.23,1.8))*exp(-axis*axis/.12);
    float screenX=gl_FragCoord.x/uResolution.x;
    float readingMask=mix(mix(.72,.58,depth),1.0,smoothstep(.18,.46,abs(screenX-.5)));
    float edge=smoothstep(0.0,.16,flow.x)*smoothstep(0.0,.16,1.0-flow.x);
    light*=readingMask*edge*reveal;
    // Tone mapping preserves lime detail at the pinch instead of clipping to neon white.
    light=1.0-exp(-light*1.20);
    float alpha=clamp(max(max(light.r,light.g),light.b),0.0,.88);
    gl_FragColor=vec4(light/max(alpha,.001),alpha);
  }
`;
