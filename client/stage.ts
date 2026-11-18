const COLS = 160, ROWS = 96, ROWS_PER_SECOND = 14;
const VERT = `attribute vec3 a;attribute float b;uniform float phase,aspect,yaw,horizon,e,line;varying float vH,vFog,vSide;
void main(){
  float depth=(a.y+phase/${ROWS}.)*9.+.5;
  float x=a.x*3.6,z=depth,pivot=4.,c=cos(yaw),s=sin(yaw);
  float wx=x*c-(z-pivot)*s,wz=(z-pivot)*c+x*s+pivot;
  float wy=-1.15+b*(.8+.25*e);
  float f=1.35/max(wz,.08);
  float aspectFix=min(aspect,1.);
  gl_Position=vec4(wx*f/max(aspect,1.)/aspectFix*aspectFix/max(aspectFix,.62),wy*f+horizon+a.z*line,0.,1.);
  vH=b;vSide=a.z;
  float far=smoothstep(1.,.12,a.y);
  vFog=far*far*(.28+.72*smoothstep(0.,.3,a.y))*smoothstep(0.,.02,a.y)*smoothstep(1.,.7,abs(a.x));
}`;
const FRAG = `precision mediump float;uniform vec3 low,high;uniform float gain;varying float vH,vFog,vSide;
void main(){
  float edge=1.-abs(vSide);
  vec3 c=mix(low,high,smoothstep(.05,.6,vH));
  c=mix(c,vec3(1.),smoothstep(.72,1.,vH)*.8);
  vec3 lit=c*edge*vFog*(.34+.66*smoothstep(0.,.5,vH))*gain;
  gl_FragColor=vec4(lit,max(lit.r,max(lit.g,lit.b)));
}`;

export type Terrain = { feed: (bins: Uint8Array, seconds: number) => void; draw: (w: number, h: number, energy: number, t: number) => void };

export function makeTerrain(gl: WebGLRenderingContext, low: number[], high: number[], horizon: number, gain: number): Terrain {
  const prog = gl.createProgram() as WebGLProgram;
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as [number, string][]) {
    const s = gl.createShader(type) as WebGLShader;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    gl.attachShader(prog, s);
  }
  gl.bindAttribLocation(prog, 0, 'a'); gl.bindAttribLocation(prog, 1, 'b');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'program');
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const uPhase = u('phase'), uAspect = u('aspect'), uYaw = u('yaw'), uHorizon = u('horizon'), uE = u('e'), uLine = u('line'), uLow = u('low'), uHigh = u('high'), uGain = u('gain');

  const place = new Float32Array(COLS * 2 * ROWS * 3);
  for (let r = 0, i = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const side of [-1, 1]) { place[i++] = c / (COLS - 1) * 2 - 1; place[i++] = r / (ROWS - 1); place[i++] = side; }
  const placeBuf = gl.createBuffer(), heightBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, placeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, place, gl.STATIC_DRAW);

  const field = new Float32Array(ROWS * COLS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = c / (COLS - 1) * 2 - 1, centre = Math.exp(-x * x * 6);
    field[r * COLS + c] = centre * (0.22 + 0.2 * Math.sin(r * 0.14 + x * 2.1) * Math.sin(r * 0.06 - x * 3.7) + 0.08 * Math.sin(r * 0.27 + x * 7));
  }
  const heights = new Float32Array(COLS * 2 * ROWS);
  const present = new Float32Array(COLS), raw = new Float32Array(COLS);
  let phase = 0;
  return {
    feed(bins, seconds) {

      for (let c = 0; c < COLS; c++) raw[c] = bins[(Math.round(c / (COLS - 1) * (bins.length - 1)) + (bins.length >> 1)) % bins.length] / 255;

      for (let pass = 0; pass < 2; pass++) {
        for (let c = 0; c < COLS; c++) { let sum = 0, n = 0; for (let k = -7; k <= 7; k++) { const o = c + k; if (o >= 0 && o < COLS) { sum += raw[o]; n++; } } present[c] = sum / n; }
        raw.set(present);
      }

      for (let c = 0; c < COLS; c++) field[c] += (present[c] - field[c]) * 0.5;
      phase += seconds * ROWS_PER_SECOND;
      while (phase >= 1) { phase -= 1; field.copyWithin(COLS, 0, COLS * (ROWS - 1)); }
    },
    draw(w, h, energy, t) {
      for (let i = 0, n = field.length, o = 0; i < n; i++) { heights[o++] = field[i]; heights[o++] = field[i]; }
      gl.useProgram(prog);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindBuffer(gl.ARRAY_BUFFER, placeBuf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, heightBuf);
      gl.bufferData(gl.ARRAY_BUFFER, heights, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
      gl.uniform1f(uPhase, phase); gl.uniform1f(uAspect, w / h); gl.uniform1f(uYaw, Math.sin(t * 0.11) * 0.16);
      gl.uniform1f(uHorizon, horizon); gl.uniform1f(uE, energy); gl.uniform1f(uLine, 2.2 * Math.min(devicePixelRatio || 1, 3) / h);
      gl.uniform3fv(uLow, low); gl.uniform3fv(uHigh, high); gl.uniform1f(uGain, gain);
      for (let r = ROWS - 1; r >= 0; r--) gl.drawArrays(gl.TRIANGLE_STRIP, r * COLS * 2, COLS * 2);
      gl.disableVertexAttribArray(1); gl.disable(gl.BLEND);
    },
  };
}

