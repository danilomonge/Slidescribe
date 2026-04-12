// ── paper planes ────────────────────────────────────────────────
function initPaperPlanes() {
  const planes = Array.from(document.querySelectorAll('.paper-plane'));
  if (!planes.length) return;

  const baseConfigs = [
    { side: 'left',  x: 0.06, y: 0.17, heading: deg(24),  speed: 136, amp1: .82, amp2: .36, freq1: .62, freq2: 1.18, scale: 1.00 },
    { side: 'left',  x: 0.10, y: 0.38, heading: deg(-30), speed: 128, amp1: .78, amp2: .34, freq1: .74, freq2: 1.26, scale: .96 },
    { side: 'right', x: 0.94, y: 0.22, heading: deg(208), speed: 142, amp1: .86, amp2: .38, freq1: .58, freq2: 1.14, scale: 1.01 },
    { side: 'right', x: 0.90, y: 0.63, heading: deg(152), speed: 132, amp1: .8,  amp2: .34, freq1: .7,  freq2: 1.22, scale: .98 },
    { side: 'left',  x: 0.07, y: 0.79, heading: deg(-10), speed: 124, amp1: .76, amp2: .32, freq1: .8,  freq2: 1.34, scale: .93 },
    { side: 'right', x: 0.84, y: 0.48, heading: deg(188), speed: 130, amp1: .74, amp2: .3,  freq1: .66, freq2: 1.16, scale: .91 },
    { side: 'left',  x: 0.14, y: 0.58, heading: deg(12),  speed: 120, amp1: .7,  amp2: .28, freq1: .86, freq2: 1.4,  scale: .89 },
    { side: 'right', x: 0.88, y: 0.82, heading: deg(168), speed: 126, amp1: .78, amp2: .33, freq1: .72, freq2: 1.28, scale: .94 },
    { side: 'left',  x: 0.18, y: 0.27, heading: deg(30),  speed: 118, amp1: .68, amp2: .26, freq1: .9,  freq2: 1.44, scale: .87 },
    { side: 'right', x: 0.82, y: 0.36, heading: deg(198), speed: 122, amp1: .72, amp2: .29, freq1: .78, freq2: 1.3,  scale: .86 },
    { side: 'left',  x: 0.12, y: 0.9,  heading: deg(-22), speed: 116, amp1: .7,  amp2: .28, freq1: .84, freq2: 1.38, scale: .9 }
  ];

  planeStates = planes.map((el, idx) => {
    const cfg = baseConfigs[idx] || baseConfigs[0];
    const box = planeCorridor();
    return {
      el,
      side: cfg.side,
      x: box.minX + (box.maxX - box.minX) * .5,
      y: window.innerHeight * cfg.y,
      heading: cfg.heading,
      speed: cfg.speed,
      amp1: cfg.amp1,
      amp2: cfg.amp2,
      freq1: cfg.freq1,
      freq2: cfg.freq2,
      phase1: idx * 1.7 + 0.8,
      phase2: idx * 2.1 + 2.2,
      scale: cfg.scale,
      turnDrift: (Math.random() * 2 - 1) * .75,
      driftTimer: 2.4 + Math.random() * 2.2
    };
  });

  planeStates.forEach(state => positionPlane(state));

  if (!planeResizeBound) {
    window.addEventListener('resize', refreshPaperPlanes, { passive: true });
    planeResizeBound = true;
  }

  if (planeAnimationFrame) cancelAnimationFrame(planeAnimationFrame);
  planeLastTick = performance.now();
  planeAnimationFrame = requestAnimationFrame(stepPaperPlanes);
}

function refreshPaperPlanes() {
  planeStates.forEach(state => {
    const box = planeCorridor();
    state.x = clamp(state.x, box.minX, box.maxX);
    state.y = clamp(state.y, 20, window.innerHeight - 20);
    positionPlane(state);
  });
}

function stepPaperPlanes(timestamp) {
  const dt = Math.min((timestamp - planeLastTick) / 1000, 0.03);
  planeLastTick = timestamp;
  for (const state of planeStates) updatePaperPlane(state, dt);
  planeAnimationFrame = requestAnimationFrame(stepPaperPlanes);
}

function updatePaperPlane(state, dt) {
  const box = planeCorridor();
  state.phase1 += state.freq1 * dt;
  state.phase2 += state.freq2 * dt;
  state.driftTimer -= dt;
  if (state.driftTimer <= 0) {
    state.turnDrift = (Math.random() * 2 - 1) * 1.2;
    state.driftTimer = 1.9 + Math.random() * 2.4;
  }

  const sinusTurn = Math.sin(state.phase1) * state.amp1 + Math.sin(state.phase2) * state.amp2 + state.turnDrift;
  let steer = 0;

  if (state.x < box.minX + 24) steer += 2.1;
  if (state.x > box.maxX - 24) steer -= 2.1;
  if (state.y < 18) steer += 1.55;
  if (state.y > window.innerHeight - 18) steer -= 1.55;

  state.heading = normalizeAngle(state.heading + (sinusTurn + steer) * dt);
  state.x += Math.cos(state.heading) * state.speed * dt;
  state.y += Math.sin(state.heading) * state.speed * dt;

  state.x = clamp(state.x, box.minX, box.maxX);
  state.y = clamp(state.y, 14, window.innerHeight - 14);
  positionPlane(state);
}

function positionPlane(state) {
  const rect = state.el.getBoundingClientRect();
  const tipOffset = Math.PI / 4;
  state.el.style.left = '0px';
  state.el.style.top = '0px';
  state.el.style.transform = `translate(${state.x - rect.width / 2}px, ${state.y - rect.height / 2}px) rotate(${state.heading + tipOffset}rad) scale(${state.scale})`;
}

function planeCorridor() {
  const vw = window.innerWidth;
  return { minX: 18, maxX: vw - 18 };
}

function deg(value) {
  return value * Math.PI / 180;
}

function normalizeAngle(value) {
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
