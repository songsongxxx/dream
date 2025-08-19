// dreamscript.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';


// 🪪 替换为你自己的 Supabase 项目地址和 Key
const supabaseUrl = 'https://uytyxroguktgsymkkoke.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5dHl4cm9ndWt0Z3N5bWtrb2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI2NDc2MDQsImV4cCI6MjA1ODIyMzYwNH0.Yn6-gOjT3ZRJvAaO-czhb0IME5JP5g2IEi97TbAA_BU';
const supabase = createClient(supabaseUrl, supabaseKey);


let mediaRecorder;
let allChunks = [];
let recordingStream;

// 开始实时试音变声
let mic, pitchShift, bitCrusher, delay, reverb;
let isTesting = false;
let gain;  // Declare globally
let isToneStarted = false;


// 🌟 弹出进入梦境提示
function createDreamOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "dream-overlay";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.background = "rgba(255, 255, 255, 0.8)";
    overlay.style.backdropFilter = "blur(10px)";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "9999";
    overlay.style.cursor = "pointer";
    overlay.innerHTML = `<div style="
    font-family: 'PencilPete', sans-serif;
font-weight: bold; /* 让浏览器伪加粗一点点 */
        font-size: 24px;
        color: #444;
        padding: 20px 30px;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 20px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        text-align: center;
        backdrop-filter: blur(8px);
        ">Touch to enter the dream 🎧</div>`;

    document.body.appendChild(overlay);

    overlay.addEventListener("click", async () => {
        await Tone.start();
        await startBackgroundNoise();
        overlay.remove(); // 移除提示层
        console.log("🌟 Dream started");
    });
}

// 页面加载完弹出
window.addEventListener("DOMContentLoaded", () => {
    createDreamOverlay();
});


// 🌟 持续的背景白噪音
let backgroundNoise, backgroundFilter;
let isBackgroundNoiseStarted = false;

async function startBackgroundNoise() {
    await Tone.start(); // 启动 Tone.js 音频上下文
    backgroundNoise = new Tone.Noise('white').start();
    backgroundFilter = new Tone.Filter(800, "lowpass").toDestination();
    backgroundNoise.connect(backgroundFilter);
    backgroundNoise.volume.value = -10;
    console.log("🎵 背景白噪音已启动");
}

// 检查并启动白噪音
function ensureBackgroundNoise() {
    if (!isBackgroundNoiseStarted) {
        startBackgroundNoise();
        isBackgroundNoiseStarted = true;
    }
}

// 页面加载完成时，监听第一次用户交互
window.addEventListener("DOMContentLoaded", () => {
    document.body.addEventListener("click", ensureBackgroundNoise, { once: true });
    document.body.addEventListener("touchstart", ensureBackgroundNoise, { once: true });
});



// volumeVal

document.getElementById("testToneBtn").addEventListener("click", async () => {
    const volumeSlider = document.getElementById("volumeSlider");
    const volumeVal = volumeSlider ? parseFloat(volumeSlider.value) : 1; // 默认音量 1

    // Only create the gain node if it's not already created
    if (!gain) {
        gain = new Tone.Gain(volumeVal);
    } else {
        gain.gain.value = volumeVal;  // Update gain value if the gain node already exists
    }


    if (!isTesting) {
        if (!isToneStarted) {
            await Tone.start(); // Ensure Tone.js context is started only once
            isToneStarted = true;
        }
        mic = new Tone.UserMedia();

        
        // 从 UI 获取数值
        const pitch = parseFloat(document.getElementById("pitchSlider").value);
        const reverbT = parseFloat(document.getElementById("reverbSlider").value);
        const bit = parseInt(document.getElementById("bitSlider").value);
        const delayT = parseFloat(document.getElementById("delaySlider").value);

        // 实时音效链
        pitchShift = new Tone.PitchShift({ pitch });
        bitCrusher = new Tone.BitCrusher(bit);
        delay = new Tone.FeedbackDelay(delayT);
        reverb = new Tone.Reverb({ decay: reverbT });

        // 连接音效链
        mic.connect(pitchShift);
        pitchShift.connect(bitCrusher);
        bitCrusher.connect(delay);
        delay.connect(reverb);
        reverb.toDestination();
        reverb.connect(gain);
        gain.toDestination();

        await mic.open();
        console.log("sound test");
        isTesting = true;
        document.getElementById("testToneBtn").textContent = "stop";
        
    } else {
        // 停止试音
        mic.close();
        mic.disconnect();
        pitchShift.disconnect();
        bitCrusher.disconnect();
        delay.disconnect();
        reverb.disconnect();
        isTesting = false;
        console.log("🛑 已关闭试音");
        document.getElementById("testToneBtn").textContent = "testing sounds";



    }
});


