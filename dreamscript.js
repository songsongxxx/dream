/* ============ 小工具 ============ */
const $ = (id) => document.getElementById(id);
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwN2_h8gvABFBO4R13BaUMtigofFVRt-CCNy4Fqgl5WjCZZFDZs3xI53eelPe-Sk3eI/exec";

// 简易状态显示
function setStatus(msg, kind = 'info') {
  const el = $('statusMsg');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
  el.style.color = kind === 'error' ? '#b00020' : '#334155';
}

// Global loading overlay toggle
function setGlobalLoading(on) {
  const el = $('globalLoading');
  if (!el) return;
  if (on) el.classList.remove('is-hidden');
  else el.classList.add('is-hidden');
}

// Build a custom grayscale audio UI around a given <audio> element
function buildCustomAudioUI(audio, { label = '', live = false } = {}) {
  audio.controls = false;

  const ui = document.createElement('div');
  ui.className = 'audio-ui';
  // Play/Pause
  const btnPlay = document.createElement('button');
  btnPlay.className = 'audio-play';
  btnPlay.type = 'button';
  btnPlay.title = 'Play/Pause';
  btnPlay.textContent = '▶';
  // Stop
  const btnStop = document.createElement('button');
  btnStop.className = 'audio-stop';
  btnStop.type = 'button';
  btnStop.title = 'Stop';
  btnStop.textContent = '■';
  // Progress
  const progress = document.createElement('input');
  progress.className = 'audio-progress';
  progress.type = 'range';
  progress.min = '0';
  progress.max = '1000';
  progress.value = '0';
  // Time label
  const time = document.createElement('div');
  time.className = 'audio-time';
  time.textContent = '00:00 / 00:00';
  // Volume
  const volWrap = document.createElement('div');
  volWrap.className = 'audio-vol';
  const volSlider = document.createElement('input');
  volSlider.className = 'audio-volume';
  volSlider.type = 'range';
  volSlider.min = '0';
  volSlider.max = '1';
  volSlider.step = '0.01';
  volSlider.value = String(audio.volume ?? 1);

  // For live streams, hide seek/time UI
  if (!live) {
    ui.appendChild(btnPlay);
    ui.appendChild(btnStop);
    ui.appendChild(progress);
    ui.appendChild(time);
  } else {
    ui.appendChild(btnPlay);
    ui.appendChild(btnStop);
  }
  volWrap.appendChild(volSlider);
  ui.appendChild(volWrap);

  const fmt = (sec) => {
    if (!isFinite(sec)) return '00:00';
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  function syncTime() {
    if (live) {
      // If using WebAudio fallback, treat gain>0 as "playing"
      const isPlaying = audio._ctxNodes
        ? ((audio._ctxNodes.gain?.gain?.value ?? 0) > 0)
        : !audio.paused;
      btnPlay.textContent = isPlaying ? '❚❚' : '▶';
      btnPlay.classList.toggle('is-playing', isPlaying);
      return;
    }
    const d = audio.duration || 0;
    const c = audio.currentTime || 0;
    const pct = d > 0 ? Math.max(0, Math.min(1, c / d)) : 0;
    progress.value = String(Math.floor(pct * 1000));
    time.textContent = `${fmt(c)} / ${fmt(d)}`;
    btnPlay.textContent = audio.paused ? '▶' : '❚❚';
    btnPlay.classList.toggle('is-playing', !audio.paused);
  }
  function seekBySlider() {
    if (live) return;
    const d = audio.duration || 0;
    if (d > 0) {
      const pct = parseInt(progress.value, 10) / 1000;
      audio.currentTime = Math.max(0, Math.min(d * pct, d - 0.001));
    }
  }

  btnPlay.addEventListener('click', () => {
    // Live fallback: toggle WebAudio gain instead of <audio> playback
    if (live && audio._ctxNodes) {
      const g = audio._ctxNodes.gain;
      if (g) g.gain.value = g.gain.value > 0 ? 0 : 1;
      syncTime();
      return;
    }
    if (audio.paused) audio.play().catch(()=>{});
    else audio.pause();
  });
  btnStop.addEventListener('click', () => {
    try { audio.pause(); } catch(_) {}
    if (live && audio.srcObject) {
      try { audio.srcObject.getTracks().forEach(t => t.stop()); } catch(_) {}
      try { audio.srcObject = null; } catch(_) {}
    }
    // Cleanup WebAudio fallback nodes if any
    if (live && audio._ctxNodes) {
      try { audio._ctxNodes.src?.disconnect?.(); } catch(_) {}
      try { audio._ctxNodes.gain?.disconnect?.(); } catch(_) {}
      audio._ctxNodes = null;
    }
    try { audio.currentTime = 0; } catch(_) {}
    syncTime();
  });
  if (!live) progress.addEventListener('input', seekBySlider);
  volSlider.addEventListener('input', () => {
    audio.volume = parseFloat(volSlider.value || '1');
  });

  audio.addEventListener('timeupdate', syncTime);
  audio.addEventListener('loadedmetadata', syncTime);
  audio.addEventListener('play', syncTime);
  audio.addEventListener('pause', syncTime);
  syncTime();

  ui._dispose = () => {
    audio.removeEventListener('timeupdate', syncTime);
    audio.removeEventListener('loadedmetadata', syncTime);
    audio.removeEventListener('play', syncTime);
    audio.removeEventListener('pause', syncTime);
  };

  return ui;
}

// Show audio share confirm modal, return 'share' | 'delete' | 'cancel'
function showAudioShareConfirm({ url, simpleOnly = false }) {
  // Fallback simple confirm
  if (simpleOnly) {
    const ok = confirm('Share this recording?\n\nOK = Share, Cancel = Delete');
    try { URL.revokeObjectURL(url); } catch (_) {}
    return Promise.resolve(ok ? 'share' : 'delete');
  }

  // Build a fresh modal only when needed (nothing sits in DOM by default)
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('role', 'dialog');

  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';

  const title = document.createElement('h3');
  title.textContent = 'Share this dream?';

  const audio = document.createElement('audio');
  audio.controls = false;

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const btnShare = document.createElement('button');
  btnShare.id = 'btnShare';
  btnShare.textContent = 'Share';
  const btnDelete = document.createElement('button');
  btnDelete.id = 'btnDelete';
  btnDelete.textContent = 'Delete';
  actions.append(btnShare, btnDelete);

  dialog.append(title, audio, actions);
  modal.appendChild(dialog);
  document.body.appendChild(modal);

  // Prepare audio + custom UI
  audio.src = url;
  const custom = buildCustomAudioUI(audio);
  audio.after(custom);

  // open
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  // Allow clicking backdrop to cancel
  const onBackdrop = (e) => { if (e.target === modal) cleanup('cancel'); };

  return new Promise((resolve) => {
    const cleanup = (result) => {
      btnShare.removeEventListener('click', onShare);
      btnDelete.removeEventListener('click', onDelete);
      modal.removeEventListener('click', onBackdrop);
      try { custom._dispose?.(); } catch(_) {}
      try { audio.pause(); } catch(_) {}
      try { URL.revokeObjectURL(url); } catch(_) {}
      try { modal.remove(); } catch(_) {}
      resolve(result);
    };
    const onShare = () => cleanup('share');
    const onDelete = () => cleanup('delete');

    btnShare.addEventListener('click', onShare, { once: true });
    btnDelete.addEventListener('click', onDelete, { once: true });
    modal.addEventListener('click', onBackdrop);
  });
}

/* ============ Audio unlock on user gesture ============ */
let audioUnlocked = false;
function installAudioUnlockOnce() {
  if (audioUnlocked) return;

  const unlock = async () => {
    try {
      // Start Tone's AudioContext on a user gesture
      if (window.Tone) {
        try { await Tone.start(); } catch (_) {}
        try { await Tone.context?.resume?.(); } catch (_) {}
      }
      audioUnlocked = (Tone?.context?.state === 'running');
      console.log('Audio unlocked:', audioUnlocked);
    } catch (e) {
      console.warn('Audio unlock failed', e);
    } finally {
      // Remove listeners to avoid repeated calls
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock, { passive: true });
    }
  };

  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true, passive: true });
}

