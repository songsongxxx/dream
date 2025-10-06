/* ============ 小工具 ============ */
const $ = (id) => document.getElementById(id);
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwN2_h8gvABFBO4R13BaUMtigofFVRt-CCNy4Fqgl5WjCZZFDZs3xI53eelPe-Sk3eI/exec";

/* Client-side lifetime and split FX configs */
const BUBBLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days
const SPLIT_INTERVAL_MS = 25000;                   // every 25s try splitting a bubble
const SPLIT_DURATION_MS = 3500;                    // one split cycle duration
const SHARD_COUNT_MIN = 5, SHARD_COUNT_MAX = 9;    // number of shards per split

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

/* New: separate stream for the Test Mic monitor (independent of Tone.js chain) */
let testMicStream = null;

/* New: track Tone mic open state and shared constraints */
let micOpen = false;
const defaultMicConstraints = { audio: true };

/* New helpers: reopen/close Tone mic */
async function ensureMicOpen() {
  if (micOpen) return;
  if (!mic) return;
  try {
    await mic.open(defaultMicConstraints);
    micOpen = true;
    console.log('🎤 Mic opened');
  } catch (e) {
    console.warn('Failed to open mic', e);
  }
}
async function closeToneMic() {
  if (!micOpen || !mic?.close) return;
  try {
    await mic.close();
  } catch (_) {}
  micOpen = false;
  console.log('🔇 Mic closed');
}

async function ensureToneChain() {
  if (toneReady) return;
  await Tone.start();

  mic = new Tone.UserMedia();
  await mic.open(defaultMicConstraints);
  micOpen = true;
  console.log('🎤 Default mic opened with', defaultMicConstraints);

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
    try { await Tone.start(); } catch(e) { console.warn('AudioContext 解锁失败', e); }
  }
}

async function startRec() {
  await unlockAudioContext();
  await ensureToneChain();
  await ensureMicOpen(); // New: reopen mic if it was closed
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

  // New: also stop/close the Tone.js microphone
  await closeToneMic();

  if (blob.size === 0) {
    console.error('❌ 录音数据为空或损坏');
    return null;
  }
  return blob;
}

/* ============ ffmpeg.wasm 转码（仅一份） ============ */
let ffmpegInstance;
/* New: remember the core path that matches the loaded ffmpeg.min.js */
let ffmpegCorePath = null;

async function ensureFfmpegScript() {
  // If already present, return a usable corePath (fallback to CDN)
  if (window.FFmpeg?.createFFmpeg) {
    return ffmpegCorePath || 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/ffmpeg-core.js';
  }
  const candidates = [
    './lib/ffmpeg/ffmpeg.min.js', // Local (if you host files here)
    'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/ffmpeg.min.js',
    'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/ffmpeg.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.10/ffmpeg.min.js'
  ];
  for (const minSrc of candidates) {
    try {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = minSrc;
        s.crossOrigin = 'anonymous';
        s.referrerPolicy = 'no-referrer';
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
      if (window.FFmpeg?.createFFmpeg) {
        // Derive ffmpeg-core.js from the successful min.js URL
        const absMin = new URL(minSrc, location.href);
        const coreAbs = new URL('ffmpeg-core.js', absMin);
        ffmpegCorePath = coreAbs.href;
        return ffmpegCorePath;
      }
    } catch (_) {
      // try next candidate
    }
  }
  return '';
}

async function ensureFFmpeg() {
  const corePath = await ensureFfmpegScript();
  if (!corePath) throw new Error('FFmpeg script 加载失败');
  if (ffmpegInstance) return ffmpegInstance;
  const { createFFmpeg } = window.FFmpeg;
  const ff = createFFmpeg({
    log: false,
    /* Updated: use derived corePath instead of always local */
    corePath
  });
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
    console.warn('目标格式转码失败，回退 MP3：', e);
    return await run('mp3', ['-i', inName, '-vn', '-c:a', 'libmp3lame', '-b:a', '160k']);
  }
}