export function startStage(canvas: HTMLCanvasElement, isPlaying: () => boolean, readRhythm: (bins: Uint8Array) => number | null, busy: () => boolean): void {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, powerPreference: 'low-power' });
  if (!gl) return;
  let terrain: Terrain;
  try { terrain = makeTerrain(gl, [1, 0.3, 0.18], [1, 0.69, 0.18], 0.46, 1.1); } catch (e) { console.error(e); return; }
  const bins = new Uint8Array(COLS);
  const eased = new Uint8Array(COLS);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = 0, level = 0, hit = 0, t = 0, raf = 0, seen = true, dirty = true;
  const watch = new IntersectionObserver(e => { seen = e[0].isIntersecting; });
  watch.observe(canvas);
  const frame = (now: number): void => {
    if (!canvas.isConnected) { watch.disconnect(); return; }
    raf = requestAnimationFrame(frame);
    if (now - last < 32 || !seen || busy()) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const dpr = Math.min(devicePixelRatio || 1, 2.5);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; dirty = true; }
    const playing = !still && isPlaying();
    level += ((playing ? 1 : 0) - level) * (1 - Math.exp(-dt * 2.5));
    if (!playing && level < 0.01) level = 0;
    if (!playing && level < 0.01 && !dirty) return;
    dirty = false;
    t += dt * level;
    const real = playing ? readRhythm(bins) : null;
    if (real !== null) hit = Math.max(hit + (real - hit) * 0.5, hit * 0.82);
    else if (playing) {
      const beat = Math.pow(Math.max(0, Math.sin(t * 3.7)), 8);
      for (let i = 0; i < COLS; i++) bins[i] = 200 * (0.3 + 0.7 * beat) * (0.5 + 0.5 * Math.sin(i * 0.61 + t * 2.3));
      hit = Math.max(hit * 0.9, beat * 0.6);
    } else hit *= 0.9;
    if (level > 0.01) {
      for (let i = 0; i < COLS; i++) eased[i] = eased[i] + (bins[i] - eased[i]) * 0.4;
      terrain.feed(eased, dt * level);
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    terrain.draw(w, h, hit, t);
  };
  raf = requestAnimationFrame(frame);
  canvas.addEventListener('webglcontextlost', () => { cancelAnimationFrame(raf); watch.disconnect(); }, { once: true });
}
