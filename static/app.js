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
   MODAL LOGIC
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

    testTrials = [...allTrials].sort(() => 0.5 - Math.random()).slice(0, 2);
    mainTrials = allTrials;

    stage = "test";
    i = 0;

    show("task");
    run();
  } catch (e) {
    await customAlert(
      "Connection Error",
      "Database check failed. Please ensure the backend is active.",
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
        "Warm-up finished. The real experiment starts now.",
      );
      run();
      return;
    }
    await customAlert("Finished", "The experiment is complete. Thank you!");
    show("view-end");
    return;
  }

  canRespond = false;
  const responseBox = document.getElementById("response");
  const instruction = document.getElementById("instruction");
  const fixArea = document.getElementById("fix");

  responseBox.classList.add("hidden");
  instruction.innerHTML = "";

  // 1. Orientation
  fixArea.innerText = stage === "test" ? `Practice ${i + 1}` : `Trial ${i + 1}`;
  await new Promise((r) => setTimeout(r, 800));
  fixArea.innerText = "";
  await new Promise((r) => setTimeout(r, 500));

  // 2. Audio
  await play(trials[i].s1);
  await new Promise((r) => setTimeout(r, 400));
  await play(trials[i].s2);

  // 3. Response Phase - Split Visual Mapping
  const container = document.createElement("div");
  container.className = "instruction-container";

  function createGroup(sideTitle, btnText, keyChar) {
    return `
        <div class="instr-group">
            <div class="group-title">${sideTitle}</div>
            <div class="action-row">
                <span class="label-small">Click</span>
                <div class="flat-btn-sym">${btnText}</div>
            </div>
            <div class="instr-or">OR</div>
            <div class="action-row">
                <span class="label-small">Press</span>
                <div class="vol-key-sym">${keyChar}</div>
            </div>
        </div>
    `;
  }

  container.innerHTML =
    createGroup("SAME", "SAME", "S") +
    createGroup("DIFFERENT", "DIFFERENT", "K");

  instruction.appendChild(container);

  // Buttons are populated but hidden until this point
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
