# Script Engine, Dialogue Attribution & Studio Editing Specification

## 1. Executive Summary & Problem Scope

Noveler transforms unstructured novel manuscripts into dramatized, multi-voice scripts ready for audio synthesis. Prior to reaching Stage C (audio generation), the system must produce an **actor-ready, grammatically coherent, and correctly attributed script**.

Real-world manuscripts (especially serialized fiction, web novels, litRPG, and fantasy) introduce four major structural obstacles:
1. **Rapid-Fire "Ping-Pong" Dialogue Without Speech Tags**: Consecutive lines of dialogue with zero attribution tags cause cascade inversion errors in LLM sliding windows.
2. **The "Director Kim" Identity Fragmentation Problem**: Characters referred to by varying ranks, titles, surnames, and nicknames create bloated, fragmented character rosters.
3. **Delivery Ambiguity (Internal Thoughts vs. System Windows vs. Spoken Dialogue)**: Silent mental thoughts, computerized LitRPG interfaces, and spoken dialogue (including telepathy) require distinct delivery classifications.
4. **Split Dialogue Around Narrative Beats**: Quotation-narration-quotation sandwiches (*"If you move," she warned, "I will shoot."*) split into disconnected database rows, causing cadence and terminal-inflection distortion.

This document specifies the exact architecture, data models, algorithmic heuristics, and studio user experience to resolve each challenge.

---

## 2. Problem 1: Rapid-Fire "Ping-Pong" Dialogue Without Speech Tags

### 2.1 The Phenomenon & Failure Mode
Authors frequently drop speech tags to accelerate pacing in tense exchanges:

```text
"Did you find him?"
"Nothing near the south gate."
"Check the perimeter wall."
"I did. Tracks lead into the mist."
"Then he's already inside."
```

In a standard sliding-window LLM call (e.g., 25 segments):
- If the model misattributes Line 1, a **parity inversion cascade** occurs: every subsequent line is attributed to the wrong speaker.
- If the model encounters slight contextual ambiguity at Line 3, it may assign two consecutive lines to the same speaker ($A \rightarrow B \rightarrow B \rightarrow A$), collapsing conversational rhythm.

### 2.2 Solution Architecture: Two-Pass Ping-Pong Alternation Resolver

```
                    ┌───────────────────────────────┐
                    │ Raw Paragraphs in Chapter     │
                    └──────────────┬────────────────┘
                                   │
                    ┌──────────────▼────────────────┐
                    │ Pass 1: Dialogue Chain Mining │
                    │ - Identify unbroken quotes    │
                    │ - Detect anchor speech tags   │
                    └──────────────┬────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   [Chain has Anchors at Both Ends]          [Chain has Ambiguous/Single Anchor]
   - Anchor A (Line 1 = Holmes)              - Enforce strict parity [A, B, A, B...]
   - Anchor B (Line 6 = Watson)              - If odd/even mismatch at anchor,
   - Calculate step count & verify parity      trigger Anchor Back-Propagation!
              │                                         │
              └────────────────────┬────────────────────┘
                                   │
                    ┌──────────────▼────────────────┐
                    │ Pass 2: LLM Constrained Batch │
                    │ System Prompt: Turn-taking    │
                    │ parity rule enforced          │
                    └───────────────────────────────┘
```

### 2.3 Algorithmic Behavior & Rules

#### A. Dialogue Chain Grouping (Stage A Parser Pre-Processing)
- A **Dialogue Chain** is defined as $\ge 3$ consecutive dialogue segments occurring within the same scene, separated only by:
  - Paragraph line breaks, or
  - Short narrative action beats ($\le 12$ words) that contain **no other character names**.
- Each segment in a chain receives a `dialogue_chain_id` (UUID) and a `chain_index` ($0, 1, 2, \dots, n$).