/* UI 取值 */
const ui = {
  pitch: () => $('uiPitch'),
  pitchVal: () => $('uiPitchVal'),
  dreamBot: () => $('uiRobot'), // Renamed from "robot"
  echoWaves: () => $('uiChorus'), // Renamed from "chorus"
  etherealSpace: () => $('uiReverb'), // Renamed from "reverb"
};

/* 浏览器录制容器优先级 */
function getSupportedMime() {
  const prefer = [
    'audio/mp4', // Safari (AAC/ALAC)
    'audio/aac',
    'audio/webm;codecs=opus', // Chrome
    'audio/webm',
    'audio/ogg;codecs=opus',  // Firefox
    'audio/ogg'
  ];
  for (const mt of prefer) {
    if (MediaRecorder.isTypeSupported?.(mt)) return mt;
  }
  const a = document.createElement('audio');
  if (a.canPlayType('audio/mp4'))  return 'audio/mp4';
  if (a.canPlayType('audio/webm')) return 'audio/webm';
  if (a.canPlayType('audio/ogg'))  return 'audio/ogg';
  return 'audio/webm';
}

/* ============ Tone.js 效果链 & 录音 ============ */
let toneReady = false;
let mic;                 // Tone.UserMedia
let pitchShift, _chorus, _reverb, autoWah;
let eq3;
let mediaStreamDest;     // WebAudio MediaStreamDestination
let rec;                 // MediaRecorder
let recChunks = [];

async function ensureToneChain() {
  if (toneReady) return;
  await Tone.start();

  mic = new Tone.UserMedia();
  const constraints = { audio: true }; // Always use the default microphone
  await mic.open(constraints);
  console.log('🎤 Default mic opened with', constraints);

  // Effects
  pitchShift = new Tone.PitchShift({ pitch: 0, windowSize: 0.1, delayTime: 0.01, feedback: 0 });
  _chorus     = new Tone.Chorus(4, 2.5, 0.5).start();
  _reverb     = new Tone.Reverb({ decay: 2.5, wet: 0.25 });
  autoWah     = new Tone.AutoWah({ baseFrequency: 100, octaves: 4, sensitivity: 0.5, Q: 1, gain: 0, wet: 0 });
  eq3         = new Tone.EQ3(0, 0, 0); // Default EQ settings, no user interaction

  const ac = Tone.getContext().rawContext;
  mediaStreamDest = ac.createMediaStreamDestination();

  // 链接：mic -> pitch -> autoWah -> chorus -> reverb -> eq -> (destination + mediaStreamDest)
  mic.connect(pitchShift);
  pitchShift.connect(autoWah);
  autoWah.connect(_chorus);
  _chorus.connect(_reverb);
  _reverb.connect(eq3);

  eq3.connect(Tone.getDestination()); // 本地监听
  eq3.connect(mediaStreamDest);       // 供 MediaRecorder 录制

  // UI 联动
  ui.pitch()?.addEventListener('input', () => {
    const el = ui.pitch();
    const v = parseInt(el.value, 10) || 0;
    pitchShift.pitch = v;
    ui.pitchVal().textContent = String(v);

    // Update slider progress CSS var (--p)
    const min = parseInt(el.min || '0', 10);
    const max = parseInt(el.max || '100', 10);
    const pct = ((v - min) / (max - min)) * 100;
    el.style.setProperty('--p', `${Math.max(0, Math.min(100, pct))}%`);
  });
  ui.dreamBot()?.addEventListener('change', () => { // Updated to "dreamBot"
    autoWah.wet.value = ui.dreamBot().checked ? 1 : 0;
  });
  ui.echoWaves()?.addEventListener('change', () => { // Updated to "echoWaves"
    _chorus.wet.value = ui.echoWaves().checked ? 0.5 : 0;
  });
  ui.etherealSpace()?.addEventListener('change', () => { // Updated to "etherealSpace"
    _reverb.wet.value = ui.etherealSpace().checked ? 0.25 : 0;
  });

  toneReady = true;
}