// 保存文字 + Base64音频到 Supabase xx
export async function saveBubbleToSupabase(text, audioBase64 = null) {
    console.log("📤 上传内容：", { text, hasAudio: !!audioBase64 });

    const { data, error } = await supabase
        .from('dreams')
        .insert([
            { text: text, audio_url: audioBase64, created_at: new Date().toISOString() }
        ], { returning: 'representation' }); // 返回插入的内容

    if (error) {
        console.error("❌ 存储失败:", error.message);
    } else {
        console.log("✅ 已存入 Supabase:", data);
        // ✅ 新增：立即生成泡泡
        if (!error) {
            console.log("✅ 已存入 Supabase:", data);
            const bubbleText = text || "";
            createAndAppendBubble(bubbleText, audioBase64); // 直接用传入的数据生成泡泡
        }
    }
}



// 录音处理
export function startRecording() {

        // 录音开始前，先暂停白噪音
        if (backgroundNoise) {
            backgroundNoise.stop();
            console.log('🌫️ 白噪音暂停录音中...');
        }
    
        
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        recordingStream = stream;
        allChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => e.data.size > 0 && allChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const fullBlob = new Blob(allChunks, { type: 'audio/webm' });
            if (fullBlob.size === 0) return;

            const text = document.getElementById("bubbleText")?.value.trim() || "";
            processAudioWithTone(fullBlob, text);
        };
        mediaRecorder.start();
    });
}

export function stopRecording() {

        // 录音结束后，恢复白噪音
        if (backgroundNoise) {
            backgroundNoise.start();
            console.log('🌫️ 白噪音恢复播放');
        }
        
    if (mediaRecorder && recordingStream) {
        mediaRecorder.stop();
        recordingStream.getTracks().forEach(t => t.stop());
    }
}

// Tone.js 变声处理 ➜ 转为 Base64 存储    xxx
async function processAudioWithTone(audioBlob, text = "") {
    await Tone.start();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const originalBuffer = await Tone.context.decodeAudioData(arrayBuffer);

    const pitch = parseFloat(document.getElementById("pitchSlider").value);
    const reverbT = parseFloat(document.getElementById("reverbSlider").value);
    const bit = parseInt(document.getElementById("bitSlider").value);
    const delayT = parseFloat(document.getElementById("delaySlider").value);

    const offlineDuration = originalBuffer.duration + 1;

    const rendered = await Tone.Offline(({ transport }) => {
        const player = new Tone.Player(originalBuffer).toDestination();

        // 在离线上下文中创建新的音效节点
        const pitchShift = new Tone.PitchShift({ pitch }).toDestination();
        const bitCrusher = new Tone.BitCrusher(bit).toDestination();
        const feedbackDelay = new Tone.FeedbackDelay(delayT).toDestination();
        const reverb = new Tone.Reverb({ decay: reverbT }).toDestination();

        // 链接音频处理链条（使用新上下文的节点）
        player.connect(pitchShift);
        pitchShift.connect(bitCrusher);
        bitCrusher.connect(feedbackDelay);
        feedbackDelay.connect(reverb);
        const gainNode = new Tone.Gain(1).toDestination();
        reverb.connect(gainNode);
    
        player.start(0);
        transport.start();
    }, offlineDuration);

    const processedBlob = await bufferToBlob(rendered);
    const base64 = await blobToBase64(processedBlob);

    // 存入数据库
    await saveBubbleToSupabase(text || "", base64);

    // ✅ 立即在页面添加泡泡
    // ❌ 不需要再次 createAndAppendBubble，这一步 Supabase 会处理
    // createAndAppendBubble(text || "🎵 变声录音", base64);

}


// 创建泡泡的地方
function createAndAppendBubble(text, audioBase64) {
    const bubble = createBubble(null, text, audioBase64);
    document.getElementById("bubbleContainer").appendChild(bubble);


    animateBubble(bubble); // ✅ 让泡泡动起来
}


// 加载泡泡
export async function loadBubbles() {
    const container = document.getElementById("bubbleContainer");

    container.innerHTML = ""; // 清空旧的泡泡
    // 然后再加载新的泡泡
    const { data, error } = await supabase
        .from("dreams")
        .select("*")
        .order("created_at", { ascending: false })

    if (error) {
        console.error("❌ 读取失败:", error.message);
        return;
    }

    console.log("📦 Supabase 返回数据:", data);

    data.forEach(entry => {
        console.log("🧼 正在创建泡泡:", entry.id, entry.text, entry.audio_url);

        if (!entry.audio_url && entry.text) {
            console.warn("⚠️ 只发现了文字泡泡（无音频）");
        }

        const bubble = createBubble(entry.id, entry.text, entry.audio_url);
        container.appendChild(bubble);

  // ⏳ 延后再启动动画，确保泡泡成功渲染后再动
  setTimeout(() => {
    requestAnimationFrame(() => {
      animateBubble(bubble);
    });
  }, 20);

    });
}

