const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

const FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 res,cells;uniform float t,p,e,b,z;uniform vec3 deep,lit;uniform sampler2D hm;
float h(vec2 q){return fract(sin(dot(q,vec2(41.3,289.1)))*43758.5);}
float n(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+1.),f.x),f.y);}
float fbm(vec2 q){return n(q)*.6+n(q*2.1+7.)*.3+n(q*4.3+3.)*.1;}
float H(vec2 q){return texture2D(hm,q).r*3.2-1.6;}
void main(){
  vec2 uv=gl_FragCoord.xy/res,q=gl_FragCoord.xy/res.y/z,c1=1.6/cells;float w=res.x/res.y/z,v=uv.y;
  float hc=H(uv),hl=H(uv-vec2(c1.x,0.)),hr=H(uv+vec2(c1.x,0.)),hd=H(uv-vec2(0.,c1.y)),hu=H(uv+vec2(0.,c1.y));
  vec2 g=vec2(hr-hl,hu-hd)/3.2;float lap=(hl+hr+hd+hu-4.*hc)/1.6;
  vec3 N=normalize(vec3(-g*3.2,1.));
  float shore=p*(1.+.5/w)-.25/w+(hc*.22+(fbm(vec2(q.y*2.2,t*.3))-.5)*.25+sin(t*1.4+q.y*2.)*(.02+.1*e))/w;
  float d=(shore-uv.x)*w,aa=1.5/res.y,sea=smoothstep(-aa,aa,d);
  float depth=clamp(d*.9,0.,1.);
  vec2 bend=N.xy*(.25+.5*depth);
  float sand=fbm(q*vec2(2.,3.)+bend*3.)*.6+fbm(q*7.+bend*5.)*.4;
  vec3 col=mix(mix(lit*1.25,lit,depth),deep,smoothstep(.15,1.,depth))*(.85+.3*sand*(1.-depth*.7));
  col+=lit*clamp(-lap*2.2,0.,1.)*(.55-.3*depth)*(1.+b);
  vec3 L=normalize(vec3(-.45,.55,.7));
  float glint=pow(max(dot(reflect(-L,N),vec3(0.,0.,1.)),0.),48.)*(.35+.4*e);
  float sky=(1.-N.z)*1.8;
  col+=vec3(.85,.9,1.)*(glint+sky*.15);
  float lace=smoothstep(.32,.7,fbm(q*vec2(10.,16.)+vec2(-t*.4,t*.6)));
  float foam=smoothstep(.18+e*.12,0.,abs(d))*lace+smoothstep(.5,1.4,length(g)*cells.y*.16)*lace*.8;
  foam=clamp(foam,0.,1.)*step(-.2,d);
  float a=max(sea*.88,foam*.55);
  float sheen=smoothstep(.7,1.,v)*.13+smoothstep(.14,0.,v)*.05;
  col=mix(col,vec3(.92),foam*.45);
  gl_FragColor=vec4(col*a+sheen,a+sheen*(1.-a));
}`;

export class Sea {
  w = 0; h = 0; now = new Float32Array(0); was = new Float32Array(0); bytes = new Uint8Array(0);
  size(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h; this.now = new Float32Array(w * h); this.was = new Float32Array(w * h); this.bytes = new Uint8Array(w * h).fill(128);
  }

  step(dry: number, edge: (row: number) => number, damp = 0.988): number {
    const { w, h, now, was } = this;
    let energy = 0;
    for (let y = 0; y < h; y++) {
      const up = y > 0 ? -w : 0, down = y < h - 1 ? w : 0;
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        let v = x >= dry ? 0 : ((now[i - 1] + now[i + 1] + now[i + up] + now[i + down]) * 0.5 - was[i]) * (x > dry - 5 ? damp * 0.8 : damp);
        if (v > 2) v = 2; else if (v < -2) v = -2;
        was[i] = v; energy += v * v;
      }
      was[y * w] = edge(y); was[y * w + w - 1] = 0;
    }
    this.now = was; this.was = now;
    for (let i = 0; i < w * h; i++) this.bytes[i] = Math.max(0, Math.min(255, 128 + this.now[i] * 80));
    return energy / (w * h);
  }
}
type Rgb = [number, number, number];
const rgb = (hue: number, s: number, l: number): Rgb => {
  const f = (n: number): number => { const k = (n + hue * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
};

async function coverHue(src: string): Promise<{ hue: number; sat: number } | null> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (!x) return null;
  x.drawImage(img, 0, 0, 16, 16);
  const d = x.getImageData(0, 0, 16, 16).data, buckets = new Float32Array(24);
  let total = 0, sats = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, hi = Math.max(r, g, b), lo = Math.min(r, g, b), span = hi - lo;
    if (span < 0.04) continue;
    const hue = (hi === r ? (g - b) / span + 6 : hi === g ? (b - r) / span + 2 : (r - g) / span + 4) / 6 % 1;
    const weight = span * hi;
    buckets[Math.floor(hue * 24) % 24] += weight; total += weight; sats += (span / hi) * weight;
  }
  if (total < 1) return null;
  return { hue: (buckets.indexOf(Math.max(...buckets)) + 0.5) / 24, sat: sats / total };
}

export type Tide = { paint: (progress: number) => void; song: (cover: string | null | undefined, fallbackHue: number) => void };
export function startTide(canvas: HTMLCanvasElement, sounding: () => boolean, readRhythm: (bins: Uint8Array) => number | null, busy: () => boolean, zoom = 1): Tide {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const light = (navigator.hardwareConcurrency || 8) <= 4 || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8) <= 4;
  const bins = new Uint8Array(16);
  let uni: Record<string, WebGLUniformLocation | null> = {};
  const build = (): void => {
    if (!gl) return;
    const prog = gl.createProgram() as WebGLProgram;
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as [number, string][]) {
      const s = gl.createShader(type) as WebGLShader;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) console.error(gl.getShaderInfoLog(s));
      gl.attachShader(prog, s);
    }
    gl.bindAttribLocation(prog, 0, 'a');
    gl.linkProgram(prog);
    gl.useProgram(prog);
    for (const n of ['res', 'cells', 't', 'p', 'e', 'b', 'z', 'deep', 'lit', 'hm']) uni[n] = gl.getUniformLocation(prog, n);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.uniform1i(uni.hm, 0);
  };
  const sea = new Sea();
  build();
  let calm = 0, clock = 0, hitAt = -9, surge = 0, hitWas = 0;
  let progress = 0, t = Math.random() * 40, e = 0, b = 0, level = 0, raf = 0, last = 0, songNo = 0;
  let hueNow = { deep: rgb(0.03, 0.6, 0.2), lit: rgb(0.08, 0.6, 0.42) }, goal = hueNow;
  const ease = (from: Rgb, to: Rgb, k: number): Rgb => [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k];
  const frame = (now: number): void => {
    raf = 0;
    if (!gl || gl.isContextLost() || busy() || !canvas.clientWidth) return;
    if (now - last < 32) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const dpr = Math.min(devicePixelRatio || 1, light ? 1.5 : 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    const playing = !still && sounding();
    const hit = playing ? readRhythm(bins) : null;
    const bright = hit === null ? 0 : (bins[6] + bins[7] + bins[8] + bins[9] + bins[10]) / 1275;
    e += ((hit ?? 0) - e) * (1 - Math.exp(-dt / ((hit ?? 0) > e ? 0.05 : 0.35)));
    b += (bright - b) * (1 - Math.exp(-dt / 0.3));
    level += ((playing ? 1 : 0) - level) * (1 - Math.exp(-dt * 2.5));
    if (!playing && level < 0.01) level = 0;
    t += dt * (0.55 + 1.5 * e) * level;
    const k = 1 - Math.exp(-dt * 3);
    hueNow = { deep: ease(hueNow.deep, goal.deep, k), lit: ease(hueNow.lit, goal.lit, k) };

    const gw = Math.max(24, Math.min(300, Math.round(canvas.clientWidth / 3.5))), gh = Math.max(4, Math.min(32, Math.round(canvas.clientHeight / 3.5)));
    sea.size(gw, gh);
    const hitNow = hit ?? 0;
    if (playing && hitNow - hitWas > 0.18) { hitAt = clock; surge = 0.7 + 1.1 * hitNow; }
    hitWas = hitNow;
    const steps = Math.max(1, Math.min(4, Math.round(dt * 50)));
    for (let s = 0; s < steps; s++) {
      const at = clock + dt * level * (s + 1) / steps;

      calm = sea.step(Math.max(2, Math.ceil(progress * gw) + 1), y => {
        const lag = 0.09 * Math.sin(y * 0.45 + at * 0.6) + 0.04 * Math.sin(y * 1.3 - at), k = (at - hitAt - lag - 0.08) / 0.05;
        return level * (0.3 * Math.sin((at - lag) * 2.6) + surge * Math.exp(-k * k));
      }, playing ? 0.988 : 0.97);
    }
    clock += dt * level;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gw, gh, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, sea.bytes);
    gl.uniform2f(uni.res, w, h); gl.uniform2f(uni.cells, gw, gh); gl.uniform1f(uni.t, t); gl.uniform1f(uni.p, progress); gl.uniform1f(uni.e, e); gl.uniform1f(uni.b, b); gl.uniform1f(uni.z, zoom);
    gl.uniform3fv(uni.deep, hueNow.deep); gl.uniform3fv(uni.lit, hueNow.lit);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const settling = Math.abs(hueNow.deep[0] - goal.deep[0]) + Math.abs(hueNow.deep[1] - goal.deep[1]) + Math.abs(hueNow.deep[2] - goal.deep[2]) > 0.004;
    if (playing || level > 0 || e > 0.01 || settling || calm > 1e-5) raf = requestAnimationFrame(frame);
  };
  const wake = (): void => { if (!raf) raf = requestAnimationFrame(frame); };
  canvas.addEventListener('webglcontextlost', ev => ev.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => { uni = {}; build(); wake(); });
  return {
    paint(p) {
      progress = p;
      if (gl) wake();
      else canvas.style.background = `linear-gradient(90deg, rgb(${goal.deep.map(v => Math.round(v * 255)).join(' ')}) ${p * 100}%, transparent ${p * 100}%)`;
    },
    song(cover, fallbackHue) {
      const no = ++songNo;
      const set = (hue: number, sat: number): void => {
        if (no !== songNo) return;
        const s = Math.max(0.45, Math.min(0.85, sat));
        goal = { deep: rgb(hue, s, 0.15), lit: rgb((hue + 0.05) % 1, s, 0.3) };
        wake();
      };
      set(fallbackHue, 0.6);
      if (cover) coverHue(cover).then(c => { if (c) set(c.hue, c.sat); }).catch(() => {  });
    },
  };
}
