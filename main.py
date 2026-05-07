import os
import random
import sqlite3
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from contextlib import contextmanager

app = FastAPI()

# Use absolute paths to prevent directory confusion on the server
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "prosody_study.db")
RECORDINGS_ROOT = os.path.join(BASE_DIR, "recordings")


# -----------------------
# DATABASE UTILITIES
# -----------------------
@contextmanager
def get_db():
    """Ensures connections are always closed and tables exist."""
    conn = sqlite3.connect(DB_PATH)
    try:
        c = conn.cursor()
        # Create tables on every connection attempt if they are missing
        c.execute("""CREATE TABLE IF NOT EXISTS participants 
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      lang TEXT, otherlang TEXT, age TEXT, 
                      gender TEXT, exposure TEXT, hearing TEXT, 
                      music TEXT, flip INTEGER)""")
        c.execute("""CREATE TABLE IF NOT EXISTS results 
                     (participant_id INTEGER, pair_id INTEGER, 
                      permutation TEXT, is_correct BOOLEAN, rt_ms INTEGER)""")
        yield c
        conn.commit()
    except sqlite3.Error as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        conn.close()


# -----------------------
# MODELS
# -----------------------
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


# -----------------------
# ENDPOINTS
# -----------------------
@app.post("/get-session")
async def get_session(p: Participant):
    flip_val = random.choice([0, 1])

    with get_db() as c:
        c.execute(
            """INSERT INTO participants 
               (lang, otherlang, age, gender, exposure, hearing, music, flip) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                p.lang,
                p.otherlang,
                p.age,
                p.gender,
                p.exposure,
                p.hearing,
                p.music,
                flip_val,
            ),
        )
        p_id = c.lastrowid

    # Trial Generation Logic
    if not os.path.exists(RECORDINGS_ROOT):
        raise HTTPException(status_code=500, detail="Recordings directory missing")

    trials = []
    folders = sorted(
        [
            f
            for f in os.listdir(RECORDINGS_ROOT)
            if os.path.isdir(os.path.join(RECORDINGS_ROOT, f))
        ]
    )

    for folder in folders:
        pair_path = os.path.join(RECORDINGS_ROOT, folder)
        files = sorted([f for f in os.listdir(pair_path) if f.endswith(".wav")])

        if len(files) < 2:
            continue

        a = f"/recordings/{folder}/{files[0]}"
        b = f"/recordings/{folder}/{files[1]}"

        # Standard set of 3 trials per pair
        trials.append(
            {"id": int(folder), "perm": "AA", "s1": a, "s2": a, "ans": "SAME"}
        )
        trials.append(
            {"id": int(folder), "perm": "BB", "s1": b, "s2": b, "ans": "SAME"}
        )
        trials.append(
            {"id": int(folder), "perm": "AB", "s1": a, "s2": b, "ans": "DIFFERENT"}
        )

    random.shuffle(trials)

    return {"p_id": p_id, "trials": trials, "flip": bool(flip_val)}


@app.post("/submit")
async def submit(res: TrialResult):
    with get_db() as c:
        c.execute(
            "INSERT INTO results (participant_id, pair_id, permutation, is_correct, rt_ms) VALUES (?, ?, ?, ?, ?)",
            (
                res.participant_id,
                res.pair_id,
                res.permutation,
                res.is_correct,
                res.rt_ms,
            ),
        )
    return {"status": "recorded"}


# -----------------------
# STATIC ASSETS
# -----------------------
# Always mount these last so they don't intercept API routes
app.mount("/recordings", StaticFiles(directory=RECORDINGS_ROOT), name="recordings")
app.mount(
    "/",
    StaticFiles(directory=os.path.join(BASE_DIR, "static"), html=True),
    name="static",
)
