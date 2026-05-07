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
  if (a.state === "suspended") {
    await a.resume();
  }
}

/* ---------------------------
   VIEW SWITCH
---------------------------- */
function show(id) {
  ["instr", "form", "hp", "task", "view-end"].forEach((x) => {
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

    // Pick 2 random trials for warm-up from the full pool
    testTrials = [...allTrials].sort(() => 0.5 - Math.random()).slice(0, 2);

    // The main experiment uses the full 93-trial pool
    mainTrials = allTrials;

    stage = "test";
    i = 0;

    show("task");
    run();
  } catch (e) {
    alert("Failed to start session. Please ensure the server is running.");
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
      // Transition to main experiment
      alert("End of practice. The real experiment will start now.");
      run();
      return;
    }
    alert("Experiment complete. Thank you!");
    show("view-end");
    return;
  }

  canRespond = false;
  const responseBox = document.getElementById("response");
  const instruction = document.getElementById("instruction");
  const fixArea = document.getElementById("fix");

  // Hide UI and empty instructions during playback
  responseBox.classList.add("hidden");
  instruction.innerHTML = "";

  // Trial orientation
  fixArea.innerText = stage === "test" ? `Practice ${i + 1}` : `Test ${i + 1}`;
  await new Promise((r) => setTimeout(r, 800));
  fixArea.innerText = "";
  await new Promise((r) => setTimeout(r, 500));

  // Sequential Playback
  await play(trials[i].s1);
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));
  await play(trials[i].s2);

  // Show Instructions and Buttons AFTER sounds
  instruction.innerHTML = `
        <div style="
            font-size: 15px;
            line-height: 1.6;
            opacity: 0.95;
            text-align: center;
            padding: 10px;
            border: 1px solid #444;
            border-radius: 8px;
            margin-top: 10px;
        ">
            <b>Click SAME (or press [S])</b><br><br>
            <b>OR</b><br><br>
            <b>Click DIFFERENT (or press [K])</b>
        </div>
    `;

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

  // Only record results if in 'main' stage (optional)
  if (stage === "main") {
    try {
      await fetch("/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant_id: pid,
          pair_id: trial.id,
          permutation: trial.perm,
          is_correct: correct,
          rt_ms: rt,
        }),
      });
    } catch (e) {
      console.warn("Submit failed:", e);
    }
  }

  document.getElementById("response").classList.add("hidden");
  i++;
  setTimeout(run, 400);
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
