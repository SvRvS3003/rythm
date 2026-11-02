// TypeScript, client/nebula.ts, WebGL 1: light port of the "nebula" Vizzy project by Firecat (@yoniicat), written from its published settings.
// Chain kept: red spectrum -> scrolling trail 0.98 -> noise warp -> polar map, rotating t*10 deg -> radial glow -> twirl and fish eye -> violet grade -> chromatic split.
// Rhythm comes from the song's precomputed beat map, so nothing here touches the audio path. Songs without a map use a gentle simulated pulse.
const VERT = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
const NOISE = `
float hash(vec2 s){return fract(sin(dot(s,vec2(12.9898,78.233)))*43758.5453);}
float noise(vec2 s){vec2 i=floor(s),f=fract(s),u=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}`;
const FEED = `precision highp float;varying vec2 v;uniform sampler2D prev,spec;uniform float t,e;${NOISE}
void main(){
  vec2 uv=v;
  uv.x+=(noise(vec2(v.y*15.,t*.8))-.5)*.02;                    // Spooky: distortion 15, width 0.02
  uv.y+=(v.y<.5?1.:-1.)*.0055*(.5+e);                          // "up y" / "down y" transforms: streams leave the centre line
  float old=texture2D(prev,uv).r*.96;                          // Trail 0.98 at Vizzy's 60 fps equals 0.96 per frame here
  float amp=texture2D(spec,vec2(v.x,.5)).r;
  float bar=step(abs(v.y-.5),amp*.09)*smoothstep(.18,.5,amp);
  gl_FragColor=vec4(vec3(max(old,bar)),1.);
}`;
const FINAL = `precision highp float;varying vec2 v;uniform sampler2D feed;uniform float t,e,aspect;
const float PI=3.14159265;
float field(vec2 q){                                           // Polar Coordinates, curvature 1; x scale 0.5 repeats the strip twice around
  float a=atan(q.y,q.x)+(45.+t*10.)*PI/180.;
  return .5*(texture2D(feed,vec2(a/PI,clamp(.5+length(q)*.62,0.,1.))).r+texture2D(feed,vec2(a/PI,clamp(.5-length(q)*.62,0.,1.))).r);
}
void main(){
  vec2 q=(v-.5)*vec2(aspect,1.)*2.;
  float r=length(q);
  q*=1.+.25*r*r;                                               // Fish eye 2
  float tw=.6*smoothstep(1.2,0.,r);q=mat2(cos(tw),-sin(tw),sin(tw),cos(tw))*q;   // Twirl: 0.6
  q*=mix(.72,1.,smoothstep(0.,.4,r));                          // Bulge/Pinch: strength -1.5, radius 0.2
  float s=0.,w=1.,n=0.;
  for(int i=0;i<10;i++){float k=1.-float(i)*.045;s+=field(q*k)*w;n+=w;w*=.8;}    // God rays decay 0.8 with zoom blur
  s/=n;
  float split=.012+.03*e;                                      // Chromatic aberration follows the level
  float red=field(q*(1.+split)),blue=field(q*(1.-split));
  float g=s*1.5+s*s*.64;                                       // Bloom: strength 0.64
  vec3 c=mix(vec3(.02,0.,.05),vec3(.10,.08,.95),smoothstep(.02,.32,g));          // Sepia + hue 150 + contrast 2 resolve to this ramp
  c=mix(c,vec3(.52,.16,1.),smoothstep(.25,.75,g));
  c=mix(c,vec3(1.,.42,.86),smoothstep(.7,1.25,g));
  c=mix(c,vec3(1.),smoothstep(1.2,1.9,g));
  c+=vec3(red,0.,blue)*.16;
  c*=smoothstep(1.75,.45,r);
  c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/128.;  // dither removes colour banding on 8-bit screens
  gl_FragColor=vec4(c,1.);
}`;