#### B. Stage B LLM Prompt Turn-Taking Directive
Add strict structural constraints to `STAGE_B_SYSTEM_PROMPT`:
```text
TURN-TAKING & PING-PONG DIALOGUE RULE:
1. When evaluating a series of consecutive dialogue segments that belong to a single exchange between two active characters without explicit speech tags:
   - You MUST enforce strict alternating turn-taking (Speaker A -> Speaker B -> Speaker A -> Speaker B).
   - NEVER attribute consecutive dialogue lines to the same speaker in an unbroken back-and-forth exchange unless the narrative explicitly indicates self-interrupted speech (e.g. '"Wait," he said. "Listen."').
2. When only two primary participants are present in the active scene, treat untagged dialogue as an alternating tennis match between those two participants.
```

#### C. Anchor Back-Propagation & Parity Validator (Post-LLM)
1. Scan the LLM’s decisions for each `dialogue_chain_id`.
2. Find all **Anchor Points** (segments where a speech tag explicitly names the speaker, e.g. `"Watson asked."` or `"Holmes replied."`).
3. If Anchor 1 is at index 0 (Holmes) and Anchor 2 is at index 4 (Holmes):
   - Chain length is 5 lines (indices 0, 1, 2, 3, 4).
   - Expected sequence: `[Holmes, Watson, Holmes, Watson, Holmes]`.
   - If the LLM assigned `[Holmes, Watson, Watson, Holmes, Holmes]`, the **Parity Validator overrides** indices 2 and 3 to restore mathematical alternating continuity.
4. If an anchor appears only at the **end** of an untagged chain (e.g., Line 5: `"Watson sighed."`):
   - The validator works **backward**:
     - Index 4 = Watson
     - Index 3 = Other active character (Holmes)
     - Index 2 = Watson
     - Index 1 = Holmes
     - Index 0 = Watson

---

## 3. Problem 2: The "Director Kim" Identity Merge Problem (Aliases & Nicknames)

### 3.1 The Phenomenon & Failure Mode
In fiction, characters rarely go by a single identifier. In serialized Korean/Chinese web novels (e.g. cultivation/urban fantasy), a single character often has half a dozen designations:
- Formal Name: *Jeon Myeong-hoon*
- Corporate Title: *Section Chief Jeon*, *Director Kim*
- Martial/Sect Rank: *Elder Jeon*, *The Patriarch*, *Senior Brother*
- Third-person Nicknames: *That madman*, *The lightning demon*

If the database creates a `Character` record for every raw string matched in the text, the user is faced with 6 separate entities in Voice & Casting, leading to redundant work and audio inconsistency.

### 3.2 Solution Architecture: Canonical Entity Resolution & Studio Merge Tooling

```
  ┌─────────────────────────────────────────────────────────┐
  │                 Canonical Character Record              │
  │  ID: char-001                                           │
  │  Canonical Name: "Jeon Myeong-hoon"                     │
  │  Inferred Gender: "male"                                │
  │  Assigned Voice: "voice_male_george"                    │
  │  Aliases: ["Section Chief Jeon", "Elder Jeon", "Senior"]│
  └────────────────────────────┬────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   [Script Segment 012]                  [Script Segment 088]
   Speaker: "Jeon Myeong-hoon"           Speaker: "Jeon Myeong-hoon"
   Raw Tag: "Section Chief Jeon"         Raw Tag: "Elder Jeon"
   Character ID: "char-001"              Character ID: "char-001"
```

### 3.3 Algorithmic Behavior & Pipeline Steps

#### A. The Canonical Character Dossier in Stage B
During the sliding window execution:
1. Maintain an in-memory **Character Registry** across the novel run:
   ```json
   [
     {
       "canonical_name": "Jeon Myeong-hoon",
       "aliases": ["Section Chief Jeon", "Director Jeon", "Elder Jeon"],
       "gender": "male"
     }
   ]
   ```
2. Inject this registry into the LLM payload under `known_characters`.
3. The LLM is instructed:
   > *"If a dialogue line is spoken by an alias or title (e.g., 'Section Chief Jeon' or 'Senior Brother'), resolve it to the canonical character name ('Jeon Myeong-hoon') in the `speaker` field, and return the verbatim text tag in `raw_speaker_tag`."*

