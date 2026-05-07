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
   AUDIO CONTEXT
---------------------------- */
function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return ctx;
}

async function unlockAudio() {
  const a = audio();
  if (a.state === "suspended") await a.resume();
}

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
  await unlockAudio();
  const hp = document.getElementById("hpplay");
  hp.classList.remove("hidden");

  const o = ctx.createOscillator();
  const g = ctx.createGain();

  o.type = "sine";
  o.frequency.value = 440;
  g.gain.value = 0.08;

  o.connect(g);
  g.connect(ctx.destination);
  o.start();

  setTimeout(() => {
    o.stop();
    hp.classList.add("hidden");
  }, 1000);
};

/* ---------------------------
   START EXPERIMENT
---------------------------- */
window.start = async function () {
  await unlockAudio();

  const payload = {
    lang: document.getElementById("lang").value,
    otherlang: document.getElementById("otherlang").value || "None",
    age: document.getElementById("age").value,
    gender: document.getElementById("gender").value,
    exposure: document.getElementById("exposure").value,
    hearing: document.getElementById("hearing").value,
  };

  try {
    const res = await fetch("/get-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Server Error");

    const data = await res.json();
    pid = data.p_id;
    allTrials = data.trials;

    // Corrected logic: 2 random trials for warm-up, but keep the full 93 for main
    testTrials = [...allTrials].sort(() => 0.5 - Math.random()).slice(0, 2);
    mainTrials = allTrials;

    stage = "test";
    i = 0;

    show("task");
    run();
  } catch (e) {
    alert("System Error: Failed to initialize session.");
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
      alert("End of practice. The real experiment starts now.");
      run();
      return;
    }
    show("view-end");
    return;
  }

  canRespond = false;
  const responseBox = document.getElementById("response");
  const instruction = document.getElementById("instruction");
  const fixArea = document.getElementById("fix");

  // 1. UI RESET
  responseBox.classList.add("hidden");
  instruction.innerHTML = ""; // Clear old card

  // 2. ORIENTATION
  fixArea.innerText = stage === "test" ? `Practice ${i + 1}` : `Trial ${i + 1}`;
  await new Promise((r) => setTimeout(r, 800));
  fixArea.innerText = "";
  await new Promise((r) => setTimeout(r, 500));

  // 3. PLAYBACK
  await play(trials[i].s1);
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));
  await play(trials[i].s2);

  // 4. RESPONSE WINDOW (Clean DOM Manipulation)
  const card = document.createElement("div");
  card.className = "response-card";
  card.innerHTML = `
      <p>Were the prosodies of the two sounds same or different?</p>
      <b>[S] SAME</b> &nbsp; or &nbsp; <b>[K] DIFFERENT</b>
  `;
  instruction.appendChild(card);

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
  const b = await ctx.decodeAudioData(await r.arrayBuffer());

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
    }).catch(console.warn);
  }

  document.getElementById("response").classList.add("hidden");
  i++;
  setTimeout(run, 500); // Slight buffer for visual comfort
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
