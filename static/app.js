let ctx;
let allTrials = [];
let testTrials = [];
let mainTrials = [];

let i = 0;
let stage = "test";
let canRespond = false;
let pid;
let trialStartTime = 0;

/* ---------------------------
   AUDIO CONTEXT & UNLOCK
---------------------------- */
function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return ctx;
}

async function unlockAudio() {
  const a = audio();
  if (a.state === "suspended") {
    await a.resume();
  }
}

/* ---------------------------
   MODAL LOGIC (Professional Overlay)
---------------------------- */
let modalResolve;

async function customAlert(title, message) {
  document.getElementById("modal-title").innerText = title;
  document.getElementById("modal-message").innerText = message;
  document.getElementById("modal-overlay").classList.remove("hidden");

  return new Promise((resolve) => {
    modalResolve = resolve;
  });
}

window.closeModal = function () {
  document.getElementById("modal-overlay").classList.add("hidden");
  if (modalResolve) modalResolve();
};

/* ---------------------------
   VIEW SWITCH
---------------------------- */
function show(id) {
  const views = ["instr", "form", "hp", "task", "view-end"];
  views.forEach((x) => {
    const el = document.getElementById(x);
    if (el) el.classList.add("hidden");
  });
  const target = document.getElementById(id);
  if (target) target.classList.remove("hidden");
}

window.goForm = () => show("form");
window.goHP = () => show("hp");

/* ---------------------------
   TEST SOUND
---------------------------- */
window.testSound = async function () {
  try {
    await unlockAudio();
    const hp = document.getElementById("hpplay");
    hp.classList.remove("hidden");

    const o = ctx.createOscillator();
    const g = ctx.createGain();

    o.type = "sine";
    o.frequency.setValueAtTime(440, ctx.currentTime);
    g.gain.setValueAtTime(0.08, ctx.currentTime);

    o.connect(g);
    g.connect(ctx.destination);

    o.start();
    o.stop(ctx.currentTime + 1);

    setTimeout(() => {
      hp.classList.add("hidden");
    }, 1000);
  } catch (e) {
    console.error("Audio test failed:", e);
  }
};

/* ---------------------------
   START EXPERIMENT
---------------------------- */
window.start = async function () {
  await unlockAudio();

  const payload = {
    lang: document.getElementById("lang").value,
    otherlang: document.getElementById("otherlang")?.value || "None",
    age: document.getElementById("age").value,
    gender: document.getElementById("gender").value,
    exposure: document.getElementById("exposure").value,
    hearing: document.getElementById("hearing").value,
    music: document.getElementById("music")?.value || "0",
  };

  try {
    const res = await fetch("/get-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Server rejected request");

    const data = await res.json();
    pid = data.p_id;
    allTrials = data.trials;

    // Warm-up logic: 2 random trials, full pool for main experiment
    testTrials = [...allTrials].sort(() => 0.5 - Math.random()).slice(0, 2);
    mainTrials = allTrials;

    stage = "test";
    i = 0;

    show("task");
    run();
  } catch (e) {
    await customAlert(
      "Connection Error",
      "The database is unreachable. Please restart the service on the server.",
    );
    console.error(e);
  }
};

/* ---------------------------
   TRIAL LOOP
---------------------------- */
async function run() {
  const trials = stage === "test" ? testTrials : mainTrials;

  if (i >= trials.length) {
    if (stage === "test") {
      stage = "main";
      i = 0;
      await customAlert(
        "Practice Complete",
        "You have finished the warm-up. The actual experiment begins now.",
      );
      run();
      return;
    }
    await customAlert("Finished", "The experiment is now complete. Thank you!");
    show("view-end");
    return;
  }

  canRespond = false;
  const responseBox = document.getElementById("response");
  const instruction = document.getElementById("instruction");
  const fixArea = document.getElementById("fix");

  // Reset UI per trial
  responseBox.classList.add("hidden");
  instruction.innerHTML = "";

  // 1. Orientation Phase
  fixArea.innerText = stage === "test" ? `Practice ${i + 1}` : `Trial ${i + 1}`;
  await new Promise((r) => setTimeout(r, 800));
  fixArea.innerText = "";
  await new Promise((r) => setTimeout(r, 500));

  // 2. Audio Phase
  await play(trials[i].s1);
  await new Promise((r) => setTimeout(r, 400));
  await play(trials[i].s2);

  // 3. Response Phase (Grouped Buttons + Key Hints)
  instruction.innerHTML = `<div style="color:#888; font-size:0.95rem; margin-bottom:15px;">Please respond:</div>`;

  // Helper to inject keyboard hints under the buttons
  const setupInputGroup = (btnId, keyChar) => {
    const btn = document.getElementById(btnId);
    const container = btn.parentElement;

    // Remove old hints to prevent stacking
    const oldHint = container.querySelector(".input-hint");
    if (oldHint) oldHint.remove();

    const hint = document.createElement("div");
    hint.className = "input-hint";
    hint.innerHTML = `<span class="or-text">OR</span> <span>press <span class="kbd-key">${keyChar}</span></span>`;
    container.appendChild(hint);
  };

  setupInputGroup("b1", "S");
  setupInputGroup("b2", "K");

  document.getElementById("b1").innerText = "SAME";
  document.getElementById("b2").innerText = "DIFFERENT";

  responseBox.classList.remove("hidden");
  trialStartTime = performance.now();
  canRespond = true;
}

/* ---------------------------
   AUDIO PLAYBACK
---------------------------- */
async function play(url) {
  await unlockAudio();
  const r = await fetch(url);
  const buf = await r.arrayBuffer();
  const b = await ctx.decodeAudioData(buf);

  return new Promise((res) => {
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.onended = res;
    s.start();
  });
}

/* ---------------------------
   RESPONSE HANDLER
---------------------------- */
window.choose = async function (k) {
  if (!canRespond) return;
  canRespond = false;

  const trials = stage === "test" ? testTrials : mainTrials;
  const trial = trials[i];
  const rt = Math.round(performance.now() - trialStartTime);

  const answer = k === "s" ? "SAME" : "DIFFERENT";
  const correct = answer === trial.ans;

  if (stage === "main") {
    fetch("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: pid,
        pair_id: trial.id,
        permutation: trial.perm,
        is_correct: correct,
        rt_ms: rt,
      }),
    }).catch((err) => console.warn("Submit failed:", err));
  }

  document.getElementById("response").classList.add("hidden");
  i++;
  setTimeout(run, 500);
};

/* ---------------------------
   KEYBOARD INPUT
---------------------------- */
window.addEventListener("keydown", (e) => {
  if (!canRespond) return;
  const key = e.key.toLowerCase();
  if (key === "s") choose("s");
  if (key === "k") choose("k");
});
