import { BASE_SPEED, CHUNK_LENGTH, diamondDistanceForChunk, hasDiamondForChunk, speedForDistance } from "./neon-rush-economy.js";

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";
const LANES = [-3, 0, 3];
const COURSE_SEED = 0x4e525633;
const PLAYER_DISTANCE = 8;
const MAX_SPEED = 40;
const LOOK_AHEAD = 190;
const SAFE_LANE_SEQUENCE = [1, 0, 1, 2, 1, 1, 0, 1, 2, 1];

const hash = value => {
  let result = (value ^ COURSE_SEED) >>> 0;
  result = Math.imul(result ^ (result >>> 16), 0x21f0aaad);
  result = Math.imul(result ^ (result >>> 15), 0x735a2d97);
  return (result ^ (result >>> 15)) >>> 0;
};

const randomFor = (chunk, salt = 0) => hash(chunk * 41 + salt * 131) / 4294967296;
export const generateNeonRushChunk = (chunk, runSeed = null) => {
  const start = 30 + chunk * CHUNK_LENGTH;
  const reachableSafeLane = SAFE_LANE_SEQUENCE[chunk % SAFE_LANE_SEQUENCE.length];
  const difficulty = Math.min(1, chunk / 35);
  const typeRoll = randomFor(chunk, 2);
  const entities = [];
  const blockedLanes = [0, 1, 2].filter(lane => lane !== reachableSafeLane);

  if (typeRoll < 0.2) {
    entities.push({ kind: "spike", lane: blockedLanes[0], distance: start + 8 });
    if (difficulty > 0.2) entities.push({ kind: "spike", lane: blockedLanes[1], distance: start + 8 });
  } else if (typeRoll < 0.38) {
    entities.push({ kind: "wall", lane: blockedLanes[0], distance: start + 8 });
    if (difficulty > 0.35) entities.push({ kind: "wall", lane: blockedLanes[1], distance: start + 8 });
  } else if (typeRoll < 0.55) {
    entities.push({ kind: "wall", lane: blockedLanes[0], distance: start + 6 });
    entities.push({ kind: "spike", lane: blockedLanes[1], distance: start + 11 });
  } else if (typeRoll < 0.7) {
    entities.push({ kind: "platform", lane: reachableSafeLane, distance: start + 9 });
    entities.push({ kind: "spike", lane: blockedLanes[0], distance: start + 9 });
    if (difficulty > 0.4) entities.push({ kind: "wall", lane: blockedLanes[1], distance: start + 9 });
  } else if (typeRoll < 0.85) {
    entities.push({ kind: "beam", lane: blockedLanes[0], distance: start + 9 });
    if (difficulty > 0.45) entities.push({ kind: "beam", lane: blockedLanes[1], distance: start + 9 });
  } else {
    entities.push({ kind: "spike", lane: reachableSafeLane, distance: start + 7 });
    entities.push({ kind: "wall", lane: blockedLanes[0], distance: start + 12 });
    if (difficulty > 0.55) entities.push({ kind: "spike", lane: blockedLanes[1], distance: start + 12 });
    if (chunk > 4) entities.push({ kind: "jump-orb", lane: reachableSafeLane, distance: start + 10 });
  }

  if (chunk > 7) {
    const itemRoll = randomFor(chunk, 3);
    if (itemRoll < 0.11) {
      const item = randomFor(chunk, 4) < 0.5 ? "dark" : "reverse";
      entities.push({ kind: "item", item, lane: blockedLanes[Math.floor(randomFor(chunk, 5) * blockedLanes.length)], distance: start + 16 });
    } else if (itemRoll < 0.145) {
      const usefulRoll = randomFor(chunk, 4);
      const item = usefulRoll < 1 / 3 ? "revive" : usefulRoll < 2 / 3 ? "slow" : "shield";
      entities.push({ kind: "item", item, lane: reachableSafeLane, distance: start + 16 });
    }
  }

  if (runSeed !== null && hasDiamondForChunk(chunk, runSeed)) entities.push({ kind: "diamond", chunk, lane: reachableSafeLane, distance: diamondDistanceForChunk(chunk) });
  return { chunk, safeLane: reachableSafeLane, entities };
};

export const generateNeonRushCourse = (count, runSeed = null) => Array.from({ length: count }, (_, chunk) => generateNeonRushChunk(chunk, runSeed));

const formatScore = score => `${Math.round(Number(score)).toLocaleString()} m`;

