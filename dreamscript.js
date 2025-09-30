/* ============ 小工具 ============ */
const $ = (id) => document.getElementById(id);
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwN2_h8gvABFBO4R13BaUMtigofFVRt-CCNy4Fqgl5WjCZZFDZs3xI53eelPe-Sk3eI/exec";

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
    try { await Tone.start(); } catch(e) { console.warn('AudioContext 解锁失败', e); }
  }
}

async function startRec() {
  await unlockAudioContext();
  await ensureToneChain();
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

  if (blob.size === 0) {
    console.error('❌ 录音数据为空或损坏');
    return null;
  }
  return blob;
}

/* ============ ffmpeg.wasm 转码（仅一份） ============ */
let ffmpegInstance;
async function ensureFfmpegScript() {
  if (window.FFmpeg?.createFFmpeg) return true;
  const cdns = [
    './lib/ffmpeg/ffmpeg.min.js', // 本地优先（建议把文件放到此路径）
    'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/ffmpeg.min.js',
    'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/ffmpeg.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.10/ffmpeg.min.js'
  ];
  for (const src of cdns) {
    try {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
      if (window.FFmpeg?.createFFmpeg) return true;
    } catch (_) {}
  }
  return false;
}

async function ensureFFmpeg() {
  const ok = await ensureFfmpegScript();
  if (!ok) throw new Error('FFmpeg script 加载失败');
  if (ffmpegInstance) return ffmpegInstance;
  const { createFFmpeg } = window.FFmpeg;
  const ff = createFFmpeg({
    log: false,
    corePath: new URL('./lib/ffmpeg/ffmpeg-core.js', location.href).href // 本地 core（相对当前页面）
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
function loadFromGAS() {
  return new Promise((resolve, reject) => {
    window.receiveRows = (data) => {
      try {
        if (!data || !data.ok) throw new Error(data && data.error || 'unknown');
        renderRows(Array.isArray(data.rows) ? data.rows : []);
        resolve(true);
      } catch (e) { console.error('❌ 数据解析失败：', e); reject(e); }
    };
    const s = document.createElement('script');
    s.src = `${WEB_APP_URL}?callback=receiveRows&limit=${LIMIT}&inline=1&_=${Date.now()}`;
    s.onerror = (e) => { console.error('❌ JSONP 加载失败', e); reject(e); };
    document.body.appendChild(s);
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

function renderRows(rows) {
  const container = $('bubbleContainer');
  if (!container) { console.error('❌ Missing #bubbleContainer'); return; }
  container.innerHTML = '';

  const bubbles = [];
  let screenWidth = window.innerWidth;
  let screenHeight = window.innerHeight;

  const createBubble = ({ text, timestamp, audioUrl, audioMime, audioData }, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'bubble';
    wrap.dataset.timestamp = timestamp || Date.now();

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
      audio.controls = true;
      const source = document.createElement('source');
      source.src = audioData || normalizeDriveUrl(audioUrl.trim());
      source.type = audioMime || guessMimeFromUrl(audioUrl);
      audio.appendChild(source);
      content.appendChild(audio);
    }

    wrap.appendChild(content);
    container.appendChild(wrap);

    // Track this bubble
    const rec = { element: wrap, x, y, velocityX, velocityY, size: bubbleSize };
    bubbles.push(rec);

    // Pause motion + precisely expand to fit all content on hover
    const initial = { width: bubbleSize, height: bubbleSize };

    wrap.addEventListener('mouseenter', () => {
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

  rows.forEach(({ text, timestamp, audioUrl, audioMime, audioData }, idx) => {
    if (!text && !audioUrl && !audioData) return;
    createBubble({ text, timestamp, audioUrl, audioMime, audioData }, idx);
  });

  // Animate bubbles
  function animateBubbles() {
    bubbles.forEach((bubble) => {
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
  loadFromGAS().catch(console.error);

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

    // Hardcoded MP3 as the target format
    const targetExt = 'mp3';
    let out = { blob: procBlob, mime: procBlob.type || 'audio/webm', ext: 'webm' };
    try { out = await transcodeToTarget(procBlob, targetExt); }
    catch (e) { console.warn('转码失败，将上传原始格式：', e); }

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const el = $('micMonitor');
      if (el) {
        el.srcObject = stream;
        el.style.display = 'block';
        await el.play().catch(()=>{});
      }
    } catch (e) {
      alert('无法访问麦克风，请检查权限');
    }
  });
});