function program(gl: WebGLRenderingContext, frag: string) {
  const prog = gl.createProgram() as WebGLProgram;
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, frag]] as [number, string][]) {
    const s = gl.createShader(type) as WebGLShader;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    gl.attachShader(prog, s);
  }
  gl.bindAttribLocation(prog, 0, 'p');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'program');
  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const n of ['prev', 'spec', 'feed', 't', 'e', 'aspect']) u[n] = gl.getUniformLocation(prog, n);
  return { prog, u };
}
function target(gl: WebGLRenderingContext, size: number) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb };
}

// Returns a stop function, or null when WebGL is unavailable so the plain background stays.
export function startNebula(canvas: HTMLCanvasElement, isPlaying: () => boolean, readRhythm: (bins: Uint8Array) => number | null): (() => void) | null {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
  if (!gl) return null;
  let feed, final;
  try { feed = program(gl, FEED); final = program(gl, FINAL); } catch (e) { console.error(e); return null; }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const SIZE = 512, BINS = 64;
  let a = target(gl, SIZE), b = target(gl, SIZE);
  const bins = new Uint8Array(BINS), shown = new Uint8Array(BINS), eased = new Float32Array(BINS), spec = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, spec);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let raf = 0, last = 0, level = 0, stopped = false, hit = 0, quality = 1, slow = 0;
  const t0 = performance.now();
  const frame = (now: number): void => {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 32) return; // 30 fps keeps the phone cool while music plays
    // Sharp at the screen's real pixels; only a phone that cannot keep up steps down, one notch at a time.
    slow = now - last > 48 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 20 && quality > 0.5) { quality -= 0.125; slow = 0; }
    last = now;
    const dpr = Math.min(devicePixelRatio || 1, 3);
    const scale = dpr * quality * Math.min(1, 1600 / (Math.max(innerWidth, innerHeight) * dpr));
    const w = Math.round(innerWidth * scale), h = Math.round(innerHeight * scale);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const t = (now - t0) / 1000;
    level += ((isPlaying() ? 1 : 0.08) - level) * 0.04;
    const real = readRhythm(bins);
    let energy: number;
    if (real !== null) {
      hit = Math.max(hit + (real - hit) * 0.5, hit * 0.82); // sharp attack, soft release, like a meter
      energy = hit;
    } else {
      const beat = Math.pow(Math.max(0, Math.sin(t * 3.7)), 8);
      for (let i = 0; i < BINS; i++) {
        const m = Math.min(i, BINS - i) / (BINS / 2);
        const wave = 0.5 + 0.5 * Math.sin(i * 0.61 + t * 2.3) * Math.sin(i * 0.23 - t * 1.1);
        bins[i] = 255 * level * Math.min(1, Math.pow(wave, 2.2) * (0.6 + 0.7 * beat * (1 - m * 0.6)));
      }
      energy = level * (0.4 + 0.6 * beat);
      hit *= 0.9;
      energy = Math.max(energy, hit);
    }
    // Eased so starting, stopping or switching between real and simulated rhythm never jumps.
    for (let i = 0; i < BINS; i++) { eased[i] += (bins[i] - eased[i]) * 0.4; shown[i] = eased[i]; }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, spec);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, BINS, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, shown);
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
    gl.viewport(0, 0, SIZE, SIZE);
    gl.useProgram(feed.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform1i(feed.u.prev, 0); gl.uniform1i(feed.u.spec, 1);
    gl.uniform1f(feed.u.t, t); gl.uniform1f(feed.u.e, energy);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    [a, b] = [b, a];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(final.prog);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform1i(final.u.feed, 0);
    gl.uniform1f(final.u.t, t); gl.uniform1f(final.u.e, energy); gl.uniform1f(final.u.aspect, w / h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  canvas.addEventListener('webglcontextlost', () => { stopped = true; cancelAnimationFrame(raf); canvas.style.display = 'none'; });
  raf = requestAnimationFrame(frame);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}