function getRecorderForProcessedStream() {
  const mime = getSupportedMime();
  const r = new MediaRecorder(mediaStreamDest.stream, { mimeType: mime });
  r.ondataavailable = e => { if (e.data && e.data.size > 0) recChunks.push(e.data); };
  return r;
}

async function unlockAudioContext() {
  if (window.Tone && Tone.context && Tone.context.state !== 'running') {
    try { await Tone.start(); } catch(e) { console.warn('Failed to unlock AudioContext', e); }
  }
}

async function startRec() {
  await unlockAudioContext();
  await ensureToneChain();
  // 确保麦克风在再次录音前已打开
  if (mic && mic.state !== 'started') {
    try { await mic.open({ audio: true }); } catch (e) { console.warn('mic reopen failed', e); }
  }
  recChunks = [];
  rec = getRecorderForProcessedStream();
  rec.start();
  console.log('🎙️ 开始录音（处理后流）...');
  $('recStart').disabled = true;
  $('recStop').disabled  = false;
}

async function stopRec() {
  if (!rec || rec.state === 'inactive') return null;
  const stopped = new Promise(resolve => rec.addEventListener('stop', resolve, { once: true }));
  try { rec.requestData(); } catch {}
  rec.stop();
  await stopped;

  const type = rec.mimeType || 'audio/webm';
  const blob = new Blob(recChunks, { type });
  recChunks = [];

  $('recStart').disabled = false;
  $('recStop').disabled  = true;

  // Close mic (release hardware)
  try { await mic?.close?.(); } catch (e) { console.warn('Failed to close microphone', e); }

  if (blob.size === 0) {
    console.error('Recording data is empty or corrupted');
    return null;
  }
  return blob;
}

/* ============ ffmpeg.wasm 转码（仅一份） ============ */
let ffmpegInstance;
let FF_CORE_PATH = null; // 仅本地脚本时设置 corePath
async function ensureFfmpegScript() {
  if (window.FFmpeg?.createFFmpeg) return true;
  // 先用 CDN，最后再尝试本地，避免 404/MIME 警告
  const sources = [
    'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/ffmpeg.min.js',
    'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/ffmpeg.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.10/ffmpeg.min.js',
    './lib/ffmpeg/ffmpeg.min.js' // 本地兜底
  ];
  for (const src of sources) {
    try {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
      if (window.FFmpeg?.createFFmpeg) {
        // 仅当使用本地脚本时，指定本地 corePath；CDN 则让其自动加载对应 core
        FF_CORE_PATH = src.startsWith('.') ? new URL('./lib/ffmpeg/ffmpeg-core.js', location.href).href : null;
        return true;
      }
    } catch (_) {}
  }
  return false;
}

async function ensureFFmpeg() {
  const ok = await ensureFfmpegScript();
  if (!ok) throw new Error('Failed to load FFmpeg script');
  if (ffmpegInstance) return ffmpegInstance;
  const { createFFmpeg } = window.FFmpeg;
  const opts = { log: false };
  if (FF_CORE_PATH) opts.corePath = FF_CORE_PATH;
  const ff = createFFmpeg(opts);
  await ff.load();
  ffmpegInstance = ff;
  return ff;
}

function guessMimeByExt(ext) {
  switch (ext) {
    case 'm4a': return 'audio/mp4';
    case 'mp3': return 'audio/mpeg';
    case 'ogg': return 'audio/ogg';
    case 'webm':return 'audio/webm';
    default:    return 'application/octet-stream';
  }
}
/** inputBlob -> { blob, mime, ext } 目标：m4a/mp3/ogg/webm（m4a失败自动回退mp3） */
async function transcodeToTarget(inputBlob, targetExt) {
  const t = (inputBlob.type || '').toLowerCase();
  if ((targetExt === 'm4a' && (t.includes('mp4') || t.includes('aac'))) ||
      (targetExt === 'mp3' && t.includes('mpeg')) ||
      (targetExt === 'ogg' && t.includes('ogg')) ||
      (targetExt === 'webm' && t.includes('webm'))) {
    return { blob: inputBlob, mime: inputBlob.type || guessMimeByExt(targetExt), ext: targetExt };
  }

  const ff = await ensureFFmpeg();
  const inName = t.includes('ogg') ? 'in.ogg' : (t.includes('webm') ? 'in.webm' : 'in.dat');
  const arr = new Uint8Array(await inputBlob.arrayBuffer());
  ff.FS('writeFile', inName, arr);

  async function run(ext, args) {
    const out = 'out.' + ext;
    await ff.run(...args, out);
    const data = ff.FS('readFile', out);
    try { ff.FS('unlink', out); } catch {}
    try { ff.FS('unlink', inName); } catch {}
    return { blob: new Blob([data.buffer], { type: guessMimeByExt(ext) }), mime: guessMimeByExt(ext), ext };
  }

  try {
    if (targetExt === 'm4a') {
      return await run('m4a', ['-i', inName, '-vn', '-c:a', 'aac', '-b:a', '128k', '-movflags', 'faststart']);
    }
    if (targetExt === 'mp3') {
      return await run('mp3', ['-i', inName, '-vn', '-c:a', 'libmp3lame', '-b:a', '160k']);
    }
    if (targetExt === 'ogg') {
      return await run('ogg', ['-i', inName, '-vn', '-c:a', 'libopus', '-b:a', '96k']);
    }
    return await run('webm', ['-i', inName, '-vn', '-c:a', 'libopus', '-b:a', '96k']);
  } catch (e) {
    console.warn('Target format transcode failed, falling back to MP3:', e);
    return await run('mp3', ['-i', inName, '-vn', '-c:a', 'libmp3lame', '-b:a', '160k']);
  }
}