#### B. Studio UI: Interactive "Merge Character" Workflow
In the Web UI (`VoiceCastingDialog`):
1. **Merge Target Action**:
   - Each character row provides a `Merge with...` action button.
   - Clicking opens a search dropdown of existing characters in the project.
2. **Merge Execution & Cascading Updates**:
   - User merges *Section Chief Jeon* into *Jeon Myeong-hoon*.
   - The backend runs an atomic transaction:
     ```sql
     -- 1. Append source name to canonical character's aliases
     UPDATE characters
     SET aliases = jsonb_insert(aliases, '{0}', '"Section Chief Jeon"')
     WHERE id = :canonical_id;

     -- 2. Remap all script segments to canonical character ID and name
     UPDATE script_segments
     SET character_id = :canonical_id, speaker = 'Jeon Myeong-hoon'
     WHERE character_id = :source_id;

     -- 3. Recalculate dialogue count & chapter span on canonical record
     -- 4. Delete the redundant source character record
     DELETE FROM characters WHERE id = :source_id;
     ```
3. **Automatic Alias Suggestions**:
   - If Character A's name is `"Jeon Myeong-hoon"` and Character B is `"Section Chief Jeon"`, a banner appears in Voice Casting:
     *`"We detected potential aliases: Merge 'Section Chief Jeon' into 'Jeon Myeong-hoon'? [Merge] [Keep Separate]"`*

---

## 4. Problem 3: Internal Thoughts vs. System Windows vs. Spoken Dialogue

### 4.1 Categorization & Audio Policy

> [!IMPORTANT]
> **Telepathy is treated as Spoken Dialogue**:
> Any mental speech directed to another character (e.g. telepathic transmissions, divine proclamations, familiar bonds) is voiced by the **speaking character**, NOT the narrator.

The engine classifies all text into four delivery modes:

| Delivery Type (`delivery_type`) | Common Text Signatures | Attributed Speaker | Casting Treatment |
| :--- | :--- | :--- | :--- |
| **`dialogue`** | Double quotes (`"..."`, `“...”`), bracketed speech addressed to others (`[...]`, `「...」`), telepathy | Speaking Character | Assigned Character Voice |
| **`internal_thought`** | Single quotes (`'...'`, `‘...’`) without external speech tags, silent reflections | `"Narrator"` | Narrator Voice Profile |
| **`system_prompt`** | Brackets containing system keywords (`[System: ...]`, `【Alert: ...】`, `[Skill: ...]`) | `"System / Interface"` | Dedicated System Voice (synthetic / chime profile) |
| **`narration`** | Descriptive prose, exposition, action beats | `"Narrator"` | Narrator Voice Profile |

### 4.2 Algorithmic Behavior & Pipeline Steps

#### A. Stage A Pre-Parser: System Prompt Detection
Before segmenting text into arbitrary quotes, the parser runs a fast regex pre-classifier:

```python
SYSTEM_WINDOW_RE = re.compile(
    r"(?:\[|【)\s*(?:"
    r"System|Status|Notice|Alert|Skill|Quest|Warning|Notification|"
    r"Attribute|Level\s*Up|Item|Inventory|Reward"
    r")\s*[:\s\n][^\]】\n]*(?:\]|】)",
    re.IGNORECASE
)
```

- When matched, the segment is immediately tagged:
  - `delivery_type = "system_prompt"`
  - `is_dialogue = false`
  - `is_internal_thought = false`
  - `speaker = "System / Interface"`
- This prevents the LLM from attempting to guess a fictional speaker or attributing a LitRPG status window to a character.

#### B. Stage B LLM Delivery Attribution
The JSON schema returned by DeepSeek is upgraded:
```json
{
  "segment_id": "seg-123",
  "delivery_type": "dialogue",  // "dialogue" | "internal_thought" | "system_prompt" | "narration"
  "speaker": "Seo Eun-hyun",
  "raw_speaker_tag": "Seo Eun-hyun",
  "gender": "male",
  "paralinguistic_tag": "[sigh]"
}
```

#### C. System Voice Profile in Casting
In `VoiceCastingDialog`, a pinned utility row appears alongside the Narrator:
- **System / Interface**:
  - Automatically created when `delivery_type == "system_prompt"` segments exist in the project.
  - Defaults to a crisp, neutral synthesized voice profile (e.g., `voice_system_chime`).

