// ===== 变声：Tone.js 效果链 =====
let toneReady = false;
let mic;                 // Tone.UserMedia
let pitchShift, reverb, chorus, autoWah;
let eq3;
let mediaStreamDest;     // WebAudio MediaStreamDestination
let rec;                 // MediaRecorder for processed stream
let recChunks = [];

const ui = {
  pitch: () => $('uiPitch'),
  pitchVal: () => $('uiPitchVal'),
  robot: () => $('uiRobot'),
  chorus: () => $('uiChorus'),
  reverb: () => $('uiReverb'),
  eq: () => $('uiEq'),
  format: () => $('uiFormat'),
};

async function ensureToneChain() {
    if (toneReady) return;
    await Tone.start();
  
    mic = new Tone.UserMedia();
  
    // 取下拉框选择的 deviceId（如无则默认）
    const deviceId = document.getElementById('micSelect')?.value;
    const constraints = deviceId
      ? { audio: { deviceId: { exact: deviceId } } }
      : { audio: true };
  
    await mic.open(constraints);  // ⭐️ 用选中的设备
    console.log('🎤 mic opened with', constraints);

  // 2) 效果
  pitchShift = new Tone.PitchShift({ pitch: 0, windowSize: 0.1, delayTime: 0.01, feedback: 0 });
  chorus     = new Tone.Chorus(4, 2.5, 0.5).start();
  reverb     = new Tone.Reverb({ decay: 2.5, wet: 0.25 });
  autoWah    = new Tone.AutoWah({ baseFrequency: 100, octaves: 4, sensitivity: 0.5, Q: 1, gain: 0, wet: 0 }); // 机器人=1时打开
  eq3        = new Tone.EQ3(-0, -0, -0);

  // 3) 输出到页面（能听见） + 输出到 MediaStreamDestination（用来录）
  const ac = Tone.getContext().rawContext;
  mediaStreamDest = ac.createMediaStreamDestination();

  // 构建：mic -> pitch -> autoWah -> chorus -> reverb -> eq -> (destination + mediaStreamDest)
  mic.connect(pitchShift);
  pitchShift.connect(autoWah);
  autoWah.connect(chorus);
  chorus.connect(reverb);
  reverb.connect(eq3);

  // 到扬声器
  eq3.connect(Tone.getDestination());
  // 到录音流
  eq3.connect(mediaStreamDest);

  // UI 联动
  ui.pitch().addEventListener('input', () => {
    const v = parseInt(ui.pitch().value, 10) || 0;
    pitchShift.pitch = v;
    ui.pitchVal().textContent = String(v);
  });

  ui.robot().addEventListener('change', () => {
    autoWah.wet.value = ui.robot().checked ? 1 : 0;
  });

  ui.chorus().addEventListener('change', () => {
    chorus.wet.value = ui.chorus().checked ? 0.5 : 0;
  });

  ui.reverb().addEventListener('change', () => {
    reverb.wet.value = ui.reverb().checked ? 0.25 : 0;
  });

  ui.eq().addEventListener('change', () => {
    const p = ui.eq().value;
    switch (p) {
      case 'phone':  // 窄带电话感
        eq3.low.value = -12;  // 砍低频
        eq3.mid.value = -3;
        eq3.high.value = -12; // 砍高频
        break;
      case 'warm':
        eq3.low.value = +3;
        eq3.mid.value = 0;
        eq3.high.value = -2;
        break;
      case 'bright':
        eq3.low.value = -2;
        eq3.mid.value = 0;
        eq3.high.value = +4;
        break;
      default: // flat
        eq3.low.value = 0;
        eq3.mid.value = 0;
        eq3.high.value = 0;
    }
  });

  toneReady = true;
}

// ===== 录处理后的音：从 mediaStreamDest.stream 录 =====
function getRecorderForProcessedStream() {
  const mime = getSupportedMime(); // 你已有的函数，挑浏览器能录的容器（通常 webm/ogg）
  const r = new MediaRecorder(mediaStreamDest.stream, { mimeType: mime });
  r.ondataavailable = e => { if (e.data && e.data.size > 0) recChunks.push(e.data); };
  return r;
}