/* ============ 与 GAS 交互（表单 POST & JSONP 读） ============ */
const LIMIT = 1000; // 内联条数，加载更多文本（原为 5）
function postViaHiddenForm(url, fields) {
  return new Promise((resolve) => {
    const iframeName = 'gas_iframe_' + Date.now();
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.name = iframeName;
    document.body.appendChild(iframe);

    const form = document.createElement('form');
    form.action = url + '?_=' + Date.now();
    form.method = 'POST';
    form.target = iframeName;

    Object.entries(fields || {}).forEach(([key, value]) => {
      if (value == null) return;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(value);
      form.appendChild(input);
    });

    document.body.appendChild(form);
    iframe.addEventListener('load', () => {
      form.remove();
      setTimeout(() => iframe.remove(), 50);
      resolve(true);
    }, { once: true });

    form.submit();
  });
}
async function submitToGAS({ text = '', audioB64 = '', audioMime = '', filename = '' }) {
  const timestamp = Date.now(); // Add a timestamp for the bubble
  await postViaHiddenForm(WEB_APP_URL, {
    text,
    audio_b64: audioB64,
    audio_mime: audioMime,
    filename,
    timestamp,                    // Include the timestamp in the submission
    origin: location.origin || '' // Help backend validate/debug
  });
}
function loadFromGAS() {
  const MAX_TRIES = 3;
  return new Promise(async (resolve, reject) => {
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      try {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          let finished = false;
          const cleanup = () => {
            if (finished) return;
            finished = true;
            try { if (s && s.parentNode) s.parentNode.removeChild(s); } catch {}
            clearTimeout(timer);
          };
          const handler = (data) => {
            try {
              if (!data || !data.ok) throw new Error((data && data.error) || 'unknown');
              renderRows(Array.isArray(data.rows) ? data.rows : []);
              setStatus('', 'info');
              res(true);
            } catch (e) {
              rej(e);
            } finally {
              cleanup();
            }
          };
          // 固定回调名，先注册全局，避免 “not defined”
          window.receiveRows = handler;
          try { (globalThis || window).receiveRows = handler; } catch (_) {}

          const timer = setTimeout(() => {
            cleanup();
            rej(new Error('timeout'));
          }, 12000);

          s.src = `${WEB_APP_URL}?callback=receiveRows&limit=${LIMIT}&inline=1&_=${Date.now()}`;
          s.onerror = () => { cleanup(); rej(new Error('jsonp_onerror')); };
          document.body.appendChild(s);
        });
        return resolve(true);
      } catch (e) {
        if (attempt === MAX_TRIES) {
          console.error('GAS load failed:', e);
          setStatus('Service unavailable (timeout/403). Please try again later.', 'error');
          return reject(e);
        }
        setStatus(`Retrying to load… (attempt ${attempt + 1})`, 'info');
        await new Promise(r => setTimeout(r, 800 * attempt));
      }
    }
  });
}

/* ============ 播放端渲染 ============ */
function formatDuration(sec) {
  if (!isFinite(sec)) return '';
  const m = Math.floor(sec / 60).toString().padStart(2,'0');
  const s = Math.floor(sec % 60).toString().padStart(2,'0');
  return `${m}:${s}`;
}
const rand = (min, max) => Math.random() * (max - min) + min;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function normalizeDriveUrl(u) {
  try {
    const url = new URL(u);
    const id =
      url.searchParams.get('id') ||
      /\/d\/([-\w]{25,})/.exec(url.pathname)?.[1] ||
      /[-\w]{25,}/.exec(u)?.[0];
    if (id) {
      return `https://drive.usercontent.google.com/uc?id=${id}&export=download`;
    }
  } catch (_) {
    const id = /[-\w]{25,}/.exec(String(u))?.[0];
    if (id) {
      return `https://drive.usercontent.google.com/uc?id=${id}&export=download`;
    }
  }
  return u;
}
function guessMimeFromUrl(u) {
  const p = (u || '').split('?')[0].toLowerCase();
  if (p.endsWith('.mp3')) return 'audio/mpeg';
  if (p.endsWith('.m4a') || p.endsWith('.mp4')) return 'audio/mp4';
  if (p.endsWith('.ogg') || p.endsWith('.oga')) return 'audio/ogg';
  if (p.endsWith('.webm')) return 'audio/webm';
  if (p.endsWith('.wav')) return 'audio/wav';
  return '';
}

let currentAudio = null;
let currentBtn = null;

