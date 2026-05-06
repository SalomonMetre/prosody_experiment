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
    audio();
    if (ctx.state === "suspended") {
        await ctx.resume();
    }
}

/* ---------------------------
   VIEW SWITCH
---------------------------- */
function show(id) {
    ["instr", "form", "hp", "task"].forEach(x => {
        document.getElementById(x).classList.add("hidden");
    });
    document.getElementById(id).classList.remove("hidden");
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
        hearing: document.getElementById("hearing").value
    };

    const res = await fetch("/get-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        alert("Server error");
        return;
    }

    const data = await res.json();

    pid = data.p_id;

    allTrials = data.trials;

    testTrials = allTrials.slice(0, 3);
    mainTrials = allTrials.slice(3);

    stage = "test";
    i = 0;

    show("task");
    run();
};

/* ---------------------------
   TRIAL LOOP
---------------------------- */
/* ---------------------------
   TRIAL LOOP (FIXED UI LOCK)
---------------------------- */
async function run() {
    const trials = stage === "test" ? testTrials : mainTrials;

    // End of stage check
    if (i >= trials.length) {
        if (stage === "test") {
            stage = "main";
            i = 0;
            // Optional: Add an "End of Practice" message/button here
            run();
            return;
        }
        alert("Experiment complete");
        show("view-end"); // Ensure you have a final view
        return;
    }

    canRespond = false;
    const responseBox = document.getElementById("response");
    const instruction = document.getElementById("instruction");
    const fixArea = document.getElementById("fix");

    // 1. PHYSICAL UI LOCK: Hide buttons and empty instructions
    responseBox.classList.add("hidden");
    instruction.innerHTML = ""; 

    // 2. TRIAL ORIENTATION: Display Trial Number (No fixation cross)
    fixArea.innerText = stage === "test" ? `Practice ${i + 1}` : `Test ${i + 1}`;
    await new Promise(r => setTimeout(r, 800));
    
    // Clear number before audio begins
    fixArea.innerText = ""; 
    await new Promise(r => setTimeout(r, 500));

    // 3. AUDIO PLAYBACK (Sequentially)
    await play(trials[i].s1);
    await new Promise(r => setTimeout(r, 300 + Math.random() * 200)); // 300-500ms Jittered ISI
    await play(trials[i].s2);

    // 4. RESPONSE WINDOW: Populate instructions and show buttons
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
            <b>Choose your response</b><br><br>
            Click a button below<br>
            or press <b>[S]</b> for <b>SAME</b> (left)<br>
            or press <b>[K]</b> for <b>DIFFERENT</b> (right)
        </div>
    `;

    document.getElementById("b1").innerText = "SAME";
    document.getElementById("b2").innerText = "DIFFERENT";

    // Show the container and start the RT clock
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

    return new Promise(res => {
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);

        canRespond = false;

        s.onended = res;
        s.start();
    });
}

/* ---------------------------
   RESPONSE HANDLER (FIXED + SUBMIT)
---------------------------- */
window.choose = async function (k) {

    if (!canRespond) return;

    canRespond = false;

    const trials = stage === "test" ? testTrials : mainTrials;
    const trial = trials[i];

    const rt = Math.round(performance.now() - trialStartTime);

    const answer = (k === "s") ? "SAME" : "DIFFERENT";
    const correct = answer === trial.ans;

    /* SEND TO BACKEND */
    try {
        await fetch("/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                participant_id: pid,
                pair_id: trial.id,
                permutation: trial.perm,
                is_correct: correct,
                rt_ms: rt
            })
        });
    } catch (e) {
        console.warn("Submit failed:", e);
    }

    document.getElementById("response").classList.add("hidden");

    i++;
    setTimeout(run, 300);
};

/* ---------------------------
   KEYBOARD INPUT
---------------------------- */
window.addEventListener("keydown", e => {

    if (!canRespond) return;

    const key = e.key.toLowerCase();

    if (key === "s") choose("s");
    if (key === "k") choose("k");
});