// ===== ffmpeg.wasm：把录到的 webm/ogg 转成用户选的目标格式 =====
let _ffmpeg;
async function ensureFfmpeg() {
  if (_ffmpeg) return _ffmpeg;
  const { createFFmpeg } = FFmpeg;
  _ffmpeg = createFFmpeg({ log: false });
  await _ffmpeg.load();
  return _ffmpeg;
}

/** inputBlob -> { blob, mime, ext } to target: m4a/mp3/ogg/webm */
async function transcodeToTarget(inputBlob, targetExt) {
    const t = (inputBlob.type || '').toLowerCase();
    if ((targetExt === 'm4a' && (t.includes('mp4') || t.includes('aac'))) ||
        (targetExt === 'mp3' && t.includes('mpeg')) ||
        (targetExt === 'ogg' && t.includes('ogg')) ||
        (targetExt === 'webm' && t.includes('webm'))) {
      return { blob: inputBlob, mime: inputBlob.type || guessMimeByExt(targetExt), ext: targetExt };
    }
  
    const ffmpeg = await ensureFfmpeg();
  
    const inName = t.includes('ogg') ? 'in.ogg' : (t.includes('webm') ? 'in.webm' : 'in.dat');
    const arr = new Uint8Array(await inputBlob.arrayBuffer());
    ffmpeg.FS('writeFile', inName, arr);
  
    async function runOnce(ext) {
      const outName = 'out.' + ext;
      let args;
      switch (ext) {
        case 'm4a': // AAC（很多 wasm 构建没有 aac 编码，可能会抛错）
          args = ['-i', inName, '-c:a', 'aac', '-b:a', '128k', '-movflags', 'faststart', outName];
          break;
        case 'mp3':
          args = ['-i', inName, '-c:a', 'libmp3lame', '-b:a', '192k', outName];
          break;
        case 'ogg':
          args = ['-i', inName, '-c:a', 'libopus', '-b:a', '96k', outName];
          break;
        case 'webm':
        default:
          args = ['-i', inName, '-c:a', 'libopus', '-b:a', '96k', outName];
      }
      await ffmpeg.run(...args);
      const data = ffmpeg.FS('readFile', outName);
      const mime = guessMimeByExt(ext);
      const blob = new Blob([data.buffer], { type: mime });
      try { ffmpeg.FS('unlink', outName); } catch {}
      return { blob, mime, ext };
    }
  
    try {
      // 先按用户选择来
      return await runOnce(targetExt);
    } catch (e) {
      console.warn('目标格式转码失败，尝试回退 MP3：', e);
      // 若目标是 m4a，但 aac 编码不可用，回退 MP3
      if (targetExt !== 'mp3') {
        try {
          return await runOnce('mp3');
        } catch (e2) {
          console.error('回退 MP3 也失败：', e2);
        }
      }
      throw e;
    } finally {
      try { ffmpeg.FS('unlink', inName); } catch {}
    }
  }
  
  if (audioUrl && audioUrl.trim()) {
    const safeUrl = normalizeDriveUrl(audioUrl.trim());
  
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.style.display = 'none';
    audio.crossOrigin = 'anonymous'; // 👈 新增
    audio.src = safeUrl;
  
    // 如果你在 row 里也存了 mime，可加上 <source type="..."> ：
    // const src = document.createElement('source');
    // src.src = safeUrl;
    // src.type = guessMimeFromExt(safeUrl); // 你可以写个根据后缀猜 type 的小函数
    // audio.appendChild(src);
  
    const btn = document.createElement('button');
    btn.className = 'audio-btn';
    btn.textContent = '▶ 播放';
  
    const dur = document.createElement('span');
    dur.style.marginLeft = '8px';
    dur.textContent = '';
  
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  
    audio.addEventListener('loadedmetadata', () => {
      dur.textContent = formatDuration(audio.duration);
    });
  
    audio.addEventListener('ended', () => {
      if (currentAudio === audio) {
        btn.textContent = '▶ 播放';
        currentAudio = null;
        currentBtn = null;
      }
    });
  
    btn.addEventListener('click', async () => {
      if (currentAudio && currentAudio !== audio) {
        currentAudio.pause();
        if (currentBtn) currentBtn.textContent = '▶ 播放';
      }
      if (audio.paused) {
        try {
          await audio.play();
          btn.textContent = '⏸ 暂停';
          currentAudio = audio;
          currentBtn = btn;
        } catch (e) {
          console.error('❌ 无法播放音频：', e);
          // 播放失败就降级为下载
          btn.remove(); dur.remove(); audio.remove();
          const link = document.createElement('a');
          link.href = safeUrl;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = isSafari
            ? '⬇ 下载收听（Safari 不支持此格式）'
            : '⬇ 下载收听（当前浏览器不支持此格式）';
          wrap.appendChild(link);
        }
      } else {
        audio.pause();
        btn.textContent = '▶ 播放';
        if (currentAudio === audio) {
          currentAudio = null;
          currentBtn = null;
        }
      }
    });
  }