/* global cycle timers (avoid duplicates across re-renders) */
let bubbleCycleTimer = null;
let expireTimer = null;
let bubblePhase = 'split';

function renderRows(rows) {
  const container = $('bubbleContainer');
  if (!container) { console.error('❌ Missing #bubbleContainer'); return; }
  container.innerHTML = '';

  /* clear previous timers (app may re-render after submit/load) */
  if (bubbleCycleTimer) { clearInterval(bubbleCycleTimer); bubbleCycleTimer = null; }
  if (expireTimer) { clearInterval(expireTimer); expireTimer = null; }
  bubblePhase = 'split';

  const bubbles = [];
  let screenWidth = window.innerWidth;
  let screenHeight = window.innerHeight;

  /* 30-day filter at render */
  const NOW = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  rows = (rows || []).filter(r => {
    const ts = Number(r.timestamp) || Date.parse(r.timestamp || '') || 0;
    return ts === 0 || (NOW - ts) <= THIRTY_DAYS_MS;
  });

  const createBubble = ({ text, timestamp, audioUrl, audioMime, audioData }, idx, options = {}) => {
    const wrap = document.createElement('div');
    wrap.className = 'bubble';
    const ts = Number(timestamp) || Date.now();
    wrap.dataset.timestamp = String(ts);

    // Random initial position and slower velocity
    const isMobile = window.innerWidth <= 768;
    // Make bubbles a bit smaller on mobile
    const bubbleSize = isMobile
      ? (Math.random() * 24 + 28)   // 28–52 (was 36–64)
      : (Math.random() * 50 + 50);  // 50–100
    const x = Math.random() * (screenWidth - bubbleSize);
    const y = Math.random() * (screenHeight - bubbleSize);
    const velocityX = (Math.random() - 0.5) * 0.5;
    const velocityY = (Math.random() - 0.5) * 0.5;

    wrap.style.width = `${bubbleSize}px`;
    wrap.style.height = `${bubbleSize}px`;
    wrap.style.left = `${x}px`;
    wrap.style.top = `${y}px`;

    // Wrap content for precise measuring
    const content = document.createElement('div');
    content.className = 'bubble-content';

    if (text) {
      const meta = document.createElement('div');
      meta.className = 'bubble-text';
      meta.textContent = text;
      content.appendChild(meta);
    }
    let audioEl = null;
    if (audioUrl || audioData) {
      audioEl = document.createElement('audio');
      audioEl.controls = false; // use custom UI for consistency
      const source = document.createElement('source');
      source.src = audioData || normalizeDriveUrl((audioUrl || '').trim());
      source.type = audioMime || guessMimeFromUrl(audioUrl);
      audioEl.appendChild(source);
      content.appendChild(audioEl);

      // attach custom audio UI initially
      const custom = buildCustomAudioUI(audioEl);
      content.appendChild(custom);
    }

    wrap.appendChild(content);
    container.appendChild(wrap);

    // Track this bubble
    const rec = {
      element: wrap, x, y, velocityX, velocityY, size: bubbleSize,
      createdAt: ts,
      isSplitPart: !!options.isSplitPart,
      kind: audioEl ? 'audio' : 'text',
      segmentPct: options.segmentPct || null // [startPct, endPct] for audio
    };
    bubbles.push(rec);

    // Pause motion + precisely expand to fit all content on hover
    const initial = { width: bubbleSize, height: bubbleSize };
    wrap.addEventListener('mouseenter', () => {
      // raise this bubble to topmost layer while open
      wrap.style.zIndex = '5000';
      rec._vx = rec.velocityX; rec._vy = rec.velocityY;
      rec.velocityX = 0; rec.velocityY = 0;

      wrap.classList.add('bubble--measuring');
      const contentEl = wrap.querySelector('.bubble-content');
      if (!contentEl) return;

      // Segment playback guards for audio (apply once)
      if (audioEl && rec.segmentPct && !rec._segBound) {
        const [sp, ep] = rec.segmentPct;
        const useSegment = () => {
          const d = audioEl.duration || 0;
          if (!isFinite(d) || d <= 0) return { start: 0, end: d };
          return { start: d * sp, end: d * ep };
        };
        audioEl.addEventListener('play', () => {
          const { start } = useSegment();
          try { if (!isNaN(start)) audioEl.currentTime = start; } catch(_) {}
        });
        audioEl.addEventListener('timeupdate', () => {
          const { end } = useSegment();
          if (isFinite(end) && end > 0 && audioEl.currentTime > end) audioEl.pause();
        });
        rec._segBound = true;
      }

      // remove small size to measure
      wrap.style.width = 'auto';
      wrap.style.height = 'auto';
      wrap.style.maxWidth = '90vw';
      wrap.style.maxHeight = '90vh';

      const maxMeasureWidth = Math.min(window.innerWidth * 0.9, 720);
      contentEl.style.maxWidth = maxMeasureWidth + 'px';

      // Force reflow
      // eslint-disable-next-line no-unused-expressions
      contentEl.offsetWidth;

      const padding = 16;
      const rect = contentEl.getBoundingClientRect();
      const targetW = Math.ceil(rect.width) + padding * 2;
      const targetH = Math.ceil(rect.height) + padding * 2;
      const finalW = Math.min(targetW, Math.floor(window.innerWidth * 0.9));
      const finalH = Math.min(targetH, Math.floor(window.innerHeight * 0.9));

      wrap.style.width = finalW + 'px';
      wrap.style.height = finalH + 'px';
      wrap.classList.add('bubble--open');
      wrap.classList.remove('bubble--measuring');

      // Clamp to viewport
      const right = rec.x + finalW;
      const bottom = rec.y + finalH;
      const deltaX = Math.max(0, right - window.innerWidth + 8);
      const deltaY = Math.max(0, bottom - window.innerHeight + 8);
      rec.x = Math.max(8, rec.x - deltaX);
      rec.y = Math.max(8, rec.y - deltaY);
      wrap.style.left = rec.x + 'px';
      wrap.style.top  = rec.y + 'px';
    });

    wrap.addEventListener('mouseleave', () => {
      rec.velocityX = rec._vx ?? rec.velocityX;
      rec.velocityY = rec._vy ?? rec.velocityY;
      wrap.classList.remove('bubble--open', 'bubble--measuring');
      wrap.style.maxWidth = '';
      wrap.style.maxHeight = '';
      wrap.style.width = initial.width + 'px';
      wrap.style.height = initial.height + 'px';
      // restore z-index after closing
      wrap.style.zIndex = '';
    });

    return wrap;
  };

  const removeRec = (rec) => {
    try { rec.element.remove(); } catch(_) {}
    const i = bubbles.indexOf(rec);
    if (i >= 0) bubbles.splice(i, 1);
  };

  const pickTwo = (arr) => {
    if (arr.length < 2) return null;
    const i = Math.floor(Math.random() * arr.length);
    let j = Math.floor(Math.random() * (arr.length - 1));
    if (j >= i) j += 1;
    return [arr[i], arr[j]];
  };

  // Helper: tokenize into words; prefer whitespace-separated words, fallback to punctuation groups.
  const tokenizeWords = (s) => {
    if (!s) return [];
    // 1) whitespace-separated tokens
    const ws = s.trim().split(/\s+/).filter(Boolean);
    if (ws.length >= 2) return ws;
    // 2) fallback: split by common punctuation groups (useful for CJK sentences)
    const byPunc = s.split(/([，。！？、；：,.!?;:]+)/).map(t => t.trim()).filter(Boolean);
    if (byPunc.length >= 2) return byPunc;
    // No reliable “word” boundary found
    return [];
  };

  // Word-based split; returns [part1, part2] or null if cannot split by words
  const splitTextByWords = (s) => {
    const tokens = tokenizeWords(s);
    if (tokens.length < 2) return null;
    const i = Math.floor(rand(1, tokens.length)); // split index between words
    return [tokens.slice(0, i).join(' '), tokens.slice(i).join(' ')];
  };

  // render initial
  rows.forEach(({ text, timestamp, audioUrl, audioMime, audioData }, idx) => {
    if (!text && !audioUrl && !audioData) return;
    createBubble({ text, timestamp, audioUrl, audioMime, audioData }, idx);
  });

  // Text: 2→2 cross recombine in place
  const doTextCycleRecombine = () => {
    const texts = bubbles.filter(b => b.kind === 'text');
    if (texts.length < 2) return;

    const pool = texts.slice().sort(() => Math.random() - 0.5);

    // 使用空白优先，CJK 标点回退，保证中文没有空格时也能拆
    const splitByWords = (s) => {
      const raw = (s || '').trim();
      if (!raw) return null;
      const bySpace = raw.split(/\s+/).filter(Boolean);
      if (bySpace.length >= 2) return bySpace;
      const byPunc = raw.split(/([，。！？、；：,.!?;:]+)/).map(t => t.trim()).filter(Boolean);
      return byPunc.length >= 2 ? byPunc : null;
    };

    while (pool.length >= 2) {
      const a = pool.pop();
      const b = pool.pop();

      const ensureText = (rec) => {
        let el = rec.element.querySelector('.bubble-text');
        if (!el) {
          el = document.createElement('div');
          el.className = 'bubble-text';
          rec.element.querySelector('.bubble-content').appendChild(el);
        }
        return el;
      };

      const aTextEl = ensureText(a);
      const bTextEl = ensureText(b);

      const aText = (aTextEl.textContent || '').trim();
      const bText = (bTextEl.textContent || '').trim();

      const aParts = splitByWords(aText);
      const bParts = splitByWords(bText);

      let outA = '';
      let outB = '';

      if (aParts && bParts) {
        const aMid = Math.max(1, Math.floor(aParts.length / 2));
        const bMid = Math.max(1, Math.floor(bParts.length / 2));
        const a1 = aParts.slice(0, aMid).join(' ');
        const a2 = aParts.slice(aMid).join(' ');
        const b1 = bParts.slice(0, bMid).join(' ');
        const b2 = bParts.slice(bMid).join(' ');
        const ai = Math.random() < 0.5 ? 0 : 1;
        const bi = Math.random() < 0.5 ? 0 : 1;
        const pickA = ai === 0 ? a1 : a2, restA = ai === 0 ? a2 : a1;
        const pickB = bi === 0 ? b1 : b2, restB = bi === 0 ? b2 : b1;

        outA = `${pickA} ${pickB}`.trim();
        outB = `${restA} ${restB}`.trim();
      } else {
        outA = [aText, bText].filter(Boolean).join(' ').trim();
        outB = [bText, aText].filter(Boolean).join(' ').trim();
      }

      aTextEl.textContent = outA || ' ';
      bTextEl.textContent = outB || ' ';

      [a.element, b.element].forEach(w => {
        w.classList.add('bubble--split');
        setTimeout(() => w.classList.remove('bubble--split'), 800);
      });
    }
  };

  // Audio helper: attach a single sequential player to container
  function attachSequentialPlayer(container, parts) {
    [...container.querySelectorAll('audio')].forEach(a => a.remove());
    // Remove old custom UIs if any
    [...container.querySelectorAll('.audio-ui')].forEach(el => el.remove());

    const player = document.createElement('audio');
    player.preload = 'metadata';
    container.appendChild(player);

    // Build and attach custom UI
    const ui = buildCustomAudioUI(player);
    container.appendChild(ui);

    let idx = 0;
    function load(i, autoplay) {
      const p = parts[i];
      if (!p) return;
      player.src = p.src;
      const onMeta = () => {
        try { player.currentTime = (isFinite(p.start) ? p.start : 0) || 0; } catch(_) {}
        if (autoplay) player.play().catch(()=>{});
        player.removeEventListener('loadedmetadata', onMeta);
      };
      player.addEventListener('loadedmetadata', onMeta);
    }

    player.addEventListener('timeupdate', () => {
      const p = parts[idx];
      if (!p) return;
      if (isFinite(p.end) && p.end > 0 && player.currentTime >= p.end - 0.02) {
        if (idx + 1 < parts.length) {
          idx += 1; load(idx, true);
        } else {
          player.pause();
        }
      }
    });

    player.addEventListener('ended', () => {
      if (idx + 1 < parts.length) { idx += 1; load(idx, true); }
    });

    load(0, false);
  }

  // Audio: 2→2 in-place recombine by rules
  const doAudioCycleRecombine = () => {
    const list = bubbles.filter(b => b.kind === 'audio');
    if (list.length < 2) return;

    const pool = list.slice().sort(() => Math.random() - 0.5);

    const getAudioMeta = (rec) => {
      const el = rec.element.querySelector('audio');
      const src = el?.querySelector('source')?.src || el?.src || '';
      const type = el?.querySelector('source')?.type || '';
      const dur = el?.duration;
      if (!src || !isFinite(dur) || dur <= 0) return null;
      return { src, type, dur };
    };

    while (pool.length >= 2) {
      const a = pool.pop();
      const b = pool.pop();

      const ma = getAudioMeta(a);
      const mb = getAudioMeta(b);
      if (!ma || !mb) continue;

      if (ma.dur < 5 || mb.dur < 5) continue;

      const aCanSplit = ma.dur >= 10;
      const bCanSplit = mb.dur >= 10;

      const aSegs = aCanSplit
        ? [{src:ma.src,type:ma.type,start:0,end:ma.dur/2},{src:ma.src,type:ma.type,start:ma.dur/2,end:ma.dur}]
        : [{src:ma.src,type:ma.type,start:0,end:ma.dur}];

      const bSegs = bCanSplit
        ? [{src:mb.src,type:mb.type,start:0,end:mb.dur/2},{src:mb.src,type:mb.type,start:mb.dur/2,end:mb.dur}]
        : [{src:mb.src,type:mb.type,start:0,end:mb.dur}];

      let seq1, seq2;
      if (aSegs.length === 2 && bSegs.length === 2) {
        const ai = Math.random() < 0.5 ? 0 : 1;
        const bi = Math.random() < 0.5 ? 0 : 1;
        const aPick = aSegs[ai],  aRest = aSegs[1 - ai];
        const bPick = bSegs[bi],  bRest = bSegs[1 - bi];
        seq1 = [aPick, bPick];
        seq2 = [aRest, bRest];
      } else if (aSegs.length === 2 && bSegs.length === 1) {
        seq1 = [aSegs[0], bSegs[0]];
        seq2 = [aSegs[1], bSegs[0]];
      } else if (aSegs.length === 1 && bSegs.length === 2) {
        seq1 = [aSegs[0], bSegs[0]];
        seq2 = [aSegs[0], bSegs[1]];
      } else {
        seq1 = [aSegs[0], bSegs[0]];
        seq2 = [bSegs[0], aSegs[0]];
      }

      const ca = a.element.querySelector('.bubble-content');
      const cb = b.element.querySelector('.bubble-content');
      if (ca) attachSequentialPlayer(ca, seq1);
      if (cb) attachSequentialPlayer(cb, seq2);

      [a.element, b.element].forEach(w => {
        w.classList.add('bubble--split');
        setTimeout(() => w.classList.remove('bubble--split'), 800);
      });
    }
  };

  // Animate bubbles
  function animateBubbles() {
    bubbles.forEach((bubble) => {
      bubble.x += bubble.velocityX;
      bubble.y += bubble.velocityY;
      if (bubble.x <= 0 || bubble.x + bubble.size >= screenWidth) {
        bubble.velocityX *= -1;
        bubble.x = Math.max(0, Math.min(bubble.x, screenWidth - bubble.size));
      }
      if (bubble.y <= 0 || bubble.y + bubble.size >= screenHeight) {
        bubble.velocityY *= -1;
        bubble.y = Math.max(0, Math.min(bubble.y, screenHeight - bubble.size));
      }
      bubble.element.style.left = `${bubble.x}px`;
      bubble.element.style.top = `${bubble.y}px`;
    });
    requestAnimationFrame(animateBubbles);
  }
  animateBubbles();

  // Update screen dimensions on resize
  window.addEventListener('resize', () => {
    screenWidth = window.innerWidth;
    screenHeight = window.innerHeight;
    bubbles.forEach((bubble) => {
      bubble.x = Math.max(0, Math.min(bubble.x, screenWidth - bubble.size));
      bubble.y = Math.max(0, Math.min(bubble.y, screenHeight - bubble.size));
    });
  });

  // 先立即跑一轮文字分裂重组（加载后立刻可见）
  try { doTextCycleRecombine(); } catch {}

  // Update the timer to call both new cycles
  if (bubbleCycleTimer) { clearInterval(bubbleCycleTimer); bubbleCycleTimer = null; }
  bubbleCycleTimer = setInterval(() => {
    try {
      doTextCycleRecombine();
      doAudioCycleRecombine();
    } catch (e) {
      console.warn('bubble cycle error:', e);
    }
  }, 20000);

  // periodic expiry cleanup (every 60s)
  expireTimer = setInterval(() => {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    // remove DOM bubbles older than cutoff
    [...bubbles].forEach(b => {
      const ts = Number(b.element.dataset.timestamp) || 0;
      if (ts && ts < cutoff) removeRec(b);
    });
  }, 60000);
}

