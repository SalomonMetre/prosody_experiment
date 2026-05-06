import os
import random
import sqlite3
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()
# Ensure this matches your intended filename
DB_PATH = "prosody_study.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # Explicitly define columns to avoid index errors
    c.execute('''CREATE TABLE IF NOT EXISTS participants 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  lang TEXT,
                  otherlang TEXT,
                  age TEXT,
                  gender TEXT,
                  exposure TEXT,
                  hearing TEXT,
                  music TEXT,
                  flip INTEGER)''')

    c.execute('''CREATE TABLE IF NOT EXISTS results 
                 (participant_id INTEGER,
                  pair_id INTEGER,
                  permutation TEXT,
                  is_correct BOOLEAN,
                  rt_ms INTEGER)''')
    conn.commit()
    conn.close()

init_db()

class Participant(BaseModel):
    lang: str
    otherlang: str | None = "None"
    age: str
    gender: str
    exposure: str
    hearing: str
    music: str | None = "0"

class TrialResult(BaseModel):
    participant_id: int
    pair_id: int
    permutation: str
    is_correct: bool
    rt_ms: int

@app.post("/get-session")
async def get_session(p: Participant):
    # Validation based on your research criteria
    if p.hearing.lower() in ["impaired", "difficulties"]:
        raise HTTPException(status_code=400, detail="Hearing criteria not met")
    if p.exposure.lower() in ["high", "low"]: # Zero exposure only
        raise HTTPException(status_code=400, detail="Exposure too high for naïve group")

    flip_val = random.choice([0, 1])
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    try:
        c.execute(
            "INSERT INTO participants (lang, otherlang, age, gender, exposure, hearing, music, flip) VALUES (?,?,?,?,?,?,?,?)",
            (p.lang, p.otherlang, p.age, p.gender, p.exposure, p.hearing, p.music, flip_val)
        )
        p_id = c.lastrowid
        conn.commit()
    finally:
        conn.close()

    trials = []
    recordings_root = "recordings"
    
    if not os.path.exists(recordings_root):
        raise HTTPException(status_code=500, detail="Recordings directory missing on server")

    folders = sorted([f for f in os.listdir(recordings_root) if os.path.isdir(os.path.join(recordings_root, f))])

    for folder in folders:
        pair_path = os.path.join(recordings_root, folder)
        files = sorted([f for f in os.listdir(pair_path) if f.endswith(".wav")])
        if len(files) < 2: continue

        a = f"/recordings/{folder}/{files[0]}"
        b = f"/recordings/{folder}/{files[1]}"

        # 3 permutations per pair
        trials.append({"id": int(folder), "perm": "AA", "s1": a, "s2": a, "ans": "SAME"})
        trials.append({"id": int(folder), "perm": "BB", "s1": b, "s2": b, "ans": "SAME"})
        trials.append({"id": int(folder), "perm": "AB", "s1": a, "s2": b, "ans": "DIFFERENT"})

    random.shuffle(trials)
    return {"p_id": p_id, "trials": trials, "flip": bool(flip_val)}

@app.post("/submit")
async def submit(res: TrialResult):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT INTO results VALUES (?,?,?,?,?)",
              (res.participant_id, res.pair_id, res.permutation, res.is_correct, res.rt_ms))
    conn.commit()
    conn.close()
    return {"status": "recorded"}

app.mount("/recordings", StaticFiles(directory="recordings"), name="recordings")
app.mount("/", StaticFiles(directory="static", html=True), name="static")