export function createBubble(id, text, audioBase64 = null) {
    const bubble = document.createElement("div");
    bubble.classList.add("bubble");

    bubble.style.position = "absolute";
    bubble.style.zIndex = "1000";
    bubble.style.background = "rgba(255,255,255,0.85)";
    bubble.style.border = "1px solid black";
    bubble.style.borderRadius = "8px";
    bubble.style.padding = "8px";
    bubble.style.fontFamily = "'PencilPete', sans-serif";
    bubble.style.fontWeight = "bold"; 


    if (!audioBase64) {
        const textElem = document.createElement("div");
        textElem.textContent = text;
        bubble.appendChild(textElem);
    } else {
        const playButton = document.createElement("button");
        playButton.innerHTML = `<span class="emoji-gray">(*・3・)ノ⌒☆</span> PLAY`;
        playButton.classList.add("play-btn");
        playButton.onclick = async () => {
            await Tone.start();

            const response = await fetch(audioBase64);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = await Tone.context.decodeAudioData(arrayBuffer);

            const pitch = parseFloat(document.getElementById("pitchSlider").value);
            const reverbT = parseFloat(document.getElementById("reverbSlider").value);
            const bit = parseInt(document.getElementById("bitSlider").value);
            const delayT = parseFloat(document.getElementById("delaySlider").value);

            const player = new Tone.Player(buffer).toDestination();
            const pitchShift = new Tone.PitchShift({ pitch }).toDestination();
            const bitCrusher = new Tone.BitCrusher(bit).toDestination();
            const feedbackDelay = new Tone.FeedbackDelay(delayT).toDestination();
            const reverb = new Tone.Reverb({ decay: reverbT }).toDestination();

            player.connect(pitchShift);
            pitchShift.connect(bitCrusher);
            bitCrusher.connect(feedbackDelay);
            feedbackDelay.connect(reverb);
            reverb.toDestination();

            player.start();
        };

        bubble.appendChild(playButton);
    }


    const del = document.createElement("button");
    del.textContent = "✕";
    del.style.marginLeft = "5px";
    del.classList.add("delete-btn"); // ✅ 添加 class
    del.onclick = () => deleteBubble(id, bubble);
    bubble.appendChild(del);

    bubble.style.left = `${Math.random() * (window.innerWidth - 140)}px`;
    bubble.style.top = `${Math.random() * (window.innerHeight - 80)}px`;

    console.log("🧪 audioBase64 preview:", audioBase64?.substring?.(0, 30));

    return bubble;
}


// Updated function to delete a bubble from both the page and Supabase
async function deleteBubble(id, bubbleElement) {
    if (!id) {
        console.error("❌ Invalid ID, cannot delete bubble!");
        return; // Exit the function if ID is invalid
    }

    try {
        console.log("🗑 Deleting doc ID:", id);

        // Delete the bubble from Supabase
        const { error } = await supabase
            .from('dreams') // Your Supabase table name
            .delete()
            .eq('id', id); // Use the correct field to match the record ID

        if (error) {
            console.error("❌ Failed to delete from Supabase:", error.message);
            return; // If the deletion fails, do not remove the bubble from the page
        }

        // If deletion from Supabase was successful, remove the bubble from the page
        bubbleElement.remove();
        console.log("✅ Successfully deleted bubble from Supabase and removed from page.");
    } catch (error) {
        console.error("❌ Failed to delete bubble:", error);
    }
}


