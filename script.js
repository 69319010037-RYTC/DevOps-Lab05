(() => {
  "use strict";

  const COLUMNS = 5;
  const ROWS = 4;
  const TOTAL_PIECES = COLUMNS * ROWS;
  const TAB_DEPTH = 0.18;
  const SVG_PADDING = 0.24;
  const board = document.querySelector("#board");
  const tray = document.querySelector("#piece-tray");
  const progress = document.querySelector("#progress");
  const status = document.querySelector("#game-status");
  const restartButton = document.querySelector("#restart");
  const musicToggle = document.querySelector("#music-toggle");
  const backgroundMusic = document.querySelector("#background-music");
  const image = new Image();

  backgroundMusic.volume = 0.28;

  let selectedPiece = null;
  let placedCount = 0;
  let dragState = null;
  let suppressPieceClick = false;
  let edgeMap = null;
  let audioContext = null;

  document.documentElement.style.setProperty("--columns", COLUMNS);
  document.documentElement.style.setProperty("--rows", ROWS);
  restartButton.disabled = true;

  image.addEventListener("load", () => {
    board.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
    document.documentElement.style.setProperty(
      "--piece-ratio",
      (image.naturalWidth / image.naturalHeight) * (ROWS / COLUMNS)
    );
    restartButton.disabled = false;
    startGame();
  });

  image.addEventListener("error", () => {
    status.textContent = "โหลดรูป car.jpg ไม่สำเร็จ กรุณาตรวจสอบว่าไฟล์อยู่ในโฟลเดอร์เดียวกับเกม";
    restartButton.disabled = true;
  });

  restartButton.addEventListener("click", startGame);
  musicToggle.addEventListener("click", toggleMusic);
  backgroundMusic.addEventListener("play", () => updateMusicButton(true));
  backgroundMusic.addEventListener("pause", () => updateMusicButton(false));
  backgroundMusic.addEventListener("error", () => {
    musicToggle.disabled = true;
    status.textContent = "โหลดไฟล์เพลงไม่สำเร็จ กรุณาตรวจสอบ background-music.mp3";
  });
  board.addEventListener("click", handleSlotClick);
  board.addEventListener("keydown", handleSlotKeydown);

  function toggleMusic() {
    if (backgroundMusic.paused) {
      backgroundMusic.play().catch(error => {
        status.textContent = "เปิดเพลงไม่สำเร็จ กรุณาลองอีกครั้ง";
        console.error("Unable to play the background music.", error);
      });
    } else {
      backgroundMusic.pause();
    }
  }

  function updateMusicButton(isPlaying) {
    musicToggle.textContent = isPlaying ? "ปิดเพลง" : "เปิดเพลง";
    musicToggle.setAttribute("aria-pressed", String(isPlaying));
  }

  function playPlaceEffect() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      console.error("Web Audio API is not supported; puzzle placement sound is unavailable.");
      return;
    }

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    const playChime = () => {
      playTone(audioContext, 660, audioContext.currentTime, 0.11);
      playTone(audioContext, 880, audioContext.currentTime + 0.08, 0.16);
    };

    if (audioContext.state === "suspended") {
      audioContext.resume().then(playChime).catch(error => {
        console.error("Unable to resume audio for the puzzle placement sound.", error);
      });
      return;
    }
    playChime();
  }

  function playTone(context, frequency, startTime, duration) {
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startTime);
    volume.gain.setValueAtTime(0.0001, startTime);
    volume.gain.exponentialRampToValueAtTime(0.13, startTime + 0.015);
    volume.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  function startGame() {
    if (!image.complete || !image.naturalWidth) {
      return;
    }

    board.replaceChildren();
    tray.replaceChildren();
    edgeMap = createEdgeMap();
    selectedPiece = null;
    placedCount = 0;
    updateProgress();
    status.classList.remove("is-success");
    status.textContent = "เลือกชิ้นส่วนแล้ววางลงในช่องที่ตรงกัน";

    for (let index = 0; index < TOTAL_PIECES; index += 1) {
      const row = Math.floor(index / COLUMNS);
      const column = index % COLUMNS;
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.dataset.index = index;
      slot.setAttribute("role", "button");
      slot.tabIndex = 0;
      slot.setAttribute("aria-label", `ช่องแถว ${row + 1} คอลัมน์ ${column + 1}`);
      slot.innerHTML = `<svg class="slot-shape" viewBox="${getViewBox()}" preserveAspectRatio="none" aria-hidden="true"><path d="${createPiecePath(index)}"></path></svg>`;
      board.append(slot);
    }

    const order = Array.from({ length: TOTAL_PIECES }, (_, index) => index);
    shuffle(order);

    for (const index of order) {
      tray.append(createPiece(index));
    }
  }

  function createPiece(index) {
    const row = Math.floor(index / COLUMNS);
    const column = index % COLUMNS;
    const piece = document.createElement("button");
    piece.className = "piece";
    piece.type = "button";
    piece.dataset.index = index;
    piece.setAttribute("aria-label", `ชิ้นส่วนแถว ${row + 1} คอลัมน์ ${column + 1}`);
    piece.setAttribute("aria-pressed", "false");
    piece.innerHTML = createPieceSvg(index);
    piece.addEventListener("click", () => {
      if (!suppressPieceClick) {
        selectPiece(piece);
      }
    });
    piece.addEventListener("pointerdown", beginDrag);
    return piece;
  }

  function createEdgeMap() {
    const randomSign = () => Math.random() < 0.5 ? -1 : 1;
    return {
      vertical: Array.from({ length: ROWS }, () =>
        Array.from({ length: COLUMNS - 1 }, randomSign)
      ),
      horizontal: Array.from({ length: ROWS - 1 }, () =>
        Array.from({ length: COLUMNS }, randomSign)
      )
    };
  }

  function getViewBox() {
    const size = 1 + SVG_PADDING * 2;
    return `${-SVG_PADDING} ${-SVG_PADDING} ${size} ${size}`;
  }

  function createPiecePath(index) {
    const row = Math.floor(index / COLUMNS);
    const column = index % COLUMNS;
    const topSign = row === 0 ? 0 : -edgeMap.horizontal[row - 1][column];
    const rightSign = column === COLUMNS - 1 ? 0 : edgeMap.vertical[row][column];
    const bottomSign = row === ROWS - 1 ? 0 : edgeMap.horizontal[row][column];
    const leftSign = column === 0 ? 0 : -edgeMap.vertical[row][column - 1];

    return [
      "M 0 0",
      createEdgePath(0, 0, 1, 0, 0, -1, topSign),
      createEdgePath(1, 0, 0, 1, 1, 0, rightSign),
      createEdgePath(1, 1, -1, 0, 0, 1, bottomSign),
      createEdgePath(0, 1, 0, -1, -1, 0, leftSign),
      "Z"
    ].join(" ");
  }

  function createEdgePath(startX, startY, tangentX, tangentY, normalX, normalY, sign) {
    const point = (position, depth = 0) => {
      const x = startX + tangentX * position + normalX * depth;
      const y = startY + tangentY * position + normalY * depth;
      return `${x.toFixed(3)} ${y.toFixed(3)}`;
    };

    if (sign === 0) {
      return `L ${point(1)}`;
    }

    const depth = sign * TAB_DEPTH;
    const shoulder = sign * TAB_DEPTH * 0.72;
    return [
      `L ${point(0.28)}`,
      `C ${point(0.32)} ${point(0.34, shoulder)} ${point(0.4, shoulder)}`,
      `C ${point(0.44, shoulder)} ${point(0.44, depth)} ${point(0.5, depth)}`,
      `C ${point(0.56, depth)} ${point(0.56, shoulder)} ${point(0.6, shoulder)}`,
      `C ${point(0.66, shoulder)} ${point(0.68)} ${point(0.72)}`,
      `L ${point(1)}`
    ].join(" ");
  }

  function createPieceSvg(index) {
    const row = Math.floor(index / COLUMNS);
    const column = index % COLUMNS;
    const path = createPiecePath(index);
    const clipId = `piece-clip-${index}`;
    return `<svg viewBox="${getViewBox()}" preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id="${clipId}"><path d="${path}"></path></clipPath></defs><image href="car.jpg" x="${-column}" y="${-row}" width="${COLUMNS}" height="${ROWS}" preserveAspectRatio="none" clip-path="url(#${clipId})"></image><path class="piece-edge" d="${path}"></path></svg>`;
  }

  function shuffle(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const otherIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[otherIndex]] = [items[otherIndex], items[index]];
    }
  }

  function selectPiece(piece) {
    if (piece.disabled) {
      return;
    }

    if (selectedPiece === piece) {
      setSelectedPiece(null);
      status.textContent = "ยกเลิกการเลือกชิ้นส่วนแล้ว";
      return;
    }

    setSelectedPiece(piece);
    status.textContent = "เลือกช่องบนกระดานที่ตรงกับชิ้นส่วนนี้";
  }

  function setSelectedPiece(piece) {
    if (selectedPiece) {
      selectedPiece.classList.remove("is-selected");
      selectedPiece.setAttribute("aria-pressed", "false");
    }
    selectedPiece = piece;
    if (selectedPiece) {
      selectedPiece.classList.add("is-selected");
      selectedPiece.setAttribute("aria-pressed", "true");
    }
  }

  function handleSlotClick(event) {
    const slot = event.target.closest(".slot");
    if (!slot || !selectedPiece || slot.classList.contains("is-correct")) {
      return;
    }
    tryPlacePiece(selectedPiece, Number(slot.dataset.index));
  }

  function handleSlotKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const slot = event.target.closest(".slot");
    if (slot) {
      event.preventDefault();
      slot.click();
    }
  }

  function beginDrag(event) {
    const piece = event.currentTarget;
    if (piece.disabled || event.button !== 0) {
      return;
    }

    dragState = {
      piece,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - piece.getBoundingClientRect().left,
      offsetY: event.clientY - piece.getBoundingClientRect().top,
      moved: false,
      previousStyle: {
        position: piece.style.position,
        left: piece.style.left,
        top: piece.style.top,
        width: piece.style.width,
        height: piece.style.height
      }
    };
    piece.setPointerCapture(event.pointerId);
    document.addEventListener("pointermove", movePiece);
    document.addEventListener("pointerup", endDrag, { once: true });
    document.addEventListener("pointercancel", cancelDrag, { once: true });
  }

  function movePiece(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    if (!dragState.moved &&
        Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < 5) {
      return;
    }

    if (!dragState.moved) {
      dragState.moved = true;
      setSelectedPiece(null);
      const rect = dragState.piece.getBoundingClientRect();
      dragState.piece.classList.add("is-dragging");
      dragState.piece.style.position = "fixed";
      dragState.piece.style.width = `${rect.width}px`;
      dragState.piece.style.height = `${rect.height}px`;
    }

    dragState.piece.style.left = `${event.clientX - dragState.offsetX}px`;
    dragState.piece.style.top = `${event.clientY - dragState.offsetY}px`;
  }

  function endDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    document.removeEventListener("pointermove", movePiece);
    document.removeEventListener("pointercancel", cancelDrag);
    const finishedDrag = dragState;
    dragState = null;
    restorePieceStyle(finishedDrag);

    if (!finishedDrag.moved) {
      return;
    }

    suppressPieceClick = true;
    window.setTimeout(() => {
      suppressPieceClick = false;
    }, 0);

    const targetIndex = getTargetIndex(event.clientX, event.clientY);
    if (targetIndex === null || !tryPlacePiece(finishedDrag.piece, targetIndex)) {
      status.textContent = "ตำแหน่งนี้ไม่ตรงกับชิ้นส่วน ลองวางใหม่อีกครั้ง";
    }
  }

  function cancelDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    document.removeEventListener("pointermove", movePiece);
    document.removeEventListener("pointerup", endDrag);
    restorePieceStyle(dragState);
    dragState = null;
  }

  function restorePieceStyle(state) {
    const { piece, previousStyle } = state;
    piece.classList.remove("is-dragging");
    piece.style.position = previousStyle.position;
    piece.style.left = previousStyle.left;
    piece.style.top = previousStyle.top;
    piece.style.width = previousStyle.width;
    piece.style.height = previousStyle.height;
  }

  function getTargetIndex(clientX, clientY) {
    const rect = board.getBoundingClientRect();
    if (clientX < rect.left || clientX >= rect.right ||
        clientY < rect.top || clientY >= rect.bottom) {
      return null;
    }

    const column = Math.floor(((clientX - rect.left) / rect.width) * COLUMNS);
    const row = Math.floor(((clientY - rect.top) / rect.height) * ROWS);
    return row * COLUMNS + column;
  }

  function tryPlacePiece(piece, targetIndex) {
    if (Number(piece.dataset.index) !== targetIndex) {
      status.textContent = "ชิ้นส่วนนี้ไม่ตรงกับช่องที่เลือก ลองอีกช่องหนึ่ง";
      return false;
    }

    const slot = board.querySelector(`.slot[data-index="${targetIndex}"]`);
    if (!slot || slot.classList.contains("is-correct")) {
      return false;
    }

    setSelectedPiece(null);
    piece.disabled = true;
    piece.classList.remove("is-selected");
    piece.classList.add("is-placed");
    piece.setAttribute("aria-label", "วางชิ้นส่วนถูกต้องแล้ว");
    slot.classList.add("is-correct");
    slot.setAttribute("aria-label", `วางชิ้นส่วนแถว ${Math.floor(targetIndex / COLUMNS) + 1} คอลัมน์ ${(targetIndex % COLUMNS) + 1} แล้ว`);
    slot.setAttribute("aria-disabled", "true");
    slot.tabIndex = -1;
    slot.append(piece);
    placedCount += 1;
    updateProgress();

    if (placedCount === TOTAL_PIECES) {
      status.textContent = "เยี่ยมมาก! ต่อภาพครบแล้ว";
      status.classList.add("is-success");
    } else {
      status.textContent = "ถูกต้อง! เลือกชิ้นส่วนถัดไปได้เลย";
    }
    playPlaceEffect();
    return true;
  }

  function updateProgress() {
    progress.textContent = `${placedCount} / ${TOTAL_PIECES}`;
  }

  image.src = "car.jpg";
})();