---

## 5. Problem 4: Split Dialogue Around Narrative Beats (The Inflection Disaster)

### 5.1 The Phenomenon & Cadence Distortion
Consider the standard literary sentence:

> *"If you take another step," she warned, drawing her blade, "I will strike."*

When naively split into 3 independent database segments:
1. `Segment 1`: `"If you take another step,"`
2. `Segment 2`: `she warned, drawing her blade,`
3. `Segment 3`: `"I will strike."`

**The Audio Breakdown**:
- In Segment 1, without continuation awareness, TTS engines assume the phrase concludes, rendering a **falling sentence-final pitch**.
- Segment 3 starts with a capitalized *"I will strike."*, starting cold with a fresh sentence cadence rather than resolving the conditional clause initiated in Segment 1.

### 5.2 Solution Architecture: Segment Continuation Linking

```
Paragraph: "If you take another step," she warned, "I will strike."
               │                              │             │
               ▼                              ▼             ▼
  ┌────────────────────────┐      ┌───────────────┐     ┌────────────────────────┐
  │ Segment 1              │      │ Segment 2     │     │ Segment 3              │
  │ delivery: dialogue     │      │ delivery:     │     │ delivery: dialogue     │
  │ continuation:          │      │ narration     │     │ continuation:          │
  │   "starts_phrase"      │      │ parent_turn:  │     │   "completes_phrase"   │
  │ parent_turn: "turn-01" │      │   "turn-01"   │     │ parent_turn: "turn-01" │
  └────────────────────────┘      └───────────────┘     └────────────────────────┘
```

### 5.3 Schema & Algorithmic Behavior

#### A. Database & Schema Fields
Add to `ScriptSegmentModel`:
- `continuation_type`: `VARCHAR(30)` default `"none"`
  - `"none"`: Standard standalone segment.
  - `"starts_phrase"`: Dialogue phrase cut off by an interstitial narrative beat (ends in comma, dash `—`, or ellipsis `...`).
  - `"interstitial_beat"`: The narration segment sandwiched between continuing dialogue.
  - `"completes_phrase"`: Dialogue resuming and concluding a phrase started earlier in the same paragraph.
- `parent_turn_id`: `VARCHAR(36)` nullable (UUID grouping the related segments of a split turn).

#### B. Stage A Detection Logic
During paragraph segmentation in `parser.py`:
1. When a paragraph contains multiple quote spans:
   - Check if Quote 1 ends with non-terminal punctuation (`,`, `—`, `...`).
   - Check if the intervening text is a short dialogue tag or action beat ($\le 25$ words) without full sentence stops (`.` or `!`).
   - Check if Quote 2 begins with lowercase or immediate clause resolution.
2. If the pattern matches:
   - Generate a single `turn_id = uuid4()`.
   - Set Segment 1: `continuation_type = "starts_phrase"`, `parent_turn_id = turn_id`.
   - Set Segment 2: `continuation_type = "interstitial_beat"`, `parent_turn_id = turn_id`.
   - Set Segment 3: `continuation_type = "completes_phrase"`, `parent_turn_id = turn_id`.

#### C. Future Stage C Synthesis Handshake
When audio synthesis is executed:
- The synthesizer detects `continuation_type == "starts_phrase"`.
- It prompts the TTS model with **rising comma intonation context** (or synthesizes the full composite dialogue `[Part 1 + " " + Part 2]` as a single vocal take, inserting the interstitial narrator audio into the natural breath pause).

---

## 6. Interactive Studio Canvas: Human-in-the-Loop Editing

Even with 98% LLM accuracy, creative directors require quick, frictionless manual overrides on the reading canvas.

### 6.1 Inline Speaker & Delivery Chip
In `ChapterCanvas`:
- Each dialogue segment card renders an interactive **Speaker Pill**:
  - `[Seo Eun-hyun · [sigh] ▾]`
