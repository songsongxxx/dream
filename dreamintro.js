let currentScene = 0;
let mixer;
let buttonUnlocked = false; // 模型按钮是否可点
let redirectReady = false; // ✅ 是否准备跳转 dream.html
// 🎵 白噪音
let noise, bitCrusher, reverb, filter, volume, lfo;

let voicesReady = false;


// 用来存储当前场景的声音
let sceneSoundSynth = null;
let sceneSoundEffect = null;

// 页面一开始就监听voices是否加载完成
window.speechSynthesis.onvoiceschanged = () => {
  voicesReady = true;
  console.log("✅ 声音库加载完毕，可以用可爱声音了！");
};



async function startBackgroundNoise() {
  if (noise) return; // 避免重复启动
  await Tone.start(); // 开启音频上下文

  // 创建白噪音
  noise = new Tone.Noise('white').start();

  // BitCrusher
  bitCrusher = new Tone.BitCrusher(4);

  // Reverb
  reverb = new Tone.Reverb({
    decay: 5,
    preDelay: 0.01
  }).toDestination();

  // Filter
  filter = new Tone.Filter(800, "lowpass");

  // Volume
  volume = new Tone.Volume(-20);

  // LFO
  lfo = new Tone.LFO({
    frequency: 0.08,
    min: -25,
    max: -10
  }).start();

  // 链接
  noise.chain(volume, bitCrusher, filter, reverb);

  // LFO控制音量
  lfo.connect(volume.volume);

  console.log("🌫️ Whisper背景声启动");
}




async function initToneEffects() {
  await Tone.start();
  bitCrusher = new Tone.BitCrusher(4).toDestination();
  reverb = new Tone.Reverb({ decay: 5, preDelay: 0.01 }).toDestination();
  filter = new Tone.Filter(800, "lowpass").toDestination();
  volume = new Tone.Volume(-20).toDestination();
  lfo = new Tone.LFO({ frequency: 0.08, min: -25, max: -10 }).start();
  lfo.connect(volume.volume);
}


function playSceneSound(sceneIndex) {
  // 先把上一个场景的声音停掉
  if (sceneSoundSynth) {
    sceneSoundSynth.stop();
    sceneSoundSynth.disconnect();
  }
  if (sceneSoundEffect) {
    sceneSoundEffect.dispose();
  }

  // 根据不同场景创建新的声音
  if (sceneIndex === 1) {
    // 🌊 第一场景：水声、低频波浪
    sceneSoundSynth = new Tone.Oscillator("G2", "triangle").start();
    sceneSoundEffect = new Tone.Tremolo(2, 0.5).start().toDestination();
    sceneSoundSynth.connect(sceneSoundEffect);

  } else if (sceneIndex === 2) {
    // ✨ 第二场景：高一点的梦幻泡泡声
    // 主背景声音：水声/风声
    sceneSoundSynth = new Tone.Oscillator("G2", "triangle").start();
    sceneSoundEffect = new Tone.Tremolo(2, 0.5).start().toDestination();
    sceneSoundSynth.connect(sceneSoundEffect);

    // 加一个独立的小鸟叫声系统
    const birdSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 }
    }).toDestination();

    // 定时播放鸟叫声
    const birdPattern = new Tone.Pattern((time, note) => {
      birdSynth.triggerAttackRelease(note, 0.2, time);
    }, ["C6", "E6", "G6"], "random");

    // 开始每隔一段时间叫一次
    birdPattern.interval = "2n"; // 每半拍叫一次
    birdPattern.start(0);

    // 启动鸟声
    Tone.Transport.start();

  } else if (sceneIndex === 3) {
    sceneSoundSynth = new Tone.Oscillator({
      frequency: "A5",    // 高一点，更细腻（5是第5个八度）
      type: "sine"         // 圆滑干净的波形，不刺耳
    }).start();
    
    // 音量拉到很低很低
    const softVolume = new Tone.Volume(-25).toDestination();
    
    // 加一点点轻微漂浮感
    sceneSoundEffect = new Tone.Vibrato(3, 0.05).start();
    
    // 链接：Oscillator -> Vibrato -> Volume -> Destination
    sceneSoundSynth.connect(sceneSoundEffect);
    sceneSoundEffect.connect(softVolume);
    
    

  } else if (sceneIndex === 4) {
    // 其他场景可以加更多...
    sceneSoundSynth = new Tone.Oscillator("G2", "triangle").start();
    sceneSoundEffect = new Tone.Tremolo(2, 0.5).toDestination();
    sceneSoundSynth.connect(sceneSoundEffect);
  }
}