// 小工具：blob 转 base64 xxx
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.result) resolve(reader.result);
            else reject("⚠️ FileReader 读取失败");
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// 小工具：音频缓冲区转 blob（WAV）
async function bufferToBlob(audioBuffer) {
    const numOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length * numOfChannels * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];

    const writeStr = (v, offset, str) => {
        for (let i = 0; i < str.length; i++) v.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(view, 0, "RIFF");
    view.setUint32(4, length - 8, true);
    writeStr(view, 8, "WAVE");
    writeStr(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numOfChannels, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * 2 * numOfChannels, true);
    view.setUint16(32, numOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeStr(view, 36, "data");
    view.setUint32(40, length - 44, true);

    for (let i = 0; i < numOfChannels; i++) {
        channels.push(audioBuffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
        for (let j = 0; j < numOfChannels; j++) {
            let sample = Math.max(-1, Math.min(1, channels[j][i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }

    return new Blob([view], { type: "audio/wav" });
}

// ✅ 让泡泡动起来
function animateBubble(bubble) {
    let dx = (Math.random() * 2 - 1) * 1.2; // 水平速度
    let dy = (Math.random() * 2 - 1) * 1.2; // 垂直速度

    function move() {
        const rect = bubble.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;

        
        let x = bubble.offsetLeft + dx;
        let y = bubble.offsetTop + dy;

        // 📦 边界反弹（仅网页四边）
        if (x < 0 || x > maxX) dx = -dx;
        if (y < 0 || y > maxY) dy = -dy;

        // 🫧 更新位置
        bubble.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
        bubble.style.top = `${Math.max(0, Math.min(y, maxY))}px`;

        requestAnimationFrame(move);
    }

    requestAnimationFrame(move);
}

// Add event listener for the "Merge Dreams" button
document.getElementById("mergeDreamsBtn").addEventListener("click", async () => {
    await processAndStoreDreams(); // fetch + process + store
    window.location.href = "mergeddreams.html";
});


async function processAndStoreDreams() {
    let allTextFragments = [];
    let allAudioFragments = [];

    // Fetch bubble data directly from Supabase (same as loadBubbles)
    const { data, error } = await supabase
        .from("dreams")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("❌ Supabase fetch failed:", error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.warn("⚠️ No bubble data found.");
        return;
    }

    // Process each entry from Supabase
    data.forEach(entry => {
        if (entry.text) {
            const words = entry.text.trim().split(/\s+/);
            allTextFragments.push(...words); // Push all words individually
        }

        if (entry.audio_url) {
            allAudioFragments.push(entry.audio_url); // Add audio URL
        }
    });

    console.log("✨ Collected words:", allTextFragments.length);
    console.log("🎧 Collected audio:", allAudioFragments.length);

    // Scramble all words
    const scrambledWords = scrambleArray(allTextFragments);

    // Create grouped sentences
    const groupedSentences = [];
    const groupSize = 7;
    for (let i = 0; i < scrambledWords.length; i += groupSize) {
        groupedSentences.push(scrambledWords.slice(i, i + groupSize).join(" "));
    }

    // Reconstruct long audio
    const longAudio = await reconstructLongAudio(allAudioFragments);

    // Save to localStorage
    localStorage.setItem("processedTextFragments", JSON.stringify(groupedSentences));
    localStorage.setItem("processedAudioFragments", JSON.stringify(longAudio));
}

function scrambleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]]; // Swap elements
    }
    return arr;
}

async function reconstructLongAudio(audioFragments) {
    if (!audioFragments || audioFragments.length === 0) return null;

    let allAudioBuffers = [];

    // Fetch and decode each audio fragment
    for (let audioUrl of audioFragments) {
        const response = await fetch(audioUrl);
        const audioBlob = await response.blob();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const buffer = await Tone.context.decodeAudioData(arrayBuffer);
        allAudioBuffers.push(buffer);
    }

    const sampleRate = Tone.context.sampleRate;
    const totalDuration = 60; // seconds
    const longBuffer = Tone.context.createBuffer(1, sampleRate * totalDuration, sampleRate);
    const output = longBuffer.getChannelData(0);

    let currentSample = 0;
    while (currentSample < output.length) {
        const randomBuffer = allAudioBuffers[Math.floor(Math.random() * allAudioBuffers.length)];
        const input = randomBuffer.getChannelData(0);

        for (let i = 0; i < input.length && currentSample < output.length; i++) {
            output[currentSample++] = input[i];
        }
    }

    // Convert to Blob and URL
    const audioBlob = await bufferToWavBlob(longBuffer);
    return URL.createObjectURL(audioBlob);
}

function bufferToWavBlob(buffer) {
    const wav = encodeWAV(buffer);
    return new Blob([wav], { type: 'audio/wav' });
}

// Minimal audioBufferToWav implementation (1 channel only for simplicity)
function encodeWAV(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const view = new DataView(new ArrayBuffer(length));
    const sampleRate = buffer.sampleRate;

    function writeString(view, offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    let offset = 0;
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, length - 8, true); offset += 4;
    writeString(view, offset, 'WAVE'); offset += 4;
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, numOfChan, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * numOfChan * 2, true); offset += 4;
    view.setUint16(offset, numOfChan * 2, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, length - offset - 4, true); offset += 4;

    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numOfChan; channel++) {
            const sample = buffer.getChannelData(channel)[i];
            const s = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }
    }

    return view;
}



