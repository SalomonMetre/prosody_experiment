## 1. Project Context
This study investigates the **categorical perception of Amharic phonemic contrasts** by naïve listeners (French/English speakers with zero exposure to Ethiosemitic languages)[cite: 1]. The experiment uses a **Same-Different (AX) discrimination paradigm** to test phonetic-acoustic sensitivity[cite: 1].

## 2. Tech Stack & Infrastructure
*   **Backend:** FastAPI (Python) managing session logic and data persistence.
*   **Frontend:** Vanilla HTML5, CSS3, and JavaScript (Web Audio API for low-latency playback)[cite: 1].
*   **Database:** SQLite3 for storing participant metadata and precise trial results.
*   **Audio Specs:** `.wav` files (44.1kHz, 16-bit, mono), amplitude-normalized to a common RMS level[cite: 1].

## 3. Experimental Logic & Trial Volume
### Trial Calculations
*   **Base Stimuli:** 31 unique base pairs (25 real-word target pairs + 6 phonotactically legal filler pairs)[cite: 1].
*   **Permutations:** Each pair is presented in 3 forms: **AA**, **BB** (Same), and **AB** (Different)[cite: 1].
*   **Total Main Trials:** **93 trials** (31 pairs × 3 permutations)[cite: 1].
*   **Practice Phase:** 4 initial trials with feedback (not drawn from the main set)[cite: 1].

### Trial Sequence (Strict Timing)
1.  **Fixation Cross:** 500ms display[cite: 1].
2.  **Audio A:** Play first token[cite: 1].
3.  **ISI (Inter-Stimulus Interval):** 300–500ms jittered silence[cite: 1].
4.  **Audio B:** Play second token[cite: 1].
5.  **Response Window:** Record choice and **Reaction Time (RT)** in milliseconds from the onset of the response screen[cite: 1].

## 4. Stimulus Categories (Targets)
*   **Consonant Gemination:** Singleton vs. geminate contrasts (e.g., `/gəna/` vs. `/gənːa/`)[cite: 1].
*   **Consonant Place/Manner:** Standard oppositions (e.g., `/däm/` vs. `/dän/`)[cite: 1].
*   **Vowel Quality:** (e.g., `/ʃäma/` vs. `/ʃama/`)[cite: 1].
*   **Ejective vs. Plain Plosive:** (e.g., `/tʼara/` vs. `/tara/`)[cite: 1].
*   **Fillers:** 6 pairs of non-words to prevent word-level response strategies[cite: 1].

## 5. Development Guidelines & Endpoints
*   **Pre-loading:** The frontend must pre-load all audio buffers before the main block to prevent network latency from affecting RT data[cite: 1].
*   **`GET /get-session`**: Initializes the participant and returns a randomized list of 93 trials.
*   **`POST /submit-trial`**: Saves individual trial results (is_correct, RT) to the SQLite `results` table.
*   **Randomization:** Fully randomize trial order and counterbalance the "SAME/DIFFERENT" button positions (Left/Right) between participants[cite: 1].

## 6. Participant Management
*   **Mandatory:** Users must confirm use of **closed-back headphones** before starting[cite: 1].
*   **Screening:** Collect age, gender, native language, and strictly verify **zero prior exposure** to Amharic[cite: 1].
*   **Break:** Offer a mid-task break around trial 46 or 47 to mitigate fatigue[cite: 1].