const scenes = [
  {
    text: "",
    image: "/dreamimages/sigil.gif",  // GitHub URL for image
    delay: 0 // 秒（测试用）

  },
  {
    text: "By day the village is translucent, shifting gently in the light. Reality appears only at night. Days feel thin, like diluted memories, humming softly at the edges. When darkness falls, dreams settle into homes, streets, and skin.",
    image: "/dreamimages/george.gif",  // GitHub URL for image
    delay: 5 // 秒
  },
  {
    text: "You are new here and sleepless. You don’t remember why you came. The line between dream and daylight blurs, and slowly, the dreams of others seep into your skin.",
    image: "/dreamimages/HOUSEGIF.gif",  // GitHub URL for image
    delay: 5 // 秒
  },
  {
    text: "'Somna Spores,' neural spores shed quietly from villagers’ bodies, float briefly through the air, seeking hosts whose minds match their rhythm. Inside you, Somna Spores weave patiently, layering through your flesh, stretching quietly across time.",
    image: "/dreamimages/somna_spores.png",  // GitHub URL for image
    delay: 5 // 秒
  },
  {
    text: "You feel them coax your skin inward, your cells swelling gently, opening channels. A mouse sleeps on floating moss. A baby drifts through a weightless river, skin dissolving softly into the water.",
    image: "/dreamimages/somna_spore_2.gif",  // GitHub URL for image
    delay: 5 // 秒
  },
  {
    text: "Skin might be the ultimate vessel of empathy—you don’t know. But you've become a container for dreams. Sensations gather within you until your boundaries blur, and you no longer know which feelings are yours, and which belong to others.",
    image: "/dreamimages/SORR.png",  // GitHub URL for image
    delay: 5 // 秒
  }


];


