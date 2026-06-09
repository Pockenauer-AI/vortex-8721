import { DEFAULT_MINE_COUNT, DEFAULT_SIZE, chordCell, coordinatesFor, createBoard, flaggedCount, formatMinesweeperTime, initializeBoard, isSolved, revealCell, revealMines, toggleFlag } from "./minesweeper-3d-logic.js";

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";
const CELL_GAP = 1.04;
const NUMBER_COLORS = ["#c7ff48", "#4de1ff", "#b997ff", "#ffcc5c", "#ff7f9b", "#60f2bd", "#f5f6fa"];

export const minesweeper3d = {
  slug: "minesweeper-3d",
  accent: "lime",
  formatScore: formatMinesweeperTime,
  mount(container, context) {
    let disposed = false;
    let frameId = 0;
    let cleanupThree = () => {};

    container.innerHTML = `<div class="minesweeper-shell"><div class="minesweeper-loading"><span class="neon-loader"></span><strong>Loading Minesweeper 3D</strong><small>Building the 5 x 5 x 5 minefield...</small></div></div>`;
    const shell = container.querySelector(".minesweeper-shell");

    const showLoadError = () => {
      shell.innerHTML = `<div class="minesweeper-message"><span class="neon-message-icon">!</span><h3>3D could not start</h3><p>This game needs WebGL and an internet connection to load Three.js.</p><button class="primary-button" type="button" data-mine-action="reload">Try again</button></div>`;
    };

    const setupGame = THREE => {
      shell.innerHTML = `<div class="minesweeper-game">
        <div class="minesweeper-canvas" aria-label="Interactive 3D minefield"></div>
        <div class="minesweeper-hud">
          <span>Time<strong data-mine-time>0.000 s</strong></span>
          <span>Mines<strong data-mine-count>${DEFAULT_MINE_COUNT}</strong></span>
          <span>Layer<strong data-mine-layer>3 / 5</strong></span>
          <button type="button" data-mine-action="reset">RESET</button>
        </div>
        <div class="minesweeper-layer-controls">
          <button type="button" data-mine-action="layer-prev" aria-label="Previous layer">Q -</button>
          <span data-mine-layer-name>Layer 3</span>
          <button type="button" data-mine-action="layer-next" aria-label="Next layer">+ E</button>
        </div>
        <div class="minesweeper-mode-controls" aria-label="Touch action">
          <button class="active" type="button" data-mine-mode="reveal">REVEAL</button>
          <button type="button" data-mine-mode="flag">FLAG</button>
        </div>
        <div class="minesweeper-help">Drag to rotate / Wheel or Q/E changes layer / Right-click flags</div>
        <div class="minesweeper-overlay visible"></div>
      </div>`;

      const canvasHost = shell.querySelector(".minesweeper-canvas");
      const overlay = shell.querySelector(".minesweeper-overlay");
      const timeNode = shell.querySelector("[data-mine-time]");
      const mineCountNode = shell.querySelector("[data-mine-count]");
      const layerNode = shell.querySelector("[data-mine-layer]");
      const layerNameNode = shell.querySelector("[data-mine-layer-name]");
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      canvasHost.append(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x070910);
      scene.fog = new THREE.Fog(0x070910, 13, 25);
      const camera = new THREE.PerspectiveCamera(42, canvasHost.clientWidth / canvasHost.clientHeight, 0.1, 50);
      camera.position.set(0, 0.3, 13.5);
      scene.add(new THREE.HemisphereLight(0x8ea8ff, 0x130b20, 2.5));
      const keyLight = new THREE.DirectionalLight(0xdfffa2, 4.2);
      keyLight.position.set(5, 8, 8);
      scene.add(keyLight);
      const cyanLight = new THREE.PointLight(0x4de1ff, 24, 24, 2);
      cyanLight.position.set(-7, 2, 7);
      scene.add(cyanLight);
      const purpleLight = new THREE.PointLight(0x925dff, 20, 22, 2);
      purpleLight.position.set(6, -4, 3);
      scene.add(purpleLight);

      const starPositions = [];
      for (let index = 0; index < 500; index++) starPositions.push((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 22, -3 - Math.random() * 18);
      const starGeometry = new THREE.BufferGeometry();
      starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
      const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xa7c7ff, size: 0.045, transparent: true, opacity: 0.7 }));
      scene.add(stars);

      const boardGroup = new THREE.Group();
      boardGroup.rotation.set(-0.42, 0.67, 0.08);
      scene.add(boardGroup);
      const cellGeometry = new THREE.BoxGeometry(0.86, 0.86, 0.86);
      const edgeGeometry = new THREE.EdgesGeometry(cellGeometry);
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const visuals = [];
      const generatedTextures = [];
      let board = createBoard();
      let activeLayer = 2;
      let phase = "menu";
      let touchMode = "reveal";
      let startedAt = 0;
      let elapsed = 0;
      let submitting = false;
      let pointerState = null;

      const createLabelTexture = (text, color) => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const draw = canvas.getContext("2d");
        draw.clearRect(0, 0, 256, 256);
        draw.fillStyle = "rgba(5,7,14,.78)";
        draw.beginPath();
        draw.roundRect(38, 38, 180, 180, 34);
        draw.fill();
        draw.strokeStyle = color;
        draw.lineWidth = 8;
        draw.stroke();
        draw.fillStyle = color;
        draw.font = "700 126px 'Space Mono', monospace";
        draw.textAlign = "center";
        draw.textBaseline = "middle";
        draw.fillText(text, 128, 135);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        generatedTextures.push(texture);
        return texture;
      };

      const ensureLabel = (visual, text, color) => {
        const key = `${text}:${color}`;
        if (visual.label?.userData.key === key) return visual.label;
        if (visual.label) {
          visual.root.remove(visual.label);
          visual.label.material.map.dispose();
          visual.label.material.dispose();
        }
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: createLabelTexture(text, color), transparent: true, depthTest: false }));
        label.scale.set(0.62, 0.62, 0.62);
        label.position.z = 0.48;
        label.renderOrder = 4;
        label.userData.key = key;
        visual.root.add(label);
        visual.label = label;
        return label;
      };

      board.cells.forEach(cell => {
        const { x, y, z } = coordinatesFor(cell.index);
        const root = new THREE.Group();
        root.position.set((x - 2) * CELL_GAP, (2 - y) * CELL_GAP, (z - 2) * CELL_GAP);
        const material = new THREE.MeshStandardMaterial({ color: 0x232a3b, emissive: 0x07111d, roughness: 0.34, metalness: 0.55, transparent: true });
        const mesh = new THREE.Mesh(cellGeometry, material);
        mesh.userData.index = cell.index;
        const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x4de1ff, transparent: true });
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        root.add(mesh, edges);
        boardGroup.add(root);
        visuals.push({ root, mesh, edges, label: null, baseZ: root.position.z });
      });

      const clearLabels = () => visuals.forEach(visual => {
        if (!visual.label) return;
        visual.root.remove(visual.label);
        visual.label.material.map.dispose();
        visual.label.material.dispose();
        visual.label = null;
      });

      const updateLayerUi = () => {
        layerNode.textContent = `${activeLayer + 1} / ${DEFAULT_SIZE}`;
        layerNameNode.textContent = `Layer ${activeLayer + 1}`;
      };

      const updateVisuals = () => {
        const flags = flaggedCount(board);
        mineCountNode.textContent = String(Math.max(0, DEFAULT_MINE_COUNT - flags));
        visuals.forEach((visual, index) => {
          const cell = board.cells[index];
          const { z } = coordinatesFor(index);
          const active = z === activeLayer;
          const wrongFlag = ["lost", "won"].includes(phase) && cell.flagged && !cell.mine;
          let color = 0x20283a;
          let emissive = 0x07111d;
          if (cell.revealed && !cell.mine) {
            color = 0x10151f;
            emissive = 0x05070d;
          }
          if (cell.flagged) {
            color = wrongFlag ? 0xff5f78 : 0xffc857;
            emissive = wrongFlag ? 0x5b0717 : 0x5b3900;
          }
          if (cell.mine && cell.revealed) {
            color = cell.exploded ? 0xff355d : 0x7d2745;
            emissive = cell.exploded ? 0x8a071f : 0x320816;
          }
          visual.mesh.material.color.setHex(color);
          visual.mesh.material.emissive.setHex(emissive);
          visual.mesh.material.opacity = active ? cell.revealed && !cell.mine ? 0.34 : 0.92 : cell.revealed ? 0.035 : 0.1;
          visual.edges.material.color.setHex(active ? cell.flagged ? 0xffd36b : cell.exploded ? 0xff5f78 : 0x4de1ff : 0x433967);
          visual.edges.material.opacity = active ? 0.8 : 0.11;
          visual.root.scale.setScalar(active ? 1 : 0.9);
          visual.root.position.z = visual.baseZ + (active ? 0.08 : 0);
          if (cell.revealed && !cell.mine && cell.adjacent) ensureLabel(visual, String(cell.adjacent), NUMBER_COLORS[Math.min(cell.adjacent, NUMBER_COLORS.length) - 1]);
          else if (cell.flagged) ensureLabel(visual, wrongFlag ? "X" : "!", wrongFlag ? "#ff5f78" : "#ffcc5c");
          else if (cell.mine && cell.revealed) ensureLabel(visual, "X", cell.exploded ? "#ff5f78" : "#d87a9a");
          else if (visual.label) visual.label.visible = false;
          if (visual.label) visual.label.visible = active && (cell.flagged || cell.mine && cell.revealed || cell.revealed && cell.adjacent > 0);
        });
      };

      const setLayer = nextLayer => {
        activeLayer = Math.max(0, Math.min(DEFAULT_SIZE - 1, nextLayer));
        updateLayerUi();
        updateVisuals();
      };

      const showMenu = () => {
        phase = "menu";
        overlay.className = "minesweeper-overlay visible";
        overlay.innerHTML = `<div class="minesweeper-panel"><p class="eyebrow">125 cells / 18 mines</p><h3>Clear the volume</h3><p>Numbers count mines in all 26 surrounding positions. Your timer begins when you reveal the first cell.</p><div class="minesweeper-rules"><span><b>DRAG</b> Rotate</span><span><b>Q / E</b> Change layer</span><span><b>RIGHT CLICK</b> Flag</span></div><button class="primary-button" type="button" data-mine-action="start">Start game</button></div>`;
      };

      const reset = () => {
        board = createBoard();
        phase = "ready";
        startedAt = 0;
        elapsed = 0;
        submitting = false;
        timeNode.textContent = formatMinesweeperTime(0);
        clearLabels();
        setLayer(2);
        overlay.className = "minesweeper-overlay";
        overlay.innerHTML = "";
        updateVisuals();
      };

      const lose = () => {
        phase = "lost";
        revealMines(board);
        updateVisuals();
        overlay.className = "minesweeper-overlay visible";
        overlay.innerHTML = `<div class="minesweeper-panel lost"><p class="eyebrow">Mine detonated</p><h3>Volume breached</h3><p>The red cell was the mine you hit. Incorrect flags are marked in red.</p><button class="primary-button" type="button" data-mine-action="restart">Try again</button></div>`;
      };

      const win = async now => {
        if (phase !== "running") return;
        phase = "won";
        elapsed = Math.max(1, Math.round(now - startedAt));
        updateVisuals();
        submitting = true;
        overlay.className = "minesweeper-overlay visible";
        overlay.innerHTML = `<div class="minesweeper-panel won"><p class="eyebrow">Volume cleared</p><h3>${formatMinesweeperTime(elapsed)}</h3><p data-mine-save>Saving your time...</p><button class="primary-button" type="button" data-mine-action="restart">Play again</button></div>`;
        try {
          const result = await context.submitScore(elapsed);
          if (disposed) return;
          const saveNode = overlay.querySelector("[data-mine-save]");
          if (saveNode) saveNode.textContent = result.is_personal_best ? "New personal best." : `Personal best: ${formatMinesweeperTime(result.personal_best)}.`;
          context.onScoreSaved(result);
        } catch (error) {
          const saveNode = overlay.querySelector("[data-mine-save]");
          if (saveNode) saveNode.textContent = `Time not saved: ${error.message}`;
        } finally {
          submitting = false;
        }
      };

      const reveal = (index, now) => {
        if (!["ready", "running"].includes(phase)) return;
        if (!board.initialized && board.cells[index].flagged) return;
        if (!board.initialized) {
          initializeBoard(board, index);
          phase = "running";
          startedAt = now;
        }
        const result = board.cells[index].revealed ? chordCell(board, index) : revealCell(board, index);
        if (result.hitMine) return lose();
        updateVisuals();
        if (isSolved(board)) win(now);
      };

      const flag = index => {
        if (!["ready", "running"].includes(phase)) return;
        const cell = board.cells[index];
        if (!cell.flagged && flaggedCount(board) >= DEFAULT_MINE_COUNT) return;
        if (toggleFlag(board, index)) updateVisuals();
      };

      const raycastCell = event => {
        const bounds = renderer.domElement.getBoundingClientRect();
        pointer.x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
        pointer.y = -(event.clientY - bounds.top) / bounds.height * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const activeMeshes = visuals.filter((_, index) => coordinatesFor(index).z === activeLayer).map(visual => visual.mesh);
        return raycaster.intersectObjects(activeMeshes, false)[0]?.object.userData.index;
      };

      const useCell = (event, action) => {
        const index = raycastCell(event);
        if (index === undefined) return;
        if (action === "flag") flag(index);
        else reveal(index, performance.now());
      };

      const onPointerDown = event => {
        if (event.button > 0) return;
        pointerState = { id: event.pointerId, x: event.clientX, y: event.clientY, rotationX: boardGroup.rotation.x, rotationY: boardGroup.rotation.y, dragged: false, pointerType: event.pointerType };
        renderer.domElement.setPointerCapture(event.pointerId);
      };

      const onPointerMove = event => {
        if (!pointerState || pointerState.id !== event.pointerId) return;
        const dx = event.clientX - pointerState.x;
        const dy = event.clientY - pointerState.y;
        if (Math.hypot(dx, dy) > 5) pointerState.dragged = true;
        if (!pointerState.dragged) return;
        boardGroup.rotation.y = pointerState.rotationY + dx * 0.009;
        boardGroup.rotation.x = Math.max(-1.25, Math.min(1.25, pointerState.rotationX + dy * 0.009));
      };

      const onPointerUp = event => {
        if (!pointerState || pointerState.id !== event.pointerId) return;
        const state = pointerState;
        pointerState = null;
        if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
        if (!state.dragged) useCell(event, state.pointerType === "touch" ? touchMode : "reveal");
      };

      const onContextMenu = event => {
        event.preventDefault();
        if (event.button !== 2) return;
        useCell(event, "flag");
      };

      const onWheel = event => {
        event.preventDefault();
        setLayer(activeLayer + (event.deltaY > 0 ? 1 : -1));
      };

      const handleAction = action => {
        if (action === "start" || action === "restart" || action === "reset") reset();
        if (action === "layer-prev") setLayer(activeLayer - 1);
        if (action === "layer-next") setLayer(activeLayer + 1);
      };

      const onClick = event => {
        const action = event.target.closest("[data-mine-action]")?.dataset.mineAction;
        const mode = event.target.closest("[data-mine-mode]")?.dataset.mineMode;
        if (action && !(submitting && action === "restart")) handleAction(action);
        if (mode) {
          touchMode = mode;
          shell.querySelectorAll("[data-mine-mode]").forEach(button => button.classList.toggle("active", button.dataset.mineMode === mode));
        }
      };

      const onKeyDown = event => {
        if (!["KeyQ", "KeyE"].includes(event.code) || event.repeat) return;
        event.preventDefault();
        setLayer(activeLayer + (event.code === "KeyQ" ? -1 : 1));
      };

      const onResize = () => {
        if (!canvasHost.clientWidth || !canvasHost.clientHeight) return;
        camera.aspect = canvasHost.clientWidth / canvasHost.clientHeight;
        camera.position.z = camera.aspect < 0.8 ? 16.2 : 13.5;
        boardGroup.position.x = camera.aspect < 0.8 ? -0.55 : 0;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, camera.aspect < 0.8 ? 1.4 : 1.75));
        renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight, false);
      };

      const update = now => {
        if (phase === "running") {
          elapsed = Math.max(0, now - startedAt);
          timeNode.textContent = formatMinesweeperTime(elapsed);
        }
        const exploded = board.cells.find(cell => cell.exploded);
        if (exploded) visuals[exploded.index].root.scale.setScalar(1 + Math.sin(now * 0.018) * 0.08);
        stars.rotation.z = now * 0.000015;
        renderer.render(scene, camera);
        if (!disposed) frameId = window.requestAnimationFrame(update);
      };

      shell.addEventListener("click", onClick);
      window.addEventListener("keydown", onKeyDown, { passive: false });
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("pointercancel", onPointerUp);
      renderer.domElement.addEventListener("contextmenu", onContextMenu);
      renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("resize", onResize);
      window.visualViewport?.addEventListener("resize", onResize);
      const resizeObserver = window.ResizeObserver ? new ResizeObserver(onResize) : null;
      resizeObserver?.observe(canvasHost);
      updateLayerUi();
      updateVisuals();
      showMenu();
      onResize();
      frameId = window.requestAnimationFrame(update);

      cleanupThree = () => {
        shell.removeEventListener("click", onClick);
        window.removeEventListener("keydown", onKeyDown);
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("pointercancel", onPointerUp);
        renderer.domElement.removeEventListener("contextmenu", onContextMenu);
        renderer.domElement.removeEventListener("wheel", onWheel);
        window.removeEventListener("resize", onResize);
        window.visualViewport?.removeEventListener("resize", onResize);
        resizeObserver?.disconnect();
        const geometries = new Set();
        const materials = new Set();
        scene.traverse(object => {
          if (object.geometry) geometries.add(object.geometry);
          if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
        });
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => {
          material.map?.dispose();
          material.dispose();
        });
        generatedTextures.forEach(texture => texture.dispose());
        renderer.dispose();
        renderer.forceContextLoss();
      };
    };

    const boot = async () => {
      try {
        const THREE = await import(THREE_URL);
        if (!disposed) setupGame(THREE);
      } catch {
        if (!disposed) showLoadError();
      }
    };

    const reloadHandler = event => {
      if (!event.target.closest("[data-mine-action='reload']")) return;
      shell.innerHTML = `<div class="minesweeper-loading"><span class="neon-loader"></span><strong>Loading Minesweeper 3D</strong><small>Building the 5 x 5 x 5 minefield...</small></div>`;
      boot();
    };

    shell.addEventListener("click", reloadHandler);
    boot();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      shell.removeEventListener("click", reloadHandler);
      cleanupThree();
      container.innerHTML = "";
    };
  }
};