/* ============ 与 GAS 交互（表单 POST & JSONP 读） ============ */
const LIMIT = 5; // 内联条数，避免过大脚本
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
/* New: lightweight status helper */
function setStatus(msg) {
  const el = $('statusMsg');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}
async function submitToGAS({ text = '', audioB64 = '', audioMime = '', filename = '' }) {
  const timestamp = Date.now(); // Add a timestamp for the bubble
  await postViaHiddenForm(WEB_APP_URL, {
    text,
    audio_b64: audioB64,
    audio_mime: audioMime,
    filename,
    timestamp // Include the timestamp in the submission
  });
}
/* Updated: robust JSONP with unique callback + timeout + cleanup */
function loadFromGAS() {
  return new Promise((resolve) => {
    const cb = 'receiveRows_' + Date.now();
    let finished = false;

    function cleanup(scriptEl) {
      try { delete window[cb]; } catch {}
      if (scriptEl?.parentNode) scriptEl.parentNode.removeChild(scriptEl);
    }

    window[cb] = (data) => {
      if (finished) return;
      finished = true;
      try {
        if (!data || !data.ok) throw new Error((data && data.error) || 'unknown');
        renderRows(Array.isArray(data.rows) ? data.rows : []);
        setStatus('');
        resolve(true);
      } catch (e) {
        console.error('❌ 数据解析失败：', e);
        setStatus('服务不可用（GAS 错误）');
        resolve(false);
      } finally {
        cleanup(scriptEl);
      }
    };

    const scriptEl = document.createElement('script');
    scriptEl.src = `${WEB_APP_URL}?callback=${cb}&limit=${LIMIT}&inline=1&_=${Date.now()}`;
    scriptEl.onerror = () => {
      if (finished) return;
      finished = true;
      setStatus('服务不可用（网络/CORS/403）');
      cleanup(scriptEl);
      resolve(false);
    };
    document.body.appendChild(scriptEl);

    // Timeout guard
    setTimeout(() => {
      if (finished) return;
      finished = true;
      setStatus('服务不可用（超时/403）');
      cleanup(scriptEl);
      resolve(false);
    }, 8000);
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

/* Helpers: audio UI builder and content utils */
function buildCustomAudioControls(audio, contentEl) {
  // Remove any existing custom UI
  contentEl.querySelectorAll('.audio-ui').forEach(n => n.remove());

  const aui = document.createElement('div');
  aui.className = 'audio-ui';

  const playBtn = document.createElement('button');
  playBtn.className = 'audio-play';
  playBtn.type = 'button';
  playBtn.textContent = '▶';

  const progress = document.createElement('input');
  progress.className = 'audio-progress';
  progress.type = 'range';
  progress.min = '0';
  progress.max = '1';
  progress.step = '0.01';
  progress.value = '0';
  progress.disabled = true;

  const volWrap = document.createElement('div');
  volWrap.className = 'audio-vol';
  const volBtn = document.createElement('button');
  volBtn.className = 'audio-vol-btn';
  volBtn.type = 'button';
  volBtn.textContent = '🔊';
  const vol = document.createElement('input');
  vol.className = 'audio-volume';
  vol.type = 'range';
  vol.min = '0';
  vol.max = '1';
  vol.step = '0.01';
  vol.value = '1';
  volWrap.appendChild(volBtn);
  volWrap.appendChild(vol);

  const timeEl = document.createElement('span');
  timeEl.className = 'audio-time';
  timeEl.textContent = '00:00 / 00:00';

  aui.appendChild(playBtn);
  aui.appendChild(progress);
  aui.appendChild(volWrap);
  aui.appendChild(timeEl);
  contentEl.appendChild(aui);

  audio.addEventListener('loadedmetadata', () => {
    const dur = isFinite(audio.duration) ? audio.duration : 0;
    progress.max = String(dur || 1);
    progress.step = '0.01';
    progress.disabled = !dur;
    timeEl.textContent = `${formatDuration(0)} / ${formatDuration(dur)}`;
  });

  audio.addEventListener('timeupdate', () => {
    if (!progress.disabled) progress.value = String(audio.currentTime || 0);
    const dur = isFinite(audio.duration) ? audio.duration : 0;
    timeEl.textContent = `${formatDuration(audio.currentTime || 0)} / ${formatDuration(dur)}`;
  });

  audio.addEventListener('ended', () => {
    playBtn.textContent = '▶';
    playBtn.classList.remove('is-playing');
    progress.value = '0';
  });

  function syncVolIcon() {
    if (audio.muted || +vol.value === 0) {
      volBtn.textContent = '🔇';
    } else if (+vol.value < 0.5) {
      volBtn.textContent = '🔈';
    } else {
      volBtn.textContent = '🔊';
    }
  }
  audio.volume = 1;
  audio.muted = false;
  syncVolIcon();

  vol.addEventListener('input', () => {
    const v = parseFloat(vol.value || '0') || 0;
    audio.volume = v;
    if (v > 0 && audio.muted) audio.muted = false;
    syncVolIcon();
  });
  volBtn.addEventListener('click', () => {
    audio.muted = !audio.muted;
    if (audio.muted) {
      vol.dataset.prev = vol.value;
      vol.value = '0';
    } else {
      const prev = vol.dataset.prev;
      if (prev) {
        vol.value = prev;
        audio.volume = parseFloat(prev || '0') || 0.5;
      } else if (+vol.value === 0) {
        vol.value = '0.5';
        audio.volume = 0.5;
      }
    }
    syncVolIcon();
  });
  audio.addEventListener('volumechange', syncVolIcon);

  playBtn.addEventListener('click', async () => {
    if (audio.paused) {
      if (currentAudio && currentAudio !== audio) {
        try { currentAudio.pause(); } catch {}
        if (currentBtn) {
          currentBtn.textContent = '▶';
          currentBtn.classList.remove('is-playing');
        }
      }
      currentAudio = audio;
      currentBtn = playBtn;
      try { await audio.play(); } catch {}
      playBtn.textContent = '⏸';
      playBtn.classList.add('is-playing');
    } else {
      audio.pause();
      playBtn.textContent = '▶';
      playBtn.classList.remove('is-playing');
    }
  });

  progress.addEventListener('input', () => {
    if (!progress.disabled) {
      audio.currentTime = parseFloat(progress.value || '0') || 0;
    }
  });

  return aui;
}
function getBubbleText(rec) {
  const el = rec.element.querySelector('.bubble-text');
  return el ? (el.textContent || '') : '';
}
function getBubbleAudio(rec) {
  const src = rec.element.querySelector('audio source');
  if (!src) return null;
  return { src: src.getAttribute('src') || '', type: src.getAttribute('type') || '' };
}
function updateBubbleTypeClass(wrap) {
  wrap.classList.remove('bubble--text', 'bubble--audio');
  const hasText = !!wrap.querySelector('.bubble-text');
  const hasAudio = !!wrap.querySelector('audio');
  if (hasAudio) wrap.classList.add('bubble--audio');
  else if (hasText) wrap.classList.add('bubble--text');
}
function setBubbleContent(rec, { text, audioSrc, audioType }) {
  const wrap = rec.element;
  const contentEl = wrap.querySelector('.bubble-content');
  if (!contentEl) return;

  // Text update
  let textEl = contentEl.querySelector('.bubble-text');
  if (text && text.trim()) {
    if (!textEl) {
      textEl = document.createElement('div');
      textEl.className = 'bubble-text';
      contentEl.insertBefore(textEl, contentEl.firstChild);
    }
    textEl.textContent = text;
  } else if (textEl) {
    textEl.remove();
  }

  // Remove existing audio + custom UI
  contentEl.querySelectorAll('.audio-ui').forEach(n => n.remove());
  const oldAudio = contentEl.querySelector('audio');
  if (oldAudio) oldAudio.remove();

  // Audio update
  if (audioSrc) {
    const audio = document.createElement('audio');
    audio.controls = false;
    const source = document.createElement('source');
    source.src = audioSrc;
    if (audioType) source.type = audioType;
    audio.appendChild(source);
    contentEl.appendChild(audio);
    buildCustomAudioControls(audio, contentEl);
  }

  // Update type class
  updateBubbleTypeClass(wrap);
}

/* Choose a partner to recombine with (prefer same-type) */
function choosePartner(bubbles, rec) {
  const candidates = bubbles.filter(b =>
    b !== rec &&
    !b.splitting &&
    !b._hover &&
    !b.element.classList.contains('bubble--open')
  );
  if (!candidates.length) return null;

  const recHasAudio = !!getBubbleAudio(rec);
  const sameType = candidates.filter(c => !!getBubbleAudio(c) === recHasAudio);
  const pool = sameType.length ? sameType : candidates;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

/* Recombine text and audio content of two bubbles */
function recombinePair(aRec, bRec) {
  // Text recombination
  const aText = getBubbleText(aRec);
  const bText = getBubbleText(bRec);
  let newAText = aText;
  let newBText = bText;
  if (aText && bText && aText.length > 1 && bText.length > 1) {
    const ai = Math.floor(Math.random() * (aText.length - 1)) + 1;
    const bi = Math.floor(Math.random() * (bText.length - 1)) + 1;
    newAText = aText.slice(0, ai) + bText.slice(bi);
    newBText = bText.slice(0, bi) + aText.slice(ai);
  }

  // Audio recombination (swap/move)
  const aAud = getBubbleAudio(aRec);
  const bAud = getBubbleAudio(bRec);
  let newAAudio = aAud, newBAudio = bAud;

  if (aAud && bAud) {
    // swap with 50% chance, or keep
    if (Math.random() < 0.8) { // bias to swap for visible effect
      newAAudio = bAud;
      newBAudio = aAud;
    }
  } else if (aAud && !bAud) {
    if (Math.random() < 0.5) { // move from A to B
      newAAudio = null;
      newBAudio = aAud;
    }
  } else if (!aAud && bAud) {
    if (Math.random() < 0.5) { // move from B to A
      newAAudio = bAud;
      newBAudio = null;
    }
  }

  // If the current playing audio is in A/B, pause it before rebuild
  if (currentAudio) {
    const aContains = aRec.element.contains(currentAudio);
    const bContains = bRec.element.contains(currentAudio);
    if (aContains || bContains) {
      try { currentAudio.pause(); } catch {}
      if (currentBtn) {
        currentBtn.textContent = '▶';
        currentBtn.classList.remove('is-playing');
      }
      currentAudio = null;
      currentBtn = null;
    }
  }

  // Apply updates
  setBubbleContent(aRec, {
    text: newAText,
    audioSrc: newAAudio?.src || '',
    audioType: newAAudio?.type || ''
  });
  setBubbleContent(bRec, {
    text: newBText,
    audioSrc: newBAudio?.src || '',
    audioType: newBAudio?.type || ''
  });
}

function renderRows(rows) {
  const container = $('bubbleContainer');
  if (!container) { console.error('❌ Missing #bubbleContainer'); return; }
  container.innerHTML = '';

  // Filter out expired bubbles (older than TTL); data in Drive is unchanged
  const now = Date.now();
  const freshRows = (rows || []).filter(r => {
    const ts = Number(r?.timestamp || 0);
    return !ts || (now - ts) < BUBBLE_TTL_MS;
  });

  const bubbles = [];
  let screenWidth = window.innerWidth;
  let screenHeight = window.innerHeight;

  const textures = [
    'dreamimages/texture01.png',
    'dreamimages/texture02.png',
    'dreamimages/texture03.png'
  ];

  const createBubble = ({ text, timestamp, audioUrl, audioMime, audioData }, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'bubble';
    wrap.dataset.timestamp = timestamp || Date.now();

    // New: tag bubble type
    const hasAudio = !!(audioUrl || audioData);
    if (hasAudio) {
      wrap.classList.add('bubble--audio');
    } else if (text) {
      wrap.classList.add('bubble--text');
    }

    // Assign a random texture overlay
    const randomTexture = textures[Math.floor(Math.random() * textures.length)];
    wrap.style.setProperty('--bubble-texture', `url(${randomTexture})`);

    // Random initial position and slower velocity
    const bubbleSize = Math.random() * 50 + 50; // Random size between 50px and 100px
    const x = Math.random() * (screenWidth - bubbleSize);
    const y = Math.random() * (screenHeight - bubbleSize);
    const velocityX = (Math.random() - 0.5) * 0.5; // Further reduced velocity between -0.25 and 0.25
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
    if (audioUrl || audioData) {
      const audio = document.createElement('audio');
      audio.controls = false; // custom UI
      const source = document.createElement('source');
      const initialAudioSrc = audioData || normalizeDriveUrl(audioUrl.trim());
      const initialAudioType = audioMime || guessMimeFromUrl(audioUrl);
      source.src = initialAudioSrc;
      source.type = initialAudioType;
      audio.appendChild(source);
      content.appendChild(audio);

      // Refactor: build audio UI via helper
      buildCustomAudioControls(audio, content);
    }

    wrap.appendChild(content);
    container.appendChild(wrap);

    // Track this bubble
    const rec = { element: wrap, x, y, velocityX, velocityY, size: bubbleSize, splitting: false, _hover: false };
    bubbles.push(rec);

    // Ensure type class is accurate after content is added
    updateBubbleTypeClass(wrap);

    // Pause motion + precisely expand to fit all content on hover
    const initial = { width: bubbleSize, height: bubbleSize };

    wrap.addEventListener('mouseenter', () => {
      rec._hover = true;
      // pause movement
      rec._vx = rec.velocityX; rec._vy = rec.velocityY;
      rec.velocityX = 0; rec.velocityY = 0;

      // enable measuring (children laid out but invisible)
      wrap.classList.add('bubble--measuring');

      const contentEl = wrap.querySelector('.bubble-content');
      if (!contentEl) return;

      // IMPORTANT: remove tiny fixed size so content can define size
      wrap.style.width = 'auto';
      wrap.style.height = 'auto';
      wrap.style.maxWidth = '90vw';
      wrap.style.maxHeight = '90vh';

      // readable max measure width
      const maxMeasureWidth = Math.min(window.innerWidth * 0.9, 720);
      contentEl.style.maxWidth = maxMeasureWidth + 'px';

      // force reflow to get correct sizes (incl. audio)
      // eslint-disable-next-line no-unused-expressions
      contentEl.offsetWidth;

      const padding = 16; // keep in sync with CSS .bubble--open padding
      const rect = contentEl.getBoundingClientRect();
      const targetW = Math.ceil(rect.width) + padding * 2;
      const targetH = Math.ceil(rect.height) + padding * 2;

      const finalW = Math.min(targetW, Math.floor(window.innerWidth * 0.9));
      const finalH = Math.min(targetH, Math.floor(window.innerHeight * 0.9));

      // apply exact size and open visuals
      wrap.style.width = finalW + 'px';
      wrap.style.height = finalH + 'px';
      wrap.classList.add('bubble--open');
      wrap.classList.remove('bubble--measuring');

      // keep fully on-screen
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
      rec._hover = false;
      // resume movement
      rec.velocityX = rec._vx ?? rec.velocityX;
      rec.velocityY = rec._vy ?? rec.velocityY;

      // restore original small bubble look
      wrap.classList.remove('bubble--open', 'bubble--measuring');
      wrap.style.maxWidth = '';
      wrap.style.maxHeight = '';
      wrap.style.width = initial.width + 'px';
      wrap.style.height = initial.height + 'px';
    });

    return wrap;
  };

  // Use filtered rows (client-side TTL)
  freshRows.forEach(({ text, timestamp, audioUrl, audioMime, audioData }, idx) => {
    if (!text && !audioUrl && !audioData) return;
    createBubble({ text, timestamp, audioUrl, audioMime, audioData }, idx);
  });

  // Animate bubbles
  function animateBubbles() {
    bubbles.forEach((bubble) => {
      // Skip movement while splitting
      if (bubble.splitting) return;

      // Update position
      bubble.x += bubble.velocityX;
      bubble.y += bubble.velocityY;

      // Bounce off edges
      if (bubble.x <= 0 || bubble.x + bubble.size >= screenWidth) {
        bubble.velocityX *= -1;
        bubble.x = Math.max(0, Math.min(bubble.x, screenWidth - bubble.size));
      }
      if (bubble.y <= 0 || bubble.y + bubble.size >= screenHeight) {
        bubble.velocityY *= -1;
        bubble.y = Math.max(0, Math.min(bubble.y, screenHeight - bubble.size));
      }

      // Apply updated position
      bubble.element.style.left = `${bubble.x}px`;
      bubble.element.style.top = `${bubble.y}px`;
    });

    requestAnimationFrame(animateBubbles);
  }

  animateBubbles();

  // Periodic split/regroup effect
  function splitBubble(rec) {
    if (!rec || rec.splitting) return;
    if (rec.element.classList.contains('bubble--open') || rec._hover) return;

    rec.splitting = true;

    // pause motion
    rec._vx = rec.velocityX; rec._vy = rec.velocityY;
    rec.velocityX = 0; rec.velocityY = 0;

    // Hide original bubble during split
    const original = rec.element;
    const prevVis = original.style.visibility;
    original.style.visibility = 'hidden';

    const centerX = rec.x + rec.size / 2;
    const centerY = rec.y + rec.size / 2;

    const shardCount = Math.floor(Math.random() * (SHARD_COUNT_MAX - SHARD_COUNT_MIN + 1)) + SHARD_COUNT_MIN;
    const shards = [];
    for (let i = 0; i < shardCount; i++) {
      const shard = document.createElement('div');
      shard.className = 'bubble-shard';
      // start at center
      shard.style.left = `${centerX}px`;
      shard.style.top = `${centerY}px`;
      container.appendChild(shard);

      // target direction
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * Math.max(40, rec.size / 1.8) + 20;
      const target = { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
      shards.push({ el: shard, start: { x: centerX, y: centerY }, mid: target });
    }

    const startTime = performance.now();
    const half = SPLIT_DURATION_MS / 2;

    function animate(now) {
      const t = now - startTime;

      if (t <= SPLIT_DURATION_MS) {
        shards.forEach(s => {
          let x, y;
          if (t <= half) {
            // outwards [0..1]
            const p = t / half;
            x = s.start.x + (s.mid.x - s.start.x) * p;
            y = s.start.y + (s.mid.y - s.start.y) * p;
          } else {
            // inwards [0..1]
            const p = (t - half) / half;
            x = s.mid.x + (s.start.x - s.mid.x) * p;
            y = s.mid.y + (s.start.y - s.mid.y) * p;
          }
          s.el.style.left = `${x}px`;
          s.el.style.top = `${y}px`;
        });
        requestAnimationFrame(animate);
      } else {
        // cleanup shards
        shards.forEach(s => s.el.remove());

        // New: pick a partner and recombine content
        const partner = choosePartner(bubbles, rec);
        if (partner) {
          try { recombinePair(rec, partner); } catch (e) { console.warn('Recombine failed', e); }
        }

        // restore original bubble
        original.style.visibility = prevVis || 'visible';
        // resume motion
        rec.velocityX = rec._vx ?? rec.velocityX;
        rec.velocityY = rec._vy ?? rec.velocityY;
        rec.splitting = false;
      }
    }
    requestAnimationFrame(animate);
  }

  // Try to split a random bubble at intervals
  const splitTimer = setInterval(() => {
    if (!bubbles.length) return;
    const candidates = bubbles.filter(b => !b.splitting && !b.element.classList.contains('bubble--open') && !b._hover);
    if (!candidates.length) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    splitBubble(pick);
  }, SPLIT_INTERVAL_MS);

  // Update screen dimensions on resize
  window.addEventListener('resize', () => {
    screenWidth = window.innerWidth;
    screenHeight = window.innerHeight;
    // Ensure bubbles remain within the new screen dimensions
    bubbles.forEach((bubble) => {
      bubble.x = Math.max(0, Math.min(bubble.x, screenWidth - bubble.size));
      bubble.y = Math.max(0, Math.min(bubble.y, screenHeight - bubble.size));
    });
  });

  // Optional: clear interval when a new render happens (container is re-rendered each load)
  container._splitTimer && clearInterval(container._splitTimer);
  container._splitTimer = splitTimer;
}

/* ============ 其他功能 ============ */
async function checkMicPermissions() {
  try { await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (err) { console.error('无法访问麦克风', err); alert('无法访问麦克风，请检查浏览器权限'); }
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
  loadFromGAS().catch(() => setStatus('服务不可用（初始化失败）'));

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
      alert('录音为空或失败，请重试'); return;
    }

    // New: no FFmpeg by default. Use the recorder's native type and derive extension.
    const type = (procBlob.type || 'audio/webm').toLowerCase();
    const outExt =
      type.includes('mp4') || type.includes('aac') ? 'm4a' :
      type.includes('ogg') ? 'ogg' :
      type.includes('webm') ? 'webm' :
      'webm';
    const outMime = type || (outExt === 'm4a' ? 'audio/mp4' : outExt === 'ogg' ? 'audio/ogg' : 'audio/webm');

    const dataURL = await blobToDataURL(procBlob);
    await submitToGAS({
      text: ($('bubbleText')?.value || '').trim(),
      audioB64: dataURL,
      audioMime: outMime,
      filename: `recording_${Date.now()}.${outExt}`
    });
    if ($('bubbleText')) $('bubbleText').value = '';
    const ok = await loadFromGAS();
    if (!ok) setStatus('已提交，但读取失败（稍后自动重试）');
  });

  $('generateBubble')?.addEventListener('click', async () => {
    const text = ($('bubbleText')?.value || '').trim();
    if (!text) return;
    await submitToGAS({ text });
    if ($('bubbleText')) $('bubbleText').value = '';
    const ok = await loadFromGAS();
    if (!ok) setStatus('已提交，但读取失败（稍后自动重试）');
  });

  /* Updated: toggle Test Mic on/off, without touching the Tone.js mic */
  $('testMic')?.addEventListener('click', async () => {
    const btn = $('testMic');
    const el = $('micMonitor');

    // If already testing, stop and clean up
    if (testMicStream) {
      try { testMicStream.getTracks().forEach(t => t.stop()); } catch {}
      testMicStream = null;
      if (el) {
        el.pause();
        el.srcObject = null;
        el.style.display = 'none';
      }
      if (btn) btn.textContent = 'Test Mic';
      return;
    }

    // Start monitoring
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      testMicStream = stream;
      if (el) {
        el.srcObject = stream;
        el.style.display = 'block';
        await el.play().catch(() => {});
      }
      if (btn) btn.textContent = 'Stop Test';
    } catch (e) {
      alert('无法访问麦克风，请检查权限');
    }
  });
});

// Clean up streams on page exit
window.addEventListener('beforeunload', () => {
  if (testMicStream) {
    try { testMicStream.getTracks().forEach(t => t.stop()); } catch {}
  }
  if (micOpen && mic?.close) {
    try { mic.close(); } catch {}
    micOpen = false;
  }
});
