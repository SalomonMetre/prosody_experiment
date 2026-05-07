let ctx;
let allTrials = [];
let testTrials = [];
let mainTrials = [];

let i = 0;
let stage = "test";
let canRespond = false;
let pid;
let trialStartTime = 0;

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

async function unlockAudio() {
  const a = audio();
  if (a.state === "suspended") await a.resume();
}

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
   START EXPERIMENT
---------------------------- */
window.start = async function () {
  await unlockAudio();

  // CRITICAL: Payload must match your Pydantic Participant model exactly
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

    if (!res.ok) {
      const errData = await res.json();
      console.error("Server Error Detail:", errData);
      throw new Error("Server rejected the request");
    }

    const data = await res.json();
    pid = data.p_id;
    allTrials = data.trials;

    // Warm up with 2 random trials; main experiment remains the full 93
    testTrials = [...allTrials].sort(() => 0.5 - Math.random()).slice(0, 2);
    mainTrials = allTrials;

    stage = "test";
    i = 0;

    show("task");
    run();
  } catch (e) {
    alert("Failed to start session. Check the console for field errors.");
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
      alert("Practice complete. Starting the real experiment.");
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

  responseBox.classList.add("hidden");
  instruction.innerHTML = "";

  fixArea.innerText = stage === "test" ? `Practice ${i + 1}` : `Trial ${i + 1}`;
  await new Promise((r) => setTimeout(r, 800));
  fixArea.innerText = "";
  await new Promise((r) => setTimeout(r, 500));

  await play(trials[i].s1);
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));
  await play(trials[i].s2);

  // Color-coded instructional layout as requested
  const card = document.createElement("div");
  card.className = "instruction-card";
  card.innerHTML = `
        <div class="txt-action">Click SAME or DIFFERENT</div>
        <div class="txt-or">OR</div>
        <div class="txt-hint">Press S (SAME) or K (DIFFERENT)</div>
    `;
  instruction.appendChild(card);

  document.getElementById("b1").innerText = "SAME";
  document.getElementById("b2").innerText = "DIFFERENT";

  responseBox.classList.remove("hidden");
  trialStartTime = performance.now();
  canRespond = true;
}

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
  setTimeout(run, 400);
};

window.addEventListener("keydown", (e) => {
  if (!canRespond) return;
  const key = e.key.toLowerCase();
  if (key === "s") choose("s");
  if (key === "k") choose("k");
});