- **Single-Click Quick Menu**:
  - Clicking the pill opens a compact popover:
    - **Reassign Speaker**: Instant list of active characters in this chapter + search bar.
    - **Delivery Type Toggle**: Dialogue $\leftrightarrow$ System $\leftrightarrow$ Narration $\leftrightarrow$ Thought.
    - **Emotion / Paralinguistic Tag**: Select or clear `[laugh]`, `[sigh]`, `[gasp]`, etc.
  - Selection saves immediately via `PATCH /api/v1/projects/{project_id}/segments/{segment_id}` with optimistic UI update.

### 6.2 Text Editing & Segment Splitting
- **Inline Text Correction**: Double-clicking a segment allows authors to correct manuscript typos or OCR errors without re-uploading the file.
- **Split / Merge Actions**:
  - Split at cursor (splits one segment into two).
  - Merge with previous / next segment.

---

## 7. Database Migration & Schema Changes

### 7.1 SQLAlchemy Model Changes (`apps/api/app/models/`)

#### `ScriptSegmentModel` (`apps/api/app/models/chapter.py`)
```python
class ScriptSegmentModel(Base):
    __tablename__ = "script_segments"

    # Existing columns: id, chapter_id, order_index, text, is_dialogue, speaker, etc.

    # New columns
    delivery_type: Mapped[str] = mapped_column(String(30), default="narration") # dialogue, internal_thought, system_prompt, narration
    continuation_type: Mapped[str] = mapped_column(String(30), default="none")  # none, starts_phrase, interstitial_beat, completes_phrase
    parent_turn_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    dialogue_chain_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    raw_speaker_tag: Mapped[str | None] = mapped_column(String(100), nullable=True)
```

#### `CharacterModel` (`apps/api/app/models/character.py`)
```python
class CharacterModel(Base):
    __tablename__ = "characters"

    # Existing columns: id, project_id, name, slug, gender, assigned_voice_id, etc.
    # Ensure aliases is initialized and indexed
    aliases: Mapped[list[str]] = mapped_column(JSON, default=list)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
```

### 7.2 TypeScript Contract Changes (`packages/shared-types/src/index.ts`)

```typescript
export type SegmentDelivery =
  | "dialogue"
  | "internal_thought"
  | "system_prompt"
  | "narration";

export type SegmentContinuation =
  | "none"
  | "starts_phrase"
  | "interstitial_beat"
  | "completes_phrase";

export interface ScriptSegment {
  id: string;
  chapter_id: string;
  order_index: number;
  text: string;
  delivery_type: SegmentDelivery;
  continuation_type: SegmentContinuation;
  parent_turn_id?: string | null;
  dialogue_chain_id?: string | null;
  raw_speaker_tag?: string | null;
  is_dialogue: boolean;
  is_internal_thought?: boolean;
  speaker?: string | null;
  speaker_gender?: string | null;
  emotion?: string | null;
  audio_status: string;
  character_id?: string | null;
}
```

---

## 8. Implementation Roadmap & Phases

```
┌────────────────────────────────────────────────────────┐
│ Phase 1: Core Models, Stage A Parser & System Detection│
│ - Add delivery_type & continuation_type columns        │
│ - System Window regex pre-classifier                   │
│ - Paragraph split-dialogue continuation linking        │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ Phase 2: Stage B Prompt & Turn-Taking Parity Validator │
│ - Update STAGE_B_SYSTEM_PROMPT with turn-taking rules  │
│ - Canonical character registry injection               │
│ - Anchor back-propagation parity post-processor        │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ Phase 3: Character Merge & Alias Management UI         │
│ - Backend /characters/merge endpoint                   │
│ - Voice & Casting "Merge Character" interactive modal  │
│ - System / Interface dedicated casting row             │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ Phase 4: Canvas Inline Correction & Studio Controls    │
│ - Clickable speaker chip popover on Chapter Canvas     │
│ - Delivery type quick switcher                         │
│ - Optimistic segment update service                    │
└────────────────────────────────────────────────────────┘
```

This plan equips Noveler with an author-grade, resilient script engineering workflow that handles messy, real-world novel manuscripts reliably before any audio synthesis begins.