// 根据 URL 粗略猜测 MIME
function guessMimeFromUrl(u) {
  const p = (u || '').split('?')[0].toLowerCase();
  if (p.endsWith('.m4a') || p.endsWith('.mp4')) return 'audio/mp4';
  if (p.endsWith('.mp3')) return 'audio/mpeg';
  if (p.endsWith('.wav')) return 'audio/wav';
  if (p.endsWith('.ogg') || p.endsWith('.oga')) return 'audio/ogg';
  if (p.endsWith('.webm')) return 'audio/webm';
  return '';
}

// 统一生成“语音泡泡”UI（放到工具函数区）
function buildAudioBubble(wrap, rawUrl) {
  const safeUrl = normalizeDriveUrl(rawUrl.trim());
  const lower = safeUrl.toLowerCase();

  // 能力探测
  const probe = document.createElement('audio');
  const canMp4  = !!probe.canPlayType && probe.canPlayType('audio/mp4');
  const canWebm = !!probe.canPlayType && probe.canPlayType('audio/webm');
  const canOgg  = !!probe.canPlayType && probe.canPlayType('audio/ogg');
  const looksMp4  = lower.includes('.m4a') || lower.includes('.mp4');
  const looksWebm = lower.includes('.webm');
  const looksOgg  = lower.includes('.ogg') || lower.includes('audio%2Fogg');

  const likelyUnsupported =
    (looksWebm && !canWebm) ||
    (looksOgg  && !canOgg)  ||
    (!looksMp4 && !looksWebm && !looksOgg && !canMp4);

  if (likelyUnsupported) {
    const link = document.createElement('a');
    link.href = safeUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = '⬇ 下载收听（当前浏览器不支持此格式）';
    wrap.appendChild(link);
    return;
  }

  // 用 <source type="..."> 帮助浏览器判定
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.style.display = 'none';
  // 不要设置 crossOrigin（Drive 多数无 CORS）

  const source = document.createElement('source');
  source.src = safeUrl;
  source.type = guessMimeFromUrl(safeUrl);
  audio.appendChild(source);

  const btn = document.createElement('button');
  btn.className = 'audio-btn';
  btn.textContent = '▶ 播放';

  const dur = document.createElement('span');
  dur.style.marginLeft = '8px';
  dur.textContent = '';

  audio.addEventListener('loadedmetadata', () => {
    dur.textContent = formatDuration(audio.duration);
  });
  audio.addEventListener('ended', () => {
    if (currentAudio === audio) {
      btn.textContent = '▶ 播放';
      currentAudio = null;
      currentBtn = null;
    }
  });
  audio.addEventListener('error', () => {
    console.error('❌ 音频加载失败', {
      src: source.src,
      networkState: audio.networkState,
      readyState: audio.readyState,
      error: audio.error
    });
  });

  btn.addEventListener('click', async () => {
    if (currentAudio && currentAudio !== audio) {
      currentAudio.pause();
      if (currentBtn) currentBtn.textContent = '▶ 播放';
    }
    if (audio.readyState === 0) audio.load();
    try {
      if (audio.paused) {
        await audio.play();
        btn.textContent = '⏸ 暂停';
        currentAudio = audio;
        currentBtn = btn;
      } else {
        audio.pause();
        btn.textContent = '▶ 播放';
        if (currentAudio === audio) {
          currentAudio = null;
          currentBtn = null;
        }
      }
    } catch (e) {
      console.error('❌ 无法播放音频：', e);
      btn.remove(); dur.remove(); audio.remove();
      const link = document.createElement('a');
      link.href = safeUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = '⬇ 下载收听（当前浏览器不支持此格式）';
      wrap.appendChild(link);
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(dur);
  wrap.appendChild(audio);
}