// button Scene setup
const container = document.getElementById('glb-button-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.z = 2;

const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setClearColor(0x000000, 0); // 第二个参数是透明度（0 = 完全透明）
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

// Light
// 修改这里
const ambientLight = new THREE.AmbientLight(0xffffff, 203.5);
scene.add(ambientLight);

// 可选：加一个轻微的补光
const hintLight = new THREE.PointLight(0xffffff, 2, 10); 
hintLight.position.set(0, 0.3, 1); // 离模型近一点
scene.add(hintLight);

// Load .glb button    /dreamimages/furbyanimation.glb
const loader = new THREE.GLTFLoader();
let buttonMesh;

// dreamimages/icon1.glb
loader.load('dreamimages/bubbles.glb', (gltf) => {
  buttonMesh = gltf.scene;
  // ✅ 缩放到合适大小
  buttonMesh.scale.set(0.002, 0.002, 0.002);

  // ✅ 位置居中 y x z
  buttonMesh.position.set(0, 0, 0);

  // ✅ 如果模型自身有偏移，可试试居中几何体（可选）
  buttonMesh.traverse(function (child) {
    if (child.isMesh) {
      child.geometry.center();  // 居中子网格几何体
    }
  });

  scene.add(buttonMesh);// ✅ 初始化动画播放器
  if (gltf.animations && gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(buttonMesh);

    gltf.animations.forEach((clip) => {
      mixer.clipAction(clip).play();
    });

    console.log("🎥 播放动画", gltf.animations);
  } else {
    console.warn("🚫 模型中没有动画");
  }
});

// Hover / click
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onClick(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(scene.children, true);
  if (intersects.length > 0 && buttonUnlocked) {
    nextScene();
    buttonUnlocked = false; // 点击后锁住
  }
  hintLight.intensity = 0;
}

renderer.domElement.addEventListener('click', onClick);

// Animate
function animate() {
  requestAnimationFrame(animate);

  // 加上这一句，驱动动画播放
  if (mixer) mixer.update(0.016); // 或用 deltaTime 更平滑

  if (buttonMesh) {
    buttonMesh.rotation.y += 0.01;
  }
  renderer.render(scene, camera);
}
animate();



function nextScene() {
  if (currentScene < scenes.length - 1) {
    currentScene++;
    updateStory();
  } else {
    // ✅ 最后一幕：跳转
    const button = document.getElementById("next-button");
    button.textContent = "The dream fades away";
    button.disabled = true;
    button.classList.remove("active");

    // ✅ 加一个淡出效果
    document.body.style.transition = "opacity 1s ease";
    document.body.style.opacity = 0;

    setTimeout(() => {
      window.location.href = "dream.html";
    }, 1000);
  }
}


function updateStory() {
  const scene = scenes[currentScene];

  // Fade out the current image and text
  const imageElement = document.getElementById("scene-image");
  const textElement = document.getElementById("story-text");
  const button = document.getElementById("next-button");

  const imageUrl = scene.image.toLowerCase(); // 统一为小写方便判断

  if (imageUrl.endsWith(".mp4")) {
    const video = document.createElement("video");
    video.src = scene.image;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.style.width = "100%";
    video.style.height = "auto";
    video.style.objectFit = "cover";

    imageElement.replaceWith(video);
    video.id = "scene-image";
  } else if (
    imageUrl.endsWith(".png") ||
    imageUrl.endsWith(".jpg") ||
    imageUrl.endsWith(".jpeg") ||
    imageUrl.endsWith(".gif")
  ) {
    // 如果已经是 <img>，直接改 src，否则重新创建一个 img
    if (imageElement.tagName.toLowerCase() === "img") {
      imageElement.src = scene.image;
    } else {
      const img = document.createElement("img");
      img.src = scene.image;
      img.alt = "Scene Image";
      img.style.width = "100%";
      img.style.height = "auto";
      img.style.objectFit = "cover";

      imageElement.replaceWith(img);
      img.id = "scene-image";
    }

    // 新增！播放每个场景对应的小声音
    playSceneSound(currentScene);

  }


  // Fade out
  imageElement.style.opacity = 0;
  textElement.style.opacity = 0;

  button.disabled = true;
  button.classList.remove("active");
  button.textContent = `Waiting ${scene.delay} seconds...`;

  // Wait for fade-out to finish before changing content
  setTimeout(() => {
    const newImageElement = document.getElementById("scene-image");
    const newTextElement = document.getElementById("story-text");
  
    if (newImageElement && newImageElement.tagName.toLowerCase() === "img") {
      newImageElement.src = scene.image;
    }
  
    if (newTextElement) {
      newTextElement.textContent = scene.text;
    }
  
    // ✅ Fade in the newly loaded elements, not the old ones
    if (newImageElement) {
      newImageElement.style.opacity = 1;
    }
    if (newTextElement) {
      newTextElement.style.opacity = 1;
    }
  }, 1000);

  
  // 启动倒计时，激活按钮
  let remaining = scene.delay;
  const countdown = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(countdown);
      buttonUnlocked = true; // ✅ 模型现在可点击了！
      hintLight.intensity = 4;
      hintLight.color.set(0xffffff);
      // 试试亮一点的粉紫色

      button.classList.add("active");
      button.textContent = "wwWwwait seconds➤";

    } else {
      button.textContent = `Waiting ${remaining} seconds...`;
    }
  }, 1000);


}


document.getElementById("next-button").addEventListener("click", () => {
  if (document.getElementById("next-button").disabled || !buttonUnlocked) return;

  if (currentScene < scenes.length - 1) {
    currentScene++;
    updateStory();
  } else {
    document.getElementById("next-button").textContent = "The dream fades away";
    document.getElementById("next-button").disabled = true;
    document.getElementById("next-button").classList.remove("active");

    // ✅ 加一个柔和的淡出 + 页面跳转
    setTimeout(() => {
      document.body.style.transition = "opacity 1s ease";
      document.body.style.opacity = 0;

      setTimeout(() => {
        window.location.href = "dream.html";
      }, 1000); // 1秒后跳转
    }, 1000); // 再延迟1秒

  }
});

function onClick(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(scene.children, true);
  if (intersects.length > 0 && buttonUnlocked) {
    nextScene(); // ✅ 只有在模型被允许点击时才继续
    buttonUnlocked = false; // ✅ 马上锁回去，避免连点
  }
  hintLight.intensity = 0;


}

// Initialize the story
window.onload = () => {
  updateStory();
};

document.getElementById("loader").style.opacity = 0;
setTimeout(() => {
  document.getElementById("loader").style.display = "none";
}, 500);



// 页面加载完就准备播放（尽量不等用户点击）
window.addEventListener('load', async () => {
  try {
    await startBackgroundNoise();
  } catch (e) {
    console.warn('⚠️ 自动播放被浏览器拦截，需要用户手动触发！');
    // 等用户第一次交互后再触发
    document.addEventListener('click', async () => {
      await startBackgroundNoise();
    }, { once: true });
  }
});