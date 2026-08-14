(() => {
  const root = document.querySelector("[data-interactive-profile]");
  if (!root) return;

  const canvas = root.querySelector("canvas");
  const context = canvas.getContext("2d");
  const photo = root.querySelector(".interactive-profile__photo");
  const toggle = root.querySelector("[data-profile-toggle]");
  const scoreNode = root.querySelector("[data-profile-score]");
  const hint = root.querySelector("[data-profile-hint]");
  const finish = root.querySelector("[data-profile-finish]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const limits = {
    pan: 0.62,
    tilt: 0.46,
  };

  const scene = {
    width: 360,
    height: 430,
    pointerInside: false,
    keyboardControl: false,
    pointerX: 180,
    pointerY: 190,
    humanX: 102,
    humanY: 173,
    humanPan: 0,
    humanTilt: 0.1,
    humanTargetPan: 0,
    humanTargetTilt: 0.1,
    robotPan: -0.28,
    robotTilt: 0.16,
    robotStartPan: -0.28,
    robotStartTilt: 0.16,
    robotTargetPan: 0.22,
    robotTargetTilt: -0.12,
    robotPhase: "hold",
    robotPhaseStarted: performance.now(),
    robotPhaseUntil: performance.now() + 900,
    robotMoveDuration: 700,
    score: 0,
    completed: false,
    gazing: false,
    coin: null,
    lastTime: performance.now(),
  };

  const ink = () => getComputedStyle(document.documentElement).getPropertyValue("--global-text-color").trim() || "#111";
  const paper = () => getComputedStyle(document.documentElement).getPropertyValue("--global-bg-color").trim() || "#fff";
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(width / scene.width, 0, 0, height / scene.height, 0, 0);
  }

  function line(x1, y1, x2, y2) {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  }

  function circle(x, y, radius, fill = false) {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    fill ? context.fill() : context.stroke();
  }

  function transformPoint(originX, originY, localX, localY, rotation, scaleX, scaleY, shiftX, shiftY) {
    const scaledX = localX * scaleX;
    const scaledY = localY * scaleY;
    return {
      x: originX + shiftX + scaledX * Math.cos(rotation) - scaledY * Math.sin(rotation),
      y: originY + shiftY + scaledX * Math.sin(rotation) + scaledY * Math.cos(rotation),
    };
  }

  function humanEye() {
    const scaleX = 1 - Math.abs(scene.humanPan) * 0.12;
    return transformPoint(
      scene.humanX,
      scene.humanY,
      16 + scene.humanPan * 6,
      -7,
      scene.humanTilt,
      scaleX,
      1,
      scene.humanPan * 4,
      scene.humanTilt * 3,
    );
  }

  function robotEye() {
    const scaleX = 1 - Math.abs(scene.robotPan) * 0.1;
    const scaleY = 1 - Math.abs(scene.robotTilt) * 0.04;
    return transformPoint(
      265,
      226,
      -31 + scene.robotPan * 9,
      -23,
      scene.robotTilt,
      scaleX,
      scaleY,
      scene.robotPan * 6,
      scene.robotTilt * 5,
    );
  }

  function gazeDirection(facing, pan, tilt) {
    const projectedX = facing * Math.cos(tilt) * Math.cos(pan);
    const projectedY = facing * Math.sin(tilt);
    const magnitude = Math.hypot(projectedX, projectedY);
    return {
      x: projectedX / magnitude,
      y: projectedY / magnitude,
    };
  }

  function distanceToRay(point, origin, direction) {
    const offsetX = point.x - origin.x;
    const offsetY = point.y - origin.y;
    const projection = offsetX * direction.x + offsetY * direction.y;
    if (projection <= 0) return Infinity;
    return Math.abs(offsetX * direction.y - offsetY * direction.x);
  }

  function drawGrid() {
    context.save();
    context.strokeStyle = ink();
    context.globalAlpha = 0.08;
    context.lineWidth = 0.7;
    for (let x = 20; x < scene.width; x += 20) line(x, 0, x, scene.height);
    for (let y = 10; y < scene.height; y += 20) line(0, y, scene.width, y);
    context.globalAlpha = 0.16;
    line(0, 390, scene.width, 390);
    context.restore();
  }

  function drawGazeRay(origin, direction, pan) {
    // Keep the cue local to the robot instead of drawing through the human.
    const length = 62;
    const endpointX = origin.x + direction.x * length;
    const endpointY = origin.y + direction.y * length;
    context.save();
    context.strokeStyle = ink();
    context.fillStyle = ink();
    context.globalAlpha = 0.5;
    context.lineWidth = 1.35;
    context.setLineDash([6, 5]);
    line(origin.x, origin.y, endpointX, endpointY);
    context.setLineDash([]);

    const markerX = origin.x + direction.x * 38;
    const markerY = origin.y + direction.y * 38;
    circle(markerX, markerY, 3);
    context.font = "600 8px monospace";
    context.textAlign = "center";
    context.fillText("ROBOT GAZE", markerX, markerY - 8 - Math.abs(pan) * 2);
    context.restore();
  }

  function drawHuman(pan, tilt) {
    context.save();
    context.strokeStyle = ink();
    context.fillStyle = paper();
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";

    context.beginPath();
    context.moveTo(35, 355);
    context.quadraticCurveTo(47, 273, 89, 257);
    context.quadraticCurveTo(113, 248, 139, 268);
    context.quadraticCurveTo(159, 285, 169, 355);
    context.stroke();
    line(78, 258, 82, 222);
    line(117, 224, 123, 261);

    context.translate(scene.humanX, scene.humanY);
    context.translate(pan * 4, tilt * 3);
    context.rotate(tilt);
    context.scale(1 - Math.abs(pan) * 0.12, 1);
    context.beginPath();
    context.ellipse(0, 0, 39, 48, -0.08, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    circle(16 + pan * 6, -7, 2.2, true);
    context.beginPath();
    context.moveTo(31 + pan * 5, -3);
    context.lineTo(42 + pan * 6, 4);
    context.lineTo(31 + pan * 5, 9);
    context.stroke();
    line(26 + pan * 4, 20, 35 + pan * 5, 19);
    context.beginPath();
    context.arc(-4, -5, 39, 3.6, 5.45);
    context.stroke();
    context.restore();
  }

  function drawRobot(pan, tilt) {
    const neckX = 259;
    const neckY = 226;
    context.save();
    context.strokeStyle = ink();
    context.fillStyle = paper();
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";

    context.beginPath();
    context.roundRect(215, 268, 102, 89, 8);
    context.fill();
    context.stroke();
    line(232, 357, 225, 389);
    line(298, 357, 306, 389);
    line(236, 290, 294, 290);
    circle(265, 321, 8);
    line(neckX, 268, neckX, neckY);
    line(neckX + 12, 268, neckX + 12, neckY);

    context.translate(neckX + 6, neckY);
    context.translate(pan * 6, tilt * 5);
    context.rotate(tilt);
    context.scale(1 - Math.abs(pan) * 0.1, 1 - Math.abs(tilt) * 0.04);
    context.beginPath();
    context.roundRect(-47, -51, 88, 66, 10);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(-47, -37);
    context.lineTo(-58, -29);
    context.lineTo(-47, -20);
    context.stroke();
    circle(-31 + pan * 9, -23, 4.6, true);
    line(9, -51, 14, -65);
    circle(15, -68, 3);
    context.restore();
  }

  function drawCoin(time) {
    if (!scene.coin) return;
    const age = (time - scene.coin.startedAt) / 1000;
    if (age > 1.1) {
      scene.coin = null;
      return;
    }
    const y = scene.coin.y - age * 30;
    context.save();
    context.globalAlpha = Math.min(1, (1.1 - age) * 2);
    context.strokeStyle = ink();
    context.fillStyle = paper();
    context.lineWidth = 2;
    circle(scene.coin.x, y, 14, true);
    circle(scene.coin.x, y, 14);
    context.fillStyle = ink();
    context.font = "600 11px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("+1", scene.coin.x, y + 0.5);
    context.restore();
  }

  function updateRobotHead(time) {
    if (reduceMotion) return;
    if (scene.robotPhase === "hold") {
      if (time < scene.robotPhaseUntil) return;
      scene.robotPhase = "move";
      scene.robotPhaseStarted = time;
      scene.robotMoveDuration = 480 + Math.random() * 520;
      scene.robotStartPan = scene.robotPan;
      scene.robotStartTilt = scene.robotTilt;
      scene.robotTargetPan = (Math.random() * 2 - 1) * limits.pan;
      scene.robotTargetTilt = (Math.random() * 2 - 1) * limits.tilt;
      return;
    }

    const progress = clamp((time - scene.robotPhaseStarted) / scene.robotMoveDuration, 0, 1);
    const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    scene.robotPan = scene.robotStartPan + (scene.robotTargetPan - scene.robotStartPan) * eased;
    scene.robotTilt = scene.robotStartTilt + (scene.robotTargetTilt - scene.robotStartTilt) * eased;

    if (progress >= 1) {
      scene.robotPhase = "hold";
      scene.robotPhaseUntil = time + 850 + Math.random() * 1450;
    }
  }

  function updateHumanHead(delta) {
    if (scene.pointerInside && !scene.keyboardControl) {
      const horizontalDistance = Math.max(30, scene.pointerX - scene.humanX);
      scene.humanTargetTilt = clamp(Math.atan2(scene.pointerY - scene.humanY, horizontalDistance), -limits.tilt, limits.tilt);
      scene.humanTargetPan = clamp(((scene.pointerX - 180) / 180) * limits.pan, -limits.pan, limits.pan);
    } else if (!scene.keyboardControl) {
      scene.humanTargetPan = 0;
      scene.humanTargetTilt = 0.1;
    }
    const response = Math.min(1, delta * 5.5);
    scene.humanPan += (scene.humanTargetPan - scene.humanPan) * response;
    scene.humanTilt += (scene.humanTargetTilt - scene.humanTilt) * response;
  }

  function update(time) {
    const delta = Math.min(0.035, (time - scene.lastTime) / 1000);
    scene.lastTime = time;
    if (scene.completed) return;
    updateRobotHead(time);
    updateHumanHead(delta);

    const humanEyePosition = humanEye();
    const robotEyePosition = robotEye();
    const humanDirection = gazeDirection(1, scene.humanPan, scene.humanTilt);
    const robotDirection = gazeDirection(-1, scene.robotPan, scene.robotTilt);
    const robotSeesHuman = distanceToRay(humanEyePosition, robotEyePosition, robotDirection) < 12;
    const humanSeesRobot = distanceToRay(robotEyePosition, humanEyePosition, humanDirection) < 12;
    const mutualGaze = (scene.pointerInside || scene.keyboardControl) && robotSeesHuman && humanSeesRobot;

    if (mutualGaze && !scene.gazing) {
      scene.score += 1;
      scoreNode.textContent = scene.score;
      hint.textContent = scene.score === 1 ? "they noticed each other" : "mutual gaze";
      scene.coin = { x: 181, y: 145, startedAt: time };
      if (scene.score >= 100) {
        scene.completed = true;
        root.classList.add("is-complete");
        finish.hidden = false;
        hint.hidden = true;
        canvas.setAttribute("tabindex", "-1");
      }
    } else if (!mutualGaze && scene.gazing) {
      hint.textContent = "move the human to meet the robot's gaze";
    }
    scene.gazing = mutualGaze;
  }

  function draw(time) {
    if (canvas.hidden) {
      requestAnimationFrame(draw);
      return;
    }
    resizeCanvas();
    context.clearRect(0, 0, scene.width, scene.height);
    drawGrid();
    update(time);

    const robotEyePosition = robotEye();
    drawGazeRay(robotEyePosition, gazeDirection(-1, scene.robotPan, scene.robotTilt), scene.robotPan);
    drawHuman(scene.humanPan, scene.humanTilt);
    drawRobot(scene.robotPan, scene.robotTilt);
    drawCoin(time);
    requestAnimationFrame(draw);
  }

  function setPointer(event) {
    if (scene.completed) return;
    const rect = canvas.getBoundingClientRect();
    scene.pointerX = ((event.clientX - rect.left) / rect.width) * scene.width;
    scene.pointerY = ((event.clientY - rect.top) / rect.height) * scene.height;
    scene.pointerInside = true;
    scene.keyboardControl = false;
  }

  canvas.addEventListener("pointerenter", setPointer);
  canvas.addEventListener("pointermove", setPointer);
  canvas.addEventListener("pointerleave", () => {
    scene.pointerInside = false;
    scene.keyboardControl = false;
  });
  canvas.addEventListener("blur", () => {
    scene.pointerInside = false;
    scene.keyboardControl = false;
  });
  canvas.addEventListener("keydown", (event) => {
    if (scene.completed) return;
    const step = 0.07;
    if (event.key === "ArrowUp") scene.humanTargetTilt -= step;
    else if (event.key === "ArrowDown") scene.humanTargetTilt += step;
    else if (event.key === "ArrowLeft") scene.humanTargetPan -= step;
    else if (event.key === "ArrowRight") scene.humanTargetPan += step;
    else return;
    event.preventDefault();
    scene.keyboardControl = true;
    scene.humanTargetPan = clamp(scene.humanTargetPan, -limits.pan, limits.pan);
    scene.humanTargetTilt = clamp(scene.humanTargetTilt, -limits.tilt, limits.tilt);
  });

  toggle.addEventListener("click", () => {
    const showingPhoto = photo.hidden;
    photo.hidden = !showingPhoto;
    canvas.hidden = showingPhoto;
    root.querySelector(".interactive-profile__score").hidden = showingPhoto;
    hint.hidden = showingPhoto || scene.completed;
    finish.hidden = showingPhoto || !scene.completed;
    toggle.setAttribute("aria-pressed", String(showingPhoto));
    toggle.textContent = showingPhoto ? "Interactive scene" : "My profile photo";
  });

  if ("ResizeObserver" in window) new ResizeObserver(resizeCanvas).observe(canvas);
  requestAnimationFrame(draw);
})();