export const neonRush3d = {
  slug: "neon-rush-3d",
  accent: "cyan",
  formatScore,
  mount(container, context) {
    let disposed = false;
    let frameId = 0;
    let cleanupThree = () => {};
    let audioContext = null;
    let masterGain = null;
    let musicTimer = null;
    let musicStep = 0;
    let noiseBuffer = null;
    let muted = false;
    let game = null;

    container.innerHTML = `<div class="neon-rush-shell">
      <div class="neon-rush-loading"><span class="neon-loader"></span><strong>Loading Neon Rush 3D</strong><small>Preparing the endless track...</small></div>
    </div>`;
    const shell = container.querySelector(".neon-rush-shell");

    const sound = (frequency, duration = 0.1, type = "square", volume = 0.045, endFrequency = frequency) => {
      if (muted || !audioContext) return;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), audioContext.currentTime + duration);
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(Math.max(700, frequency * 4), audioContext.currentTime);
      oscillator.connect(filter).connect(gain).connect(masterGain);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    };

    const noiseHit = (duration = 0.06, volume = 0.02, frequency = 2500, filterType = "highpass") => {
      if (muted || !audioContext || !noiseBuffer) return;
      const source = audioContext.createBufferSource();
      const filter = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();
      source.buffer = noiseBuffer;
      filter.type = filterType;
      filter.frequency.value = frequency;
      filter.Q.value = 0.8;
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      source.connect(filter).connect(gain).connect(masterGain);
      source.start();
      source.stop(audioContext.currentTime + duration);
    };

    const ensureAudio = () => {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.64;
        masterGain.connect(audioContext.destination);
        noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let index = 0; index < noiseData.length; index++) noiseData[index] = Math.random() * 2 - 1;
      }
      if (audioContext.state === "suspended") audioContext.resume();
    };

    const stopMusic = () => {
      if (musicTimer) window.clearInterval(musicTimer);
      musicTimer = null;
    };

    const startMusic = () => {
      ensureAudio();
      if (musicTimer) return;
      const lead = [659, null, 784, 659, 988, null, 784, 659, 587, null, 659, 784, 880, 784, 659, null, 659, 784, 988, null, 1175, 988, 880, 784, 587, 659, 784, 659, 523, 587, 659, null];
      const bass = [82.4, 82.4, 98, 98, 73.4, 73.4, 110, 110];
      const chords = [[165, 196, 247], [196, 247, 294], [147, 185, 220], [220, 262, 330]];
      const kickSteps = new Set([0, 7, 8, 16, 22, 24]);
      musicTimer = window.setInterval(() => {
        if (muted || !game || !["running", "countdown"].includes(game.phase)) return;
        const step = musicStep % 32;
        const leadNote = lead[step];
        if (leadNote) {
          sound(leadNote, 0.085, "square", 0.013, leadNote * 0.985);
          if (step % 8 === 6) sound(leadNote / 2, 0.12, "triangle", 0.008, leadNote * 0.52);
        }
        if (step % 4 === 0) {
          const bassNote = bass[(step / 4) % bass.length];
          sound(bassNote, 0.26, "sawtooth", 0.025, bassNote * 0.72);
        }
        if (step % 8 === 0) chords[(step / 8) % chords.length].forEach((note, index) => sound(note, 0.24, "triangle", 0.007 - index * 0.001, note * 0.995));
        if (kickSteps.has(step)) {
          sound(145, 0.13, "sine", 0.052, 38);
          noiseHit(0.035, 0.01, 180, "lowpass");
        }
        if (step % 8 === 4) {
          noiseHit(0.13, 0.024, 1450, "bandpass");
          sound(190, 0.055, "triangle", 0.012, 105);
        }
        if (step % 2 === 1) noiseHit(0.028, step % 4 === 3 ? 0.009 : 0.005, 6500, "highpass");
        musicStep++;
      }, 100);
    };

    const showLoadError = () => {
      shell.innerHTML = `<div class="neon-rush-message"><span class="neon-message-icon">!</span><h3>3D could not start</h3><p>This game needs WebGL and an internet connection to load Three.js.</p><button class="primary-button" type="button" data-neon-action="reload">Try again</button></div>`;
    };

    const boot = async () => {
      try {
        const THREE = await import(THREE_URL);
        if (disposed) return;
        setupGame(THREE);
      } catch {
        if (!disposed) showLoadError();
      }
    };

    const setupGame = THREE => {
      shell.innerHTML = `<div class="neon-rush-game">
        <div class="neon-rush-canvas"></div>
        <div class="neon-hud">
          <div class="neon-hud-primary"><span>Distance<strong data-neon-distance>0 m</strong></span><span>Speed<strong data-neon-speed>1.0x</strong></span><span>Diamonds<strong data-neon-diamonds>0</strong></span></div>
          <div class="neon-items"><span data-neon-revive>Revive <b>0</b></span><span data-neon-shield>Shield <b>0</b></span><span data-neon-slow>Slow <b>--</b></span></div>
          <button class="neon-icon-button" type="button" data-neon-action="mute" aria-label="Mute sound">SOUND</button>
          <button class="neon-icon-button" type="button" data-neon-action="pause" aria-label="Pause game">PAUSE</button>
        </div>
        <div class="neon-effect-status" data-neon-effects></div>
        <div class="neon-overlay"></div>
        <div class="neon-darkness" data-neon-darkness></div>
        <div class="neon-touch-controls">
          <button type="button" data-neon-control="left" aria-label="Move left">LEFT</button>
          <button class="jump" type="button" data-neon-control="jump" aria-label="Jump">JUMP</button>
          <button type="button" data-neon-control="right" aria-label="Move right">RIGHT</button>
        </div>
      </div>`;

      const canvasHost = shell.querySelector(".neon-rush-canvas");
      const overlay = shell.querySelector(".neon-overlay");
      const distanceNode = shell.querySelector("[data-neon-distance]");
      const speedNode = shell.querySelector("[data-neon-speed]");
      const diamondsNode = shell.querySelector("[data-neon-diamonds]");
      const reviveNode = shell.querySelector("[data-neon-revive]");
      const shieldNode = shell.querySelector("[data-neon-shield]");
      const slowNode = shell.querySelector("[data-neon-slow]");
      const effectsNode = shell.querySelector("[data-neon-effects]");
      const darknessNode = shell.querySelector("[data-neon-darkness]");
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;
      canvasHost.append(renderer.domElement);

      const scene = new THREE.Scene();
      const skyCanvas = document.createElement("canvas");
      skyCanvas.width = 16;
      skyCanvas.height = 256;
      const skyContext = skyCanvas.getContext("2d");
      const skyGradient = skyContext.createLinearGradient(0, 0, 0, 256);
      skyGradient.addColorStop(0, "#03040b");
      skyGradient.addColorStop(0.48, "#10102b");
      skyGradient.addColorStop(0.74, "#26113b");
      skyGradient.addColorStop(1, "#070812");
      skyContext.fillStyle = skyGradient;
      skyContext.fillRect(0, 0, 16, 256);
      const skyTexture = new THREE.CanvasTexture(skyCanvas);
      skyTexture.colorSpace = THREE.SRGBColorSpace;
      scene.background = skyTexture;
      scene.fog = new THREE.FogExp2(0x0a0a1a, 0.014);
      const camera = new THREE.PerspectiveCamera(58, canvasHost.clientWidth / canvasHost.clientHeight, 0.1, 300);
      const cameraComposition = { x: 10, y: 8, z: 15, targetY: 1.15, targetZ: -8 };
      camera.position.set(cameraComposition.x, cameraComposition.y, cameraComposition.z);
      camera.lookAt(0, cameraComposition.targetY, cameraComposition.targetZ);
      scene.add(new THREE.HemisphereLight(0x8ba6ff, 0x160820, 2.2));
      const keyLight = new THREE.DirectionalLight(0xd9ff7b, 3.4);
      keyLight.position.set(4, 10, 8);
      keyLight.castShadow = true;
      scene.add(keyLight);
      const cyanLight = new THREE.PointLight(0x4de1ff, 18, 45, 2);
      cyanLight.position.set(-8, 5, -12);
      scene.add(cyanLight);
      const purpleLight = new THREE.PointLight(0x925dff, 20, 55, 2);
      purpleLight.position.set(10, 8, -35);
      scene.add(purpleLight);
      const generatedTextures = [];

      const materials = {
        ground: new THREE.MeshStandardMaterial({ color: 0x111522, roughness: 0.82, metalness: 0.25 }),
        lane: new THREE.MeshBasicMaterial({ color: 0x2e3756 }),
        player: new THREE.MeshStandardMaterial({ color: 0xc7ff48, emissive: 0x304000, roughness: 0.25, metalness: 0.55 }),
        playerDark: new THREE.MeshStandardMaterial({ color: 0x111522, emissive: 0x071018, roughness: 0.2, metalness: 0.8 }),
        spike: new THREE.MeshStandardMaterial({ color: 0xff4f78, emissive: 0x5a071a, roughness: 0.3 }),
        wall: new THREE.MeshStandardMaterial({ color: 0x925dff, emissive: 0x24105a, roughness: 0.28, metalness: 0.35 }),
        wallInset: new THREE.MeshStandardMaterial({ color: 0x171027, emissive: 0x180b34, roughness: 0.4, metalness: 0.72 }),
        beam: new THREE.MeshStandardMaterial({ color: 0xff6688, emissive: 0x9a1638, roughness: 0.2, metalness: 0.35 }),
        platform: new THREE.MeshStandardMaterial({ color: 0x26314d, emissive: 0x08152d, roughness: 0.35, metalness: 0.65 }),
        platformTop: new THREE.MeshBasicMaterial({ color: 0x4de1ff }),
        jumpOrb: new THREE.MeshStandardMaterial({ color: 0xffeb5a, emissive: 0x8c6500, roughness: 0.18 }),
        revive: new THREE.MeshStandardMaterial({ color: 0xffd24d, emissive: 0x755100, roughness: 0.2 }),
        slow: new THREE.MeshStandardMaterial({ color: 0x4de1ff, emissive: 0x07566a, roughness: 0.2 }),
        shield: new THREE.MeshStandardMaterial({ color: 0x79ffaf, emissive: 0x075a2a, roughness: 0.2 }),
        dark: new THREE.MeshStandardMaterial({ color: 0x241833, emissive: 0x12081f, roughness: 0.25, metalness: 0.65 }),
        reverse: new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x7f2700, roughness: 0.25 }),
        diamond: new THREE.MeshStandardMaterial({ color: 0x84f4ff, emissive: 0x126d95, roughness: 0.14, metalness: 0.72 })
      };

      const groundSegments = Array.from({ length: 10 }, (_, index) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(11, 0.35, 24), materials.ground);
        mesh.position.set(0, -0.22, PLAYER_DISTANCE - index * 24);
        mesh.receiveShadow = true;
        scene.add(mesh);
        [-1.5, 1.5].forEach(x => {
          const line = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 24), materials.lane);
          line.position.set(x, 0.19, 0);
          mesh.add(line);
        });
        [-5.35, 5.35].forEach((x, railIndex) => {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 24), new THREE.MeshBasicMaterial({ color: railIndex ? 0x925dff : 0x4de1ff }));
          rail.position.set(x, 0.23, 0);
          mesh.add(rail);
        });
        for (let panel = -10; panel <= 10; panel += 4) {
          const seam = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.025, 0.045), new THREE.MeshBasicMaterial({ color: 0x35405d, transparent: true, opacity: 0.8 }));
          seam.position.set(0, 0.19, panel);
          mesh.add(seam);
        }
        return mesh;
      });

      const createStarfield = (count, spread, minHeight, depth, size, color, opacity, salt) => {
        const positions = [];
        for (let index = 0; index < count; index++) positions.push((randomFor(index, salt) - 0.5) * spread, minHeight + randomFor(index, salt + 1) * 62, -18 - randomFor(index, salt + 2) * depth);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        const field = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false }));
        scene.add(field);
        return field;
      };
      const stars = createStarfield(720, 190, 3, 220, 0.16, 0xcfe5ff, 0.82, 30);
      const nearStars = createStarfield(170, 100, 2, 150, 0.34, 0x8eeeff, 0.64, 84);

      const createNebulaTexture = (inner, middle, outer) => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const nebulaContext = canvas.getContext("2d");
        const gradient = nebulaContext.createRadialGradient(128, 128, 3, 128, 128, 126);
        gradient.addColorStop(0, inner);
        gradient.addColorStop(0.28, middle);
        gradient.addColorStop(1, outer);
        nebulaContext.fillStyle = gradient;
        nebulaContext.fillRect(0, 0, 256, 256);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        generatedTextures.push(texture);
        return texture;
      };
      const nebulae = [
        { position: [-42, 25, -118], scale: [62, 38], colors: ["rgba(255,80,210,.72)", "rgba(126,45,255,.27)", "rgba(0,0,0,0)"] },
        { position: [44, 32, -148], scale: [70, 45], colors: ["rgba(45,225,255,.58)", "rgba(32,80,255,.24)", "rgba(0,0,0,0)"] },
        { position: [4, 46, -205], scale: [92, 34], colors: ["rgba(199,255,72,.2)", "rgba(126,45,255,.16)", "rgba(0,0,0,0)"] }
      ].map(config => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: createNebulaTexture(...config.colors), transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false }));
        sprite.position.set(...config.position);
        sprite.scale.set(config.scale[0], config.scale[1], 1);
        scene.add(sprite);
        return sprite;
      });

      const horizonSun = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshBasicMaterial({ color: 0xff4fcb, transparent: true, opacity: 0.42, depthWrite: false }));
      horizonSun.position.set(-20, 19, -156);
      scene.add(horizonSun);
      for (let stripe = 0; stripe < 8; stripe++) {
        const width = 28 - stripe * 1.7;
        const sunStripe = new THREE.Mesh(new THREE.BoxGeometry(width, 0.23 + stripe * 0.025, 0.05), new THREE.MeshBasicMaterial({ color: stripe % 2 ? 0x100d28 : 0xff9be5, transparent: true, opacity: stripe % 2 ? 0.76 : 0.55 }));
        sunStripe.position.set(-20, 13.2 + stripe * 1.45, -155.8);
        scene.add(sunStripe);
      }
      for (let ringIndex = 0; ringIndex < 7; ringIndex++) {
        const horizonRing = new THREE.Mesh(new THREE.TorusGeometry(19 + ringIndex * 4.3, 0.075, 8, 80), new THREE.MeshBasicMaterial({ color: ringIndex % 2 ? 0x4de1ff : 0x925dff, transparent: true, opacity: 0.13, depthWrite: false }));
        horizonRing.position.set(-20, 19, -158 - ringIndex);
        scene.add(horizonRing);
      }

      const spaceArches = Array.from({ length: 13 }, (_, index) => {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(9.3 + (index % 3) * 0.45, 0.075, 6, 64, Math.PI), new THREE.MeshBasicMaterial({ color: index % 2 ? 0x4de1ff : 0xff4fcb, transparent: true, opacity: 0.27, depthWrite: false }));
        arch.position.set(0, 0.15, -20 - index * 19);
        arch.rotation.z = index % 2 ? 0.025 : -0.025;
        scene.add(arch);
        return arch;
      });

      const streakGeometry = new THREE.BoxGeometry(0.035, 0.035, 4.8);
      const speedStreaks = Array.from({ length: 46 }, (_, index) => {
        const streak = new THREE.Mesh(streakGeometry, new THREE.MeshBasicMaterial({ color: index % 3 === 0 ? 0xff58c7 : 0x61e9ff, transparent: true, opacity: 0.18 + randomFor(index, 95) * 0.32, depthWrite: false }));
        const side = index % 2 ? 1 : -1;
        streak.position.set(side * (7 + randomFor(index, 96) * 30), 2 + randomFor(index, 97) * 23, -10 - randomFor(index, 98) * 190);
        scene.add(streak);
        return streak;
      });

      const scenery = [];
      for (let index = 0; index < 28; index++) {
        const side = index % 2 ? 1 : -1;
        const object = new THREE.Group();
        const color = index % 3 === 0 ? 0x4de1ff : index % 3 === 1 ? 0x925dff : 0xff4f9a;
        if (index % 3 === 0) {
          const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.2 + randomFor(index, 40) * 1.8, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.38, roughness: 0.18, metalness: 0.65 }));
          crystal.scale.y = 1.8;
          const orbit = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.055, 8, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }));
          orbit.rotation.x = 1.1;
          object.add(crystal, orbit);
        } else if (index % 3 === 1) {
          const planet = new THREE.Mesh(new THREE.SphereGeometry(1.1 + randomFor(index, 41) * 1.3, 20, 14), new THREE.MeshStandardMaterial({ color: 0x17132d, emissive: color, emissiveIntensity: 0.22, roughness: 0.5, metalness: 0.2 }));
          const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.8 + randomFor(index, 42), 0.09, 8, 42), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.58 }));
          orbit.rotation.x = 1.25;
          orbit.rotation.z = 0.35;
          object.add(planet, orbit);
        } else {
          for (let shardIndex = 0; shardIndex < 4; shardIndex++) {
            const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.55 + randomFor(index, 44 + shardIndex) * 0.9, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.22, metalness: 0.7 }));
            shard.position.set((randomFor(index, 50 + shardIndex) - 0.5) * 4, (randomFor(index, 60 + shardIndex) - 0.5) * 3, (randomFor(index, 70 + shardIndex) - 0.5) * 3);
            object.add(shard);
          }
        }
        object.position.set(side * (10 + randomFor(index, 43) * 16), 4 + randomFor(index, 47) * 14, -index * 12 - 22);
        object.userData.phase = randomFor(index, 48) * Math.PI * 2;
        object.userData.spin = (randomFor(index, 49) - 0.5) * 0.3;
        scene.add(object);
        scenery.push(object);
      }

      const startGate = new THREE.Group();
      const gateMaterial = new THREE.MeshStandardMaterial({ color: 0x4de1ff, emissive: 0x0b5b70, roughness: 0.25, metalness: 0.65 });
      [-5.1, 5.1].forEach(x => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.8, 0.35), gateMaterial);
        post.position.set(x, 2.7, 0);
        startGate.add(post);
      });
      const gateTop = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.38, 0.38), gateMaterial);
      gateTop.position.set(0, 5.4, 0);
      startGate.add(gateTop);
      const startLine = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.04, 0.7), new THREE.MeshBasicMaterial({ color: 0xc7ff48 }));
      startLine.position.set(0, 0.02, 0);
      startGate.add(startLine);
      scene.add(startGate);

      const player = new THREE.Group();
      const cubeVisual = new THREE.Group();
      const playerGeometry = new THREE.BoxGeometry(1.28, 1.28, 1.28);
      const playerBody = new THREE.Mesh(playerGeometry, materials.player);
      playerBody.castShadow = true;
      cubeVisual.add(playerBody);
      const playerEdges = new THREE.LineSegments(new THREE.EdgesGeometry(playerGeometry), new THREE.LineBasicMaterial({ color: 0xf3ffbd }));
      cubeVisual.add(playerEdges);
      const playerCore = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.68, 1.31), materials.playerDark);
      cubeVisual.add(playerCore);
      const playerLight = new THREE.PointLight(0xc7ff48, 5, 7, 2);
      playerLight.position.set(0, 0.15, 0.6);
      cubeVisual.add(playerLight);
      [-1, 1].forEach(x => [-1, 1].forEach(y => {
        const corner = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.34), new THREE.MeshBasicMaterial({ color: (x + y) % 4 ? 0x4de1ff : 0xff4fcb }));
        corner.position.set(x * 0.53, y * 0.53, 0);
        cubeVisual.add(corner);
      }));
      [-0.38, 0.38].forEach(x => {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), new THREE.MeshBasicMaterial({ color: 0x4de1ff }));
        eye.position.set(x, 0.2, -0.66);
        cubeVisual.add(eye);
      });
      const trail = Array.from({ length: 5 }, (_, index) => {
        const cube = new THREE.Mesh(new THREE.BoxGeometry(0.34 - index * 0.035, 0.34 - index * 0.035, 0.34 - index * 0.035), new THREE.MeshBasicMaterial({ color: index % 2 ? 0x4de1ff : 0xc7ff48, transparent: true, opacity: 0.32 - index * 0.045 }));
        cube.position.set(0, 0, 1.05 + index * 0.48);
        cubeVisual.add(cube);
        return cube;
      });
      const cubePalettes = {
        standard: { body: 0xc7ff48, emissive: 0x304000, edge: 0xf3ffbd, light: 0xc7ff48, trail: [0xc7ff48, 0x4de1ff] },
        purple: { body: 0x925dff, emissive: 0x2d126d, edge: 0xe1d4ff, light: 0xb88cff, trail: [0x925dff, 0xff4fcb] }
      };
      let cubePalette = cubePalettes.standard;
      const applyCubeColor = color => {
        cubePalette = cubePalettes[color] ?? cubePalettes.standard;
        playerBody.material.color.setHex(cubePalette.body);
        playerBody.material.emissive.setHex(cubePalette.emissive);
        playerEdges.material.color.setHex(cubePalette.edge);
        playerLight.color.setHex(cubePalette.light);
        trail.forEach((cube, index) => cube.material.color.setHex(cubePalette.trail[index % cubePalette.trail.length]));
      };
      applyCubeColor(context.economy?.equipped_cube_color);
      player.add(cubeVisual);
      player.position.set(0, 0.72, PLAYER_DISTANCE);
      scene.add(player);

      const entityGroup = new THREE.Group();
      scene.add(entityGroup);
      const state = {
        phase: "menu",
        distance: 0,
        lane: 1,
        targetLane: 1,
        playerY: 0.72,
        velocityY: 0,
        grounded: true,
        revive: false,
        shield: false,
        slowUntil: 0,
        darkUntil: 0,
        reverseUntil: 0,
        invulnerableUntil: 0,
        nextChunk: 0,
        entities: [],
        lastTime: performance.now(),
        countdownEnd: 0,
        countdownLabel: "Get ready",
        pausedFrom: null,
        submitting: false,
        starting: false,
        runId: null,
        runSeed: null,
        speedBoost: false,
        speedBoostQuantity: Number(context.economy?.speed_boost_quantity ?? 0),
        useSpeedBoost: false,
        runDiamonds: 0,
        cubeColor: context.economy?.equipped_cube_color ?? "standard",
        pendingClaims: new Set()
      };
      game = state;

      const createLabelSprite = (text, color) => {
        const canvas = document.createElement("canvas");
        canvas.width = 384;
        canvas.height = 96;
        const labelContext = canvas.getContext("2d");
        labelContext.fillStyle = "rgba(5, 7, 15, 0.82)";
        labelContext.roundRect(2, 2, 380, 92, 20);
        labelContext.fill();
        labelContext.strokeStyle = color;
        labelContext.lineWidth = 5;
        labelContext.stroke();
        labelContext.fillStyle = "#ffffff";
        labelContext.font = "700 34px Space Mono, monospace";
        labelContext.textAlign = "center";
        labelContext.textBaseline = "middle";
        labelContext.fillText(text, 192, 49);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        generatedTextures.push(texture);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
        sprite.scale.set(3.2, 0.8, 1);
        sprite.position.y = 1.65;
        return sprite;
      };

      const createItemMesh = item => {
        const mesh = new THREE.Group();
        if (item === "slow") {
          const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.72, 4, 8), materials.slow);
          body.rotation.z = Math.PI / 2;
          const shell = new THREE.Mesh(new THREE.SphereGeometry(0.48, 18, 14), materials.slow);
          shell.position.set(-0.1, 0.34, 0);
          const shellRing = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.055, 8, 22), new THREE.MeshBasicMaterial({ color: 0x071a25 }));
          shellRing.position.set(-0.1, 0.34, 0.43);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), materials.slow);
          head.position.x = 0.56;
          mesh.add(body, shell, shellRing, head, createLabelSprite("SLOWDOWN", "#4de1ff"));
        } else if (item === "revive") {
          const body = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1, 18), materials.revive);
          body.position.y = -0.15;
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), materials.revive);
          head.position.y = 0.48;
          const halo = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.055, 8, 24), new THREE.MeshBasicMaterial({ color: 0xfff4a8 }));
          halo.rotation.x = Math.PI / 2;
          halo.position.y = 0.83;
          [-1, 1].forEach(side => {
            const wing = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.95, 3), new THREE.MeshBasicMaterial({ color: 0xfff4c9, side: THREE.DoubleSide }));
            wing.position.set(side * 0.47, 0.05, 0);
            wing.rotation.z = side * -0.75;
            mesh.add(wing);
          });
          mesh.add(body, head, halo, createLabelSprite("REVIVE", "#ffd24d"));
        } else if (item === "shield") {
          const shape = new THREE.Shape();
          shape.moveTo(0, 0.8);
          shape.lineTo(0.7, 0.45);
          shape.lineTo(0.55, -0.45);
          shape.lineTo(0, -0.85);
          shape.lineTo(-0.55, -0.45);
          shape.lineTo(-0.7, 0.45);
          shape.closePath();
          const shield = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.06, bevelSegments: 2 }), materials.shield);
          shield.position.z = -0.11;
          mesh.add(shield, createLabelSprite("SHIELD", "#79ffaf"));
        } else if (item === "dark") {
          const core = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14), materials.dark);
          const eclipse = new THREE.Mesh(new THREE.TorusGeometry(0.83, 0.1, 8, 30), new THREE.MeshBasicMaterial({ color: 0xb053ff }));
          eclipse.rotation.x = Math.PI / 2;
          mesh.add(core, eclipse, createLabelSprite("BLACKOUT", "#b053ff"));
        } else {
          const leftArrow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 3), materials.reverse);
          leftArrow.rotation.z = Math.PI / 2;
          leftArrow.position.x = -0.42;
          const rightArrow = leftArrow.clone();
          rightArrow.rotation.z = -Math.PI / 2;
          rightArrow.position.x = 0.42;
          const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.16), materials.reverse);
          mesh.add(leftArrow, rightArrow, bar, createLabelSprite("REVERSE", "#ff8a3d"));
        }
        return mesh;
      };

      const createEntityMesh = entity => {
        let mesh;
        if (entity.kind === "spike") {
          mesh = new THREE.Group();
          const spikeBase = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.14, 1.2), materials.wallInset);
          spikeBase.position.y = 0.07;
          mesh.add(spikeBase);
          [-0.58, 0, 0.58].forEach((x, index) => {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.2 + index * 0.2, 4), materials.spike);
            spike.position.set(x, (1.2 + index * 0.2) / 2, 0);
            spike.rotation.y = Math.PI / 4;
            mesh.add(spike);
          });
        } else if (entity.kind === "wall") {
          mesh = new THREE.Group();
          const wallBody = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.5, 1.2), materials.wall);
          wallBody.position.y = 1.75;
          const wallInset = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.7, 1.24), materials.wallInset);
          wallInset.position.y = 1.75;
          const wallSlash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 1.27), new THREE.MeshBasicMaterial({ color: 0xe4c5ff }));
          wallSlash.position.y = 1.75;
          wallSlash.rotation.z = 0.48;
          mesh.add(wallBody, wallInset, wallSlash);
        } else if (entity.kind === "beam") {
          mesh = new THREE.Group();
          const beam = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.35, 0.65), materials.beam);
          beam.position.y = 0.78;
          const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 0.18), materials.wallInset);
          const rightPost = leftPost.clone();
          leftPost.position.set(-1.05, 0.75, 0);
          rightPost.position.set(1.05, 0.75, 0);
          mesh.add(beam, leftPost, rightPost);
        } else if (entity.kind === "platform") {
          mesh = new THREE.Group();
          const block = new THREE.Mesh(new THREE.BoxGeometry(2.45, 1.4, 5), materials.platform);
          block.position.y = 0.7;
          const top = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.07, 5.05), materials.platformTop);
          top.position.y = 1.43;
          mesh.add(block, top);
        } else if (entity.kind === "jump-orb") {
          mesh = new THREE.Group();
          const orb = new THREE.Mesh(new THREE.SphereGeometry(0.48, 18, 14), materials.jumpOrb);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.09, 8, 28), materials.jumpOrb);
          ring.rotation.x = Math.PI / 2;
          mesh.add(orb, ring, createLabelSprite("JUMP ORB", "#ffeb5a"));
          mesh.position.y = 2.35;
        } else if (entity.kind === "diamond") {
          mesh = new THREE.Group();
          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), materials.diamond);
          gem.scale.y = 1.3;
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.055, 8, 30), new THREE.MeshBasicMaterial({ color: 0xd8ffff, transparent: true, opacity: 0.78 }));
          ring.rotation.x = Math.PI / 2;
          const glow = new THREE.PointLight(0x4de1ff, 8, 8, 2);
          mesh.add(gem, ring, glow, createLabelSprite("DIAMOND", "#4de1ff"));
          mesh.position.y = 1.75;
        } else {
          mesh = createItemMesh(entity.item);
          mesh.position.y = 1.5;
        }
        mesh.position.x = entity.lane === undefined ? 0 : LANES[entity.lane];
        mesh.position.z = PLAYER_DISTANCE - (entity.distance - state.distance);
        mesh.traverse(child => {
          if (child.isMesh) child.castShadow = true;
        });
        mesh.userData.entity = entity;
        entity.mesh = mesh;
        entityGroup.add(mesh);
      };

      const clearEntities = () => {
        state.entities.forEach(entity => {
          if (entity.mesh) entityGroup.remove(entity.mesh);
        });
        state.entities = [];
      };

      const spawnAhead = () => {
        while (30 + state.nextChunk * CHUNK_LENGTH < state.distance + LOOK_AHEAD) {
          const chunk = generateNeonRushChunk(state.nextChunk++, state.runSeed);
          chunk.entities.forEach(entity => {
            const instance = { ...entity, hit: false, collected: false };
            createEntityMesh(instance);
            state.entities.push(instance);
          });
        }
      };

      const updateHud = now => {
        const baseSpeed = speedForDistance(state.distance, state.speedBoost);
        const speed = now < state.slowUntil ? baseSpeed * 0.58 : baseSpeed;
        distanceNode.textContent = `${Math.floor(state.distance).toLocaleString()} m`;
        speedNode.textContent = `${(speed / BASE_SPEED).toFixed(1)}x`;
        diamondsNode.textContent = state.runDiamonds.toLocaleString();
        reviveNode.classList.toggle("active", state.revive);
        reviveNode.querySelector("b").textContent = state.revive ? "1" : "0";
        shieldNode.classList.toggle("active", state.shield);
        shieldNode.querySelector("b").textContent = state.shield ? "1" : "0";
        slowNode.classList.toggle("active", now < state.slowUntil);
        slowNode.querySelector("b").textContent = now < state.slowUntil ? `${Math.ceil((state.slowUntil - now) / 1000)}s` : "--";
        const effects = [];
        if (now < state.darkUntil) effects.push(`DARK ${Math.ceil((state.darkUntil - now) / 1000)}s`);
        if (now < state.reverseUntil) effects.push(`REVERSED ${Math.ceil((state.reverseUntil - now) / 1000)}s`);
        effectsNode.innerHTML = effects.map(effect => `<span>${effect}</span>`).join("");
        darknessNode.classList.toggle("active", now < state.darkUntil);
      };

      const showMenu = (errorMessage = "") => {
        state.phase = "menu";
        if (state.speedBoostQuantity < 1) state.useSpeedBoost = false;
        overlay.className = "neon-overlay visible";
        overlay.innerHTML = `<div class="neon-panel"><p class="eyebrow">Fixed course v3</p><h3>Run the neon grid</h3><p>Switch lanes, jump hazards, and collect very rare diamonds after 2,500 meters. Diamonds can be spent in the hub shop.</p><div class="neon-key-guide"><span>A / LEFT<small>Move left</small></span><span>SPACE / UP<small>Jump / orb jump</small></span><span>D / RIGHT<small>Move right</small></span></div><button class="neon-boost-toggle ${state.useSpeedBoost ? "active" : ""}" type="button" data-neon-action="toggle-boost" ${state.speedBoostQuantity < 1 ? "disabled" : ""}><span>2x Speed Start</span><strong>${state.speedBoostQuantity} owned</strong></button>${errorMessage ? `<p class="neon-menu-error" data-neon-menu-error></p>` : ""}<button class="primary-button" type="button" data-neon-action="start">Start run</button></div>`;
        if (errorMessage) overlay.querySelector("[data-neon-menu-error]").textContent = errorMessage;
      };

      const showCountdown = label => {
        state.phase = "countdown";
        state.countdownLabel = label;
        state.countdownEnd = performance.now() + 3000;
        state.lastTime = performance.now();
        overlay.className = "neon-overlay visible countdown";
        overlay.innerHTML = `<strong data-neon-countdown>3</strong><span>${label}</span>`;
        startMusic();
      };

      const startCountdown = async () => {
        if (state.starting) return;
        state.starting = true;
        state.phase = "starting";
        const startButton = overlay.querySelector("[data-neon-action='start']");
        if (startButton) {
          startButton.disabled = true;
          startButton.textContent = "Preparing run...";
        }
        try {
          const run = await context.beginNeonRun(state.useSpeedBoost);
          if (disposed) {
            context.endNeonRun(run.run_id).catch(() => {});
            return;
          }
          Object.assign(state, { runId: run.run_id, runSeed: Number(run.run_seed), speedBoost: Boolean(run.speed_boost), speedBoostQuantity: Number(run.speed_boost_quantity), cubeColor: run.cube_color, runDiamonds: 0 });
          context.onEconomyChanged({ diamonds: run.diamonds, speed_boost_quantity: run.speed_boost_quantity, cube_color: run.cube_color });
          applyCubeColor(state.cubeColor);
        } catch (error) {
          if (!disposed) showMenu(error.message);
          return;
        } finally {
          state.starting = false;
        }
        ensureAudio();
        clearEntities();
        Object.assign(state, { distance: 0, lane: 1, targetLane: 1, playerY: 0.72, velocityY: 0, grounded: true, revive: false, shield: false, slowUntil: 0, darkUntil: 0, reverseUntil: 0, invulnerableUntil: 0, nextChunk: 0, submitting: false, useSpeedBoost: false });
        player.position.set(0, 0.72, PLAYER_DISTANCE);
        player.rotation.set(0, 0, 0);
        startGate.visible = true;
        spawnAhead();
        showCountdown("Start line");
      };

      const pause = automatic => {
        if (!["running", "countdown"].includes(state.phase)) return;
        state.pausedFrom = state.phase;
        state.phase = "paused";
        stopMusic();
        overlay.className = "neon-overlay visible";
        overlay.innerHTML = `<div class="neon-panel"><p class="eyebrow">${automatic ? "Run auto-paused" : "Game paused"}</p><h3>Hold that thought</h3><p>Your run is frozen until you are ready.</p><button class="primary-button" type="button" data-neon-action="resume">Resume</button></div>`;
      };

      const resume = () => {
        if (state.phase !== "paused") return;
        showCountdown("Resuming");
      };

      const move = direction => {
        if (state.phase !== "running") return;
        const adjustedDirection = performance.now() < state.reverseUntil ? -direction : direction;
        state.targetLane = Math.max(0, Math.min(2, state.targetLane + adjustedDirection));
      };

      const jump = () => {
        if (state.phase !== "running") return;
        if (state.grounded) {
          state.velocityY = 13;
          state.grounded = false;
          sound(310, 0.09, "square", 0.04, 760);
          sound(155, 0.12, "triangle", 0.025, 380);
          noiseHit(0.025, 0.008, 3200, "highpass");
          return;
        }
        const jumpOrb = state.entities.find(entity => entity.kind === "jump-orb" && !entity.activated && Math.abs(entity.distance - state.distance) < 2.4 && Math.abs(player.position.x - LANES[entity.lane]) < 1.2);
        if (!jumpOrb) return;
        jumpOrb.activated = true;
        jumpOrb.mesh.visible = false;
        state.velocityY = 19.5;
        sound(520, 0.13, "square", 0.052, 1280);
        sound(260, 0.18, "sawtooth", 0.025, 720);
        window.setTimeout(() => sound(1040, 0.09, "triangle", 0.034, 1560), 55);
        flash("jump-flash");
      };

      const flash = className => {
        shell.classList.add(className);
        window.setTimeout(() => shell.classList.remove(className), 250);
      };

      const collect = (entity, now) => {
        entity.collected = true;
        entity.mesh.visible = false;
        if (entity.item === "revive") state.revive = true;
        if (entity.item === "shield") state.shield = true;
        if (entity.item === "slow") state.slowUntil = Math.max(state.slowUntil, now) + 6000;
        if (entity.item === "dark") state.darkUntil = now + 4500;
        if (entity.item === "reverse") state.reverseUntil = now + 6000;
        sound(entity.item === "slow" ? 360 : entity.item === "dark" ? 150 : entity.item === "reverse" ? 260 : 680, 0.18, entity.item === "dark" ? "sawtooth" : "square", 0.052, entity.item === "dark" ? 42 : entity.item === "reverse" ? 620 : 1080);
        noiseHit(entity.item === "dark" ? 0.3 : 0.08, entity.item === "dark" ? 0.035 : 0.015, entity.item === "reverse" ? 900 : 3200, entity.item === "dark" ? "lowpass" : "bandpass");
        window.setTimeout(() => sound(entity.item === "slow" ? 230 : entity.item === "dark" ? 58 : entity.item === "reverse" ? 720 : 920, 0.14, "triangle", 0.034, entity.item === "dark" ? 30 : entity.item === "reverse" ? 180 : 1320), 70);
        flash("pickup-flash");
      };

      const collectDiamond = entity => {
        entity.collected = true;
        entity.mesh.visible = false;
        const claim = (async () => {
          let lastError;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const result = await context.claimNeonDiamond(state.runId, entity.chunk);
              if (result.awarded) {
                state.runDiamonds++;
                context.onEconomyChanged({ diamonds: result.diamonds });
                sound(880, 0.2, "triangle", 0.06, 1760);
                window.setTimeout(() => sound(1320, 0.16, "sine", 0.04, 2100), 75);
                flash("diamond-flash");
              }
              return;
            } catch (error) {
              lastError = error;
              if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 500 * (attempt + 1)));
            }
          }
          context.onDiamondError(lastError);
        })();
        state.pendingClaims.add(claim);
        claim.finally(() => state.pendingClaims.delete(claim));
      };

      const findSafeLane = () => {
        const dangerousKinds = new Set(["spike", "wall", "beam"]);
        const dangerByLane = LANES.map((_, lane) => state.entities.some(entity => !entity.hit && dangerousKinds.has(entity.kind) && entity.lane === lane && entity.distance > state.distance - 2 && entity.distance < state.distance + 10));
        const candidates = [state.targetLane, 1, 0, 2].filter((lane, index, all) => all.indexOf(lane) === index && !dangerByLane[lane]);
        return candidates[0] ?? 1;
      };

      const absorbCollision = (entity, now) => {
        entity.hit = true;
        if (now < state.invulnerableUntil) return;
        if (state.shield) {
          state.shield = false;
          state.invulnerableUntil = now + 1300;
          sound(740, 0.24, "sine", 0.065);
          flash("shield-flash");
          return;
        }
        if (state.revive) {
          state.revive = false;
          state.targetLane = findSafeLane();
          state.lane = state.targetLane;
          player.position.x = LANES[state.targetLane];
          state.invulnerableUntil = now + 2500;
          state.slowUntil = Math.max(state.slowUntil, now + 3500);
          state.entities.forEach(other => {
            if (other.distance > state.distance - 2 && other.distance < state.distance + 12) {
              other.hit = true;
              if (other.mesh) other.mesh.visible = false;
            }
          });
          sound(240, 0.3, "sawtooth", 0.05);
          window.setTimeout(() => sound(520, 0.28, "sine", 0.05), 120);
          flash("revive-flash");
          return;
        }
        endRun();
      };

      const endRun = async () => {
        if (state.phase !== "running") return;
        state.phase = "gameover";
        stopMusic();
        state.submitting = true;
        sound(180, 0.38, "sawtooth", 0.08, 45);
        const score = Math.max(0, Math.floor(state.distance));
        overlay.className = "neon-overlay visible";
        overlay.innerHTML = `<div class="neon-panel gameover"><p class="eyebrow">Run over</p><h3>${formatScore(score)}</h3><p data-neon-save>Saving your score...</p><button class="primary-button" type="button" data-neon-action="restart">Run again</button></div>`;
        try {
          const result = await context.submitScore(score);
          if (disposed) return;
          const saveNode = overlay.querySelector("[data-neon-save]");
          if (saveNode) saveNode.textContent = result.is_personal_best ? "New personal best. The grid remembers." : `Personal best: ${formatScore(result.personal_best)}.`;
          context.onScoreSaved(result);
        } catch (error) {
          const saveNode = overlay.querySelector("[data-neon-save]");
          if (saveNode) saveNode.textContent = `Score not saved: ${error.message}`;
        } finally {
          await Promise.allSettled([...state.pendingClaims]);
          if (state.runId) {
            try {
              await context.endNeonRun(state.runId);
            } catch {
              // The score remains valid even if closing the run fails.
            }
          }
          state.runId = null;
          state.submitting = false;
        }
      };

      const handleAction = action => {
        if (action === "start") startCountdown();
        if (action === "restart") showMenu();
        if (action === "toggle-boost" && state.speedBoostQuantity > 0) {
          state.useSpeedBoost = !state.useSpeedBoost;
          showMenu();
        }
        if (action === "resume") resume();
        if (action === "pause") state.phase === "paused" ? resume() : pause(false);
        if (action === "mute") {
          muted = !muted;
          shell.querySelector("[data-neon-action='mute']").textContent = muted ? "MUTED" : "SOUND";
        }
      };

      const onClick = event => {
        const action = event.target.closest("[data-neon-action]")?.dataset.neonAction;
        const control = event.target.closest("[data-neon-control]")?.dataset.neonControl;
        if (action) handleAction(action);
        if (control === "left") move(-1);
        if (control === "right") move(1);
        if (control === "jump") jump();
      };

      const onKeyDown = event => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyP", "Escape"].includes(event.code)) event.preventDefault();
        if (event.repeat) return;
        if (event.code === "ArrowLeft" || event.code === "KeyA") move(-1);
        if (event.code === "ArrowRight" || event.code === "KeyD") move(1);
        if (event.code === "ArrowUp" || event.code === "Space") jump();
        if (event.code === "KeyP" || event.code === "Escape") state.phase === "paused" ? resume() : pause(false);
      };

      const onVisibility = () => {
        if (document.hidden) pause(true);
      };

      const onResize = () => {
        if (!canvasHost.clientWidth || !canvasHost.clientHeight) return;
        const aspect = canvasHost.clientWidth / canvasHost.clientHeight;
        const portrait = aspect < 0.85;
        camera.aspect = aspect;
        camera.fov = portrait ? 70 : 58;
        Object.assign(cameraComposition, portrait ? { x: 3.8, y: 7.2, z: 18, targetY: 0.65, targetZ: -5 } : aspect < 1.15 ? { x: 7, y: 7.6, z: 16, targetY: 0.9, targetZ: -6.5 } : { x: 10, y: 8, z: 15, targetY: 1.15, targetZ: -8 });
        camera.position.x = cameraComposition.x;
        camera.position.z = cameraComposition.z;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, portrait ? 1.4 : 1.75));
        renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight, false);
      };

      const update = now => {
        const rawDelta = Math.min(0.05, (now - state.lastTime) / 1000);
        let visualSpeed = 1.5;
        state.lastTime = now;

        if (state.phase === "countdown") {
          const remaining = Math.ceil((state.countdownEnd - now) / 1000);
          const countdownNode = overlay.querySelector("[data-neon-countdown]");
          if (countdownNode) countdownNode.textContent = Math.max(1, remaining);
          if (now >= state.countdownEnd) {
            state.phase = "running";
            overlay.className = "neon-overlay";
            overlay.innerHTML = "";
            sound(620, 0.14, "square", 0.05);
          }
        }

        if (state.phase === "running") {
          const baseSpeed = speedForDistance(state.distance, state.speedBoost);
          const currentSpeed = now < state.slowUntil ? baseSpeed * 0.58 : baseSpeed;
          visualSpeed = currentSpeed;
          state.distance += currentSpeed * rawDelta;
          state.lane += (state.targetLane - state.lane) * Math.min(1, rawDelta * 12);
          player.position.x = LANES[0] + state.lane * 3;

          const supportingPlatform = state.entities.find(entity => entity.kind === "platform" && Math.abs(entity.distance - state.distance) < 2.45 && Math.abs(player.position.x - LANES[entity.lane]) < 1.05);
          const platformY = 2.08;
          if (state.grounded && state.playerY > 0.8 && !supportingPlatform) {
            state.grounded = false;
            state.velocityY = 0;
          } else if (!state.grounded) {
            const previousY = state.playerY;
            state.velocityY -= 34 * rawDelta;
            state.playerY += state.velocityY * rawDelta;
            if (supportingPlatform && state.velocityY <= 0 && previousY >= platformY && state.playerY <= platformY) {
              state.playerY = platformY;
              state.velocityY = 0;
              state.grounded = true;
            } else if (state.playerY <= 0.72) {
              state.playerY = 0.72;
              state.velocityY = 0;
              state.grounded = true;
            }
          }
          player.position.y = state.playerY + (state.grounded ? Math.sin(now * 0.006) * 0.035 : 0);
          const targetPitch = state.grounded ? 0 : Math.max(-0.26, Math.min(0.26, state.velocityY * -0.019));
          player.rotation.x += (targetPitch - player.rotation.x) * Math.min(1, rawDelta * 8);
          player.rotation.y += (0 - player.rotation.y) * Math.min(1, rawDelta * 8);
          player.rotation.z += ((state.targetLane - state.lane) * -0.2 - player.rotation.z) * Math.min(1, rawDelta * 10);
          const invulnerable = now < state.invulnerableUntil;
          playerBody.material.emissive.setHex(invulnerable ? 0x7a5b00 : cubePalette.emissive);
          playerEdges.material.color.setHex(invulnerable ? 0xffdf5e : cubePalette.edge);
          const playerPulse = invulnerable ? 1 + Math.sin(now * 0.02) * 0.045 : 1;
          cubeVisual.scale.setScalar(playerPulse);

          spawnAhead();
          state.entities.forEach(entity => {
            const relative = entity.distance - state.distance;
            entity.mesh.position.z = PLAYER_DISTANCE - relative;
            if (entity.kind === "item" && !entity.collected) {
              entity.mesh.rotation.y += rawDelta * 2.5;
              entity.mesh.position.y = 1.5 + Math.sin(now * 0.004 + entity.distance) * 0.18;
              if (Math.abs(relative) < 1.25 && Math.abs(player.position.x - LANES[entity.lane]) < 1.05) collect(entity, now);
            } else if (entity.kind === "diamond" && !entity.collected) {
              entity.mesh.rotation.y += rawDelta * 3.8;
              entity.mesh.rotation.z = Math.sin(now * 0.003 + entity.distance) * 0.18;
              entity.mesh.position.y = 1.75 + Math.sin(now * 0.005 + entity.distance) * 0.2;
              if (Math.abs(relative) < 1.25 && Math.abs(player.position.x - LANES[entity.lane]) < 1.05) collectDiamond(entity);
            } else if (entity.kind === "jump-orb" && !entity.activated) {
              entity.mesh.rotation.y += rawDelta * 3.2;
              entity.mesh.position.y = 2.35 + Math.sin(now * 0.005 + entity.distance) * 0.15;
            } else if (!entity.hit && Math.abs(player.position.x - LANES[entity.lane]) < 1.05) {
              if (entity.kind === "platform" && Math.abs(relative) < 2.45 && state.playerY < 1.9) absorbCollision(entity, now);
              if (["spike", "wall", "beam"].includes(entity.kind) && Math.abs(relative) < 0.95) {
                const clearsJumpable = (["spike", "beam"].includes(entity.kind) && state.playerY > 1.65) || (entity.kind === "wall" && state.playerY > 4.15);
                if (!clearsJumpable) absorbCollision(entity, now);
              }
            }
          });
          state.entities = state.entities.filter(entity => {
            if (entity.distance >= state.distance - 14) return true;
            entityGroup.remove(entity.mesh);
            return false;
          });
          updateHud(now);
        }

        startGate.position.z = PLAYER_DISTANCE - (2 - state.distance);
        startGate.visible = state.distance < 18;
        groundSegments.forEach(segment => {
          segment.position.z += visualSpeed * rawDelta;
          if (segment.position.z > PLAYER_DISTANCE + 20) segment.position.z -= groundSegments.length * 24;
        });
        scenery.forEach((object, index) => {
          object.position.z += visualSpeed * rawDelta * 0.72;
          if (object.position.z > PLAYER_DISTANCE + 24) object.position.z -= scenery.length * 13;
          object.rotation.y += rawDelta * object.userData.spin;
          object.rotation.z = Math.sin(now * 0.0007 + object.userData.phase) * 0.18;
          object.position.y += Math.sin(now * 0.001 + object.userData.phase) * rawDelta * 0.08;
        });
        spaceArches.forEach(arch => {
          arch.position.z += visualSpeed * rawDelta * 0.82;
          if (arch.position.z > PLAYER_DISTANCE + 14) arch.position.z -= spaceArches.length * 19;
        });
        speedStreaks.forEach((streak, index) => {
          streak.position.z += visualSpeed * rawDelta * (1.15 + (index % 5) * 0.08);
          streak.scale.z = 0.7 + visualSpeed / MAX_SPEED * 1.4;
          if (streak.position.z > PLAYER_DISTANCE + 18) streak.position.z -= 205;
        });
        trail.forEach((cube, index) => {
          cube.position.x = Math.sin(now * 0.006 - index * 0.7) * 0.08;
          cube.position.y = Math.cos(now * 0.005 - index) * 0.08;
        });
        stars.rotation.y = Math.sin(now * 0.00008) * 0.06;
        nearStars.rotation.y = Math.sin(now * 0.00011) * -0.085;
        nearStars.position.z = Math.sin(now * 0.00025) * 2;
        nebulae.forEach((nebula, index) => {
          nebula.material.opacity = 0.62 + Math.sin(now * 0.00035 + index * 2) * 0.1;
          nebula.rotation.z = Math.sin(now * 0.00008 + index) * 0.04;
        });
        camera.position.y = cameraComposition.y + Math.sin(now * 0.0007) * 0.1;
        camera.lookAt(0, cameraComposition.targetY, cameraComposition.targetZ);
        renderer.render(scene, camera);
        if (!disposed) frameId = window.requestAnimationFrame(update);
      };

      shell.addEventListener("click", onClick);
      window.addEventListener("keydown", onKeyDown, { passive: false });
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("resize", onResize);
      window.visualViewport?.addEventListener("resize", onResize);
      const resizeObserver = window.ResizeObserver ? new ResizeObserver(onResize) : null;
      resizeObserver?.observe(canvasHost);
      onResize();
      showMenu();
      updateHud(performance.now());
      frameId = window.requestAnimationFrame(update);

      cleanupThree = () => {
        stopMusic();
        shell.removeEventListener("click", onClick);
        window.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("resize", onResize);
        window.visualViewport?.removeEventListener("resize", onResize);
        resizeObserver?.disconnect();
        clearEntities();
        scene.traverse(object => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
        });
        skyTexture.dispose();
        generatedTextures.forEach(texture => texture.dispose());
        renderer.dispose();
        renderer.forceContextLoss();
      };
    };

    const reloadHandler = event => {
      if (event.target.closest("[data-neon-action='reload']")) {
        shell.innerHTML = `<div class="neon-rush-loading"><span class="neon-loader"></span><strong>Loading Neon Rush 3D</strong><small>Preparing the endless track...</small></div>`;
        boot();
      }
    };

    shell.addEventListener("click", reloadHandler);
    boot();

    return () => {
      disposed = true;
      const unfinishedRunId = game?.runId;
      const pendingClaims = [...(game?.pendingClaims ?? [])];
      if (unfinishedRunId) Promise.allSettled(pendingClaims).then(() => context.endNeonRun(unfinishedRunId)).catch(() => {});
      window.cancelAnimationFrame(frameId);
      shell.removeEventListener("click", reloadHandler);
      cleanupThree();
      if (audioContext) audioContext.close();
      game = null;
      container.innerHTML = "";
    };
  }
};