/* ============ 其他功能 ============ */
async function checkMicPermissions() {
  try { await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (err) { console.error('Cannot access microphone', err); alert('Cannot access microphone. Please check browser permissions.'); }
}
function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

/* ============ 事件绑定 ============ */
document.addEventListener('DOMContentLoaded', () => {
  installAudioUnlockOnce(); // set up unlock on first user gesture
  setStatus('Loading…', 'info');
  setGlobalLoading(true);

  // Faster, non-blocking loader: min 600ms to avoid flicker, max 1200ms hard cap
  const t0 = performance.now();
  const LOADER_MIN_MS = 600;
  const LOADER_MAX_MS = 1200;
  let overlayHidden = false;
  const hideOverlay = () => { if (!overlayHidden) { overlayHidden = true; setGlobalLoading(false); } };
  const maxTimer = setTimeout(hideOverlay, LOADER_MAX_MS);

  loadFromGAS()
    .catch(() => {})
    .finally(() => {
      const elapsed = performance.now() - t0;
      const wait = Math.max(0, LOADER_MIN_MS - elapsed);
      setTimeout(() => { clearTimeout(maxTimer); hideOverlay(); }, wait);
    });

  // Initialize slider progress once on load
  const el = ui.pitch?.();
  if (el) {
    const v = parseInt(el.value, 10) || 0;
    const min = parseInt(el.min || '0', 10);
    const max = parseInt(el.max || '100', 10);
    const pct = ((v - min) / (max - min)) * 100;
    el.style.setProperty('--p', `${Math.max(0, Math.min(100, pct))}%`);
  }

  $('recStart')?.addEventListener('click', startRec);

  $('recStop')?.addEventListener('click', async () => {
    const procBlob = await stopRec();
    if (!procBlob || !(procBlob instanceof Blob) || procBlob.size === 0) {
      alert('Recording is empty or failed. Please try again.'); return;
    }

    // Transcode first (for consistent preview/share)
    const targetExt = 'mp3';
    let out = { blob: procBlob, mime: procBlob.type || 'audio/webm', ext: 'webm' };
    try { out = await transcodeToTarget(procBlob, targetExt); }
    catch (e) { console.warn('Transcoding failed, will upload original format:', e); }

    // Show confirm modal with audio preview; only upload if user shares
    const previewUrl = URL.createObjectURL(out.blob);
    const choice = await showAudioShareConfirm({ url: previewUrl });
    if (choice !== 'share') {
      // delete/cancel: do not upload
      return;
    }

    // Proceed to share
    const dataURL = await blobToDataURL(out.blob);
    await submitToGAS({
      text: ($('bubbleText')?.value || '').trim(),
      audioB64: dataURL,
      audioMime: out.mime || 'audio/webm',
      filename: `recording_${Date.now()}.${out.ext}`
    });
    if ($('bubbleText')) $('bubbleText').value = '';
    await loadFromGAS();
  });

  $('generateBubble')?.addEventListener('click', async () => {
    const text = ($('bubbleText')?.value || '').trim();
    if (!text) return;
    await submitToGAS({ text });
    if ($('bubbleText')) $('bubbleText').value = '';
    await loadFromGAS();
  });

  $('testMic')?.addEventListener('click', async () => {
    try {
      const el = $('micMonitor');
      if (!el) return;

      // stop previous stream if exists
      try { el.srcObject?.getTracks()?.forEach(t => t.stop()); } catch(_) {}
      el.srcObject = null;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });

      el.srcObject = stream;
      el.muted = false;               // let user hear the mic
      el.volume = 1.0;
      el.autoplay = true;
      el.setAttribute('playsinline', '');
      el.controls = false;
      el.style.display = 'none';

      // remove previous custom UI if any
      const prev = document.getElementById('micMonitorUI');
      if (prev) prev.remove();

      const ui = buildCustomAudioUI(el, { live: true });
      ui.id = 'micMonitorUI';
      el.parentNode?.insertBefore(ui, el.nextSibling);

      // Try native element playback first; if blocked, route via WebAudio
      await el.play().catch(async () => {
        const ac = (window.Tone?.getContext?.()?.rawContext) ||
                   new (window.AudioContext || window.webkitAudioContext)();
        try { if (window.Tone?.start) await Tone.start(); } catch(_) {}
        try { await ac.resume?.(); } catch(_) {}

        // Create MediaStream source -> (gain) -> destination
        const src = ac.createMediaStreamSource
          ? ac.createMediaStreamSource(stream)
          : new MediaStreamAudioSourceNode(ac, { mediaStream: stream });
        const gain = ac.createGain ? ac.createGain() : null;
        if (gain) {
          gain.gain.value = 1;
          src.connect(gain);
          gain.connect(ac.destination);
        } else {
          src.connect(ac.destination);
        }
        // Store nodes for UI stop/toggle
        el._ctxNodes = { ctx: ac, src, gain };

        // Update UI to "playing" state
        el.dispatchEvent(new Event('play'));
      });
    } catch (e) {
      alert('Cannot access microphone. Please check permissions.');
    }
  });
});
