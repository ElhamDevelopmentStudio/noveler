import json
import sqlite3
from typing import Any

con = sqlite3.connect('apps/api/novelova_dev.db')
cur = con.cursor()

# -----------------------------------------------------------------------------
# 60 Representative Reference Segments across Chapters 1-4 (Prologue, Ch 2, 3, 4)
# -----------------------------------------------------------------------------
REFERENCE_SET = [
    # --- CHAPTER 2 (Prologue): Brother & Dying Protagonist Conversation ---
    {"chap_num": 2, "order": 9, "cat": "recalled_dialogue", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "[Don't worry. I'll make sure to make it quick.]", "notes": "TV/Game character (gray-eyed man) speaking in vision."},
    {"chap_num": 2, "order": 17, "cat": "ambiguous_sound", "exp_spk": "Narrator", "exp_gnd": "neutral", "ambig": True,
     "text": "\"Pftt.\"", "notes": "Snicker/scoff by watching protagonist before dying. Often tagged as sound or narrator."},
    {"chap_num": 2, "order": 20, "cat": "recalled_dialogue", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "[This is the last step, right? ...The last step before my hell is finally over?]", "notes": "TV/Game gray-eyed man."},
    {"chap_num": 2, "order": 26, "cat": "recalled_dialogue", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "[...Hah]", "notes": "TV/Game gray-eyed man sighing."},
    {"chap_num": 2, "order": 28, "cat": "recalled_dialogue", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "[I'll do it.]", "notes": "TV/Game gray-eyed man committing to kill."},
    {"chap_num": 2, "order": 35, "cat": "recalled_dialogue", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "[Ah, yes... I shouldn't drag this out.]", "notes": "TV/Game gray-eyed man drawing sword."},
    {"chap_num": 2, "order": 41, "cat": "ordinary_dialogue", "exp_spk": "Noel Rowe", "exp_gnd": "male", "ambig": False,
     "text": "\"Umm... So what do you think?\"", "notes": "Brother Noel asking dying protagonist about game."},
    {"chap_num": 2, "order": 43, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"Not bad, I guess.\"", "notes": "Protagonist answering brother."},
    {"chap_num": 2, "order": 47, "cat": "ordinary_dialogue", "exp_spk": "Noel Rowe", "exp_gnd": "male", "ambig": False,
     "text": "\"Not bad? Just that...?\"", "notes": "Brother Noel pressing protagonist."},
    {"chap_num": 2, "order": 48, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"What do you want me to say?\"", "notes": "Protagonist answering brother."},
    {"chap_num": 2, "order": 53, "cat": "ordinary_dialogue", "exp_spk": "Noel Rowe", "exp_gnd": "male", "ambig": False,
     "text": "\"I mean... You can lie.\"", "notes": "Brother Noel."},
    {"chap_num": 2, "order": 54, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"And why would I do that?\"", "notes": "Protagonist."},
    {"chap_num": 2, "order": 55, "cat": "ordinary_dialogue", "exp_spk": "Noel Rowe", "exp_gnd": "male", "ambig": False,
     "text": "\"Because it's my favorite game.\"", "notes": "Brother Noel."},
    {"chap_num": 2, "order": 56, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"Right...\"", "notes": "Protagonist."},
    {"chap_num": 2, "order": 59, "cat": "ordinary_dialogue", "exp_spk": "Noel Rowe", "exp_gnd": "male", "ambig": False,
     "text": "\"You know... I think it's best if you don't drink.\"", "notes": "Brother Noel advising brother."},
    {"chap_num": 2, "order": 60, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"I don't care.\"", "notes": "Protagonist stubborn response."},
    {"chap_num": 2, "order": 96, "cat": "titles_and_address", "exp_spk": "Noel Rowe", "exp_gnd": "male", "ambig": False,
     "text": "\"...Brother, are you really just going to drink like that?\"", "notes": "Brother Noel addressing protagonist as 'Brother'."},
    {"chap_num": 2, "order": 99, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"Let me... be.\"", "notes": "Protagonist."},
    {"chap_num": 2, "order": 117, "cat": "titles_and_address", "exp_spk": "Noel Rowe", "exp_gnd": "male", "ambig": False,
     "text": "\"Brother!\"", "notes": "Brother Noel crying out in worry."},
    {"chap_num": 2, "order": 118, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"I'm... Cough! F-fine.\"", "notes": "Protagonist coughing."},
    {"chap_num": 2, "order": 141, "cat": "ordinary_dialogue", "exp_spk": "Noel Rowe", "exp_gnd": "male", "ambig": False,
     "text": "\"That...\"", "notes": "Brother Noel pausing before explaining game lore."},
    {"chap_num": 2, "order": 143, "cat": "consecutive_turns", "exp_spk": "Noel Rowe", "exp_gnd": "male", "ambig": False,
     "text": "\"The game is called Rise of the Three Calamities, and the main character is called Leon...\"", "notes": "Brother Noel lore monologue."},
    {"chap_num": 2, "order": 151, "cat": "consecutive_turns", "exp_spk": "Noel Rowe", "exp_gnd": "male", "ambig": False,
     "text": "\"Brother, I'm going to go grab some Lunch. I'll bring you your favorite.\"", "notes": "Brother Noel leaving for lunch."},
    {"chap_num": 2, "order": 155, "cat": "ordinary_dialogue", "exp_spk": "Noel Rowe", "exp_gnd": "male", "ambig": False,
     "text": "\"I'll see you soon... okay?\"", "notes": "Brother Noel saying goodbye."},
    {"chap_num": 2, "order": 156, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"Okay.\"", "notes": "Protagonist final word to brother."},

    # --- CHAPTER 3 (Chapter 2): Vision 3+ Speaker Battle Scene ---
    {"chap_num": 3, "order": 30, "cat": "3_plus_speakers", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"It's about time... I thought they'd be slower.\"", "notes": "Host body / vision figure in ruined city."},
    {"chap_num": 3, "order": 40, "cat": "3_plus_speakers", "exp_spk": "Delilah V. Rosemberg", "exp_gnd": "female", "ambig": False,
     "text": "\"I... finally found you!\"", "notes": "Delilah V. Rosemberg (fiery red locks, golden eyes)."},
    {"chap_num": 3, "order": 51, "cat": "3_plus_speakers", "exp_spk": "Delilah V. Rosemberg", "exp_gnd": "female", "ambig": False,
     "text": "\"Is that all you have to say to me?\"", "notes": "Delilah V. Rosemberg challenging host."},
    {"chap_num": 3, "order": 56, "cat": "3_plus_speakers", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"H—\"", "notes": "Host body beginning to speak before sky shatters."},
    {"chap_num": 3, "order": 74, "cat": "3_plus_speakers", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"So... you're finally here too.\"", "notes": "Host body acknowledging second arrival (Cathrine)."},
    {"chap_num": 3, "order": 106, "cat": "3_plus_speakers", "exp_spk": "Cathrine Riley Graham", "exp_gnd": "female", "ambig": False,
     "text": "\"How long has it been since we've last been together?\"", "notes": "Cathrine Riley Graham from clouds."},
    {"chap_num": 3, "order": 113, "cat": "3_plus_speakers", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"I like those expressions.\"", "notes": "Host body sneering."},
    {"chap_num": 3, "order": 123, "cat": "3_plus_speakers", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "\"S-stop!\"", "notes": "Fleeing combatant in vision."},
    {"chap_num": 3, "order": 124, "cat": "3_plus_speakers", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "\"Fuck, stop this bastard!\"", "notes": "Combatant screaming in panic."},
    {"chap_num": 3, "order": 155, "cat": "3_plus_speakers", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"Right. I forgot about you.\"", "notes": "Host body addressing opponent."},

    # --- CHAPTER 4 (Chapter 3): Awakening & Attendant Entering Bedroom ---
    {"chap_num": 4, "order": 8, "cat": "ambiguous_sound", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": True,
     "text": "\"Ukhh!\"", "notes": "Awakening pain groan. Could be tagged paralinguistic or dialogue."},
    {"chap_num": 4, "order": 12, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"I'm... alive?\"", "notes": "Awakened protagonist realizing he is alive."},
    {"chap_num": 4, "order": 18, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"This...\"", "notes": "Protagonist staring at floating status window."},
    {"chap_num": 4, "order": 68, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"How is this possible...?\"", "notes": "Protagonist questioning reincarnation."},
    {"chap_num": 4, "order": 79, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"...No one?\"", "notes": "Protagonist checking empty room."},
    {"chap_num": 4, "order": 94, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"H... how?!\"", "notes": "Protagonist seeing phantom sword in chest."},
    {"chap_num": 4, "order": 128, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"Is... this what hell feels like?\"", "notes": "Protagonist enduring chest burning."},
    {"chap_num": 4, "order": 131, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"I-t feels like shit.\"", "notes": "Protagonist bitter remark."},
    {"chap_num": 4, "order": 149, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"...A tatoo?\"", "notes": "Protagonist inspecting glowing clover on forearm."},
    {"chap_num": 4, "order": 172, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"What...?\"", "notes": "Protagonist after time-reversal."},
    {"chap_num": 4, "order": 184, "cat": "titles_and_address", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "\"Young master.\"", "notes": "Attendant opening bedroom door, addressing Julien."},
    {"chap_num": 4, "order": 198, "cat": "ordinary_dialogue", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "\"They've called your name. It's your turn to take the test.\"", "notes": "Attendant summoning Julien."},
    {"chap_num": 4, "order": 201, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"Ah.\"", "notes": "Julien's quiet reply."},
    {"chap_num": 4, "order": 204, "cat": "titles_and_address", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "\"Young master?\"", "notes": "Attendant noticing Julien's strange behavior."},
    {"chap_num": 4, "order": 206, "cat": "consecutive_turns", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "\"Are you okay...? Your face looks a little pale.\"", "notes": "Attendant consecutive line."},
    {"chap_num": 4, "order": 212, "cat": "titles_and_address", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "\"Young master...?\"", "notes": "Attendant calling again."},
    {"chap_num": 4, "order": 214, "cat": "scene_transitions", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"Lead the way.\"", "notes": "Julien agreeing, transitioning from bedroom to corridor."},

    # --- CHAPTER 5 (Chapter 4): Corridor Monologue, Receptionist & Examination ---
    {"chap_num": 5, "order": 17, "cat": "consecutive_turns", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "\"Master has asked that you manage to pass the examination. In case of failure, he is prepared to exonerate you from the family.\"", "notes": "Attendant monologue in corridor."},
    {"chap_num": 5, "order": 20, "cat": "consecutive_turns", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "\"It's important that you pass the examination. I can't stress that enough. For my sake as well.\"", "notes": "Attendant monologue turn 2."},
    {"chap_num": 5, "order": 21, "cat": "ambiguous_sound", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": True,
     "text": "\" ... \"", "notes": "Protagonist silent turn. Ambiguous whether spoken silence or narration."},
    {"chap_num": 5, "order": 26, "cat": "consecutive_turns", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "\"That said, I don't believe a situation like that will happen. You're more than capable of passing the examination...\"", "notes": "Attendant monologue turn 3 with discourse marker 'That said'."},
    {"chap_num": 5, "order": 35, "cat": "titles_and_address", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "\"...We're here, young master.\"", "notes": "Attendant concluding corridor walk, addressing 'young master'."},
    {"chap_num": 5, "order": 39, "cat": "unnamed_characters", "exp_spk": "General Female", "exp_gnd": "female", "ambig": False,
     "text": "\"You are...?\"", "notes": "Short-haired receptionist woman with glasses."},
    {"chap_num": 5, "order": 50, "cat": "unnamed_characters", "exp_spk": "General Female", "exp_gnd": "female", "ambig": False,
     "text": "\"Ah, you must be from the Evenus Barony.\"", "notes": "Receptionist reading clipboard."},
    {"chap_num": 5, "order": 52, "cat": "titles_and_address", "exp_spk": "General Female", "exp_gnd": "female", "ambig": False,
     "text": "\"Julien Dacre Evenus. I see you.\"", "notes": "Receptionist speaking Julien's full formal title/name."},
    {"chap_num": 5, "order": 55, "cat": "unnamed_characters", "exp_spk": "General Female", "exp_gnd": "female", "ambig": False,
     "text": "\"Please follow me. I'll lead you to the examiners.\"", "notes": "Receptionist guiding Julien."},
    {"chap_num": 5, "order": 72, "cat": "unnamed_characters", "exp_spk": "General Female", "exp_gnd": "female", "ambig": False,
     "text": "\"We're here. Please don't be too nervous. They won't bite.\"", "notes": "Receptionist opening door to examiners."},
    {"chap_num": 5, "order": 83, "cat": "3_plus_speakers", "exp_spk": "Delilah V. Rosemberg", "exp_gnd": "female", "ambig": False,
     "text": "\"You must be Julien.\"", "notes": "Examiner Delilah V. Rosemberg sitting at center."},
    {"chap_num": 5, "order": 86, "cat": "3_plus_speakers", "exp_spk": "Delilah V. Rosemberg", "exp_gnd": "female", "ambig": False,
     "text": "\"You must be here for the examination. Please make your way toward the center.\"", "notes": "Delilah directing examinee."},
    {"chap_num": 5, "order": 101, "cat": "scene_transitions", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"...Huh?\"", "notes": "Julien awakening in dark vision void after pressing clover tattoo."},
    {"chap_num": 5, "order": 165, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"I can speak again?\"", "notes": "Julien speaking aloud in the void."},
    {"chap_num": 5, "order": 237, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"No, I....\"", "notes": "Julien resisting vision force."},
    {"chap_num": 5, "order": 261, "cat": "unnamed_characters", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "\"Examinee? Examinee?\"", "notes": "Male examiner calling Julien back to reality."},
    {"chap_num": 5, "order": 277, "cat": "unnamed_characters", "exp_spk": "General Male", "exp_gnd": "male", "ambig": False,
     "text": "\"Examinee? Is everything alright? We don't have all day.\"", "notes": "Male examiner pressing Julien."},
    {"chap_num": 5, "order": 295, "cat": "ordinary_dialogue", "exp_spk": "Julien D. Evenus", "exp_gnd": "male", "ambig": False,
     "text": "\"Fear.\"", "notes": "Julien casting emotive spell aloud."},
]

print(f"Total reference segments defined: {len(REFERENCE_SET)}")

# Query historical persisted database attributions (Job 4839d5c5)
cur.execute('''
    SELECT c.chapter_number, s.order_index, s.id, ch.name, ch.gender
    FROM script_segments s
    JOIN chapters c ON s.chapter_id = c.id
    LEFT JOIN characters ch ON s.character_id = ch.id
    WHERE c.project_id = 'b5e5236b-c425-4e82-a188-ed12f1012aa2'
''')
db_records = {}
for r in cur.fetchall():
    db_records[(r[0], r[1])] = {
        "segment_id": r[2],
        "speaker": r[3] or "Narrator",
        "gender": r[4] or "neutral"
    }

# Load fresh Chapter 5 run decisions
with open('apps/api/eval_raw_baseline.json') as f:
    eval_base = json.load(f)
with open('apps/api/eval_raw_optimized.json') as f:
    eval_opt = json.load(f)

base_ch5 = {d["segment_id"]: d for d in eval_base["decisions"]}
opt_ch5 = {d["segment_id"]: d for d in eval_opt["decisions"]}

# Audit each reference segment
audit_results = []
for ref in REFERENCE_SET:
    chap = ref["chap_num"]
    order = ref["order"]
    db_rec = db_records.get((chap, order), {})
    seg_id = db_rec.get("segment_id")

    # Baseline speaker: for Ch 5 use eval_raw_baseline, else db_rec
    if chap == 5 and seg_id in base_ch5:
        base_spk = base_ch5[seg_id]["speaker"]
        base_gnd = base_ch5[seg_id]["gender"]
    else:
        base_spk = db_rec.get("speaker", "Narrator")
        base_gnd = db_rec.get("gender", "neutral")

    # Optimized speaker: for Ch 5 use eval_raw_optimized, else db_rec (or clean)
    if chap == 5 and seg_id in opt_ch5:
        opt_spk = opt_ch5[seg_id]["speaker"]
        opt_gnd = opt_ch5[seg_id]["gender"]
    else:
        opt_spk = db_rec.get("speaker", "Narrator")
        opt_gnd = db_rec.get("gender", "neutral")

    audit_results.append({
        "chap_num": chap,
        "order": order,
        "category": ref["cat"],
        "text": ref["text"],
        "ambiguous": ref["ambig"],
        "expected_speaker": ref["exp_spk"],
        "expected_gender": ref["exp_gnd"],
        "baseline_speaker": base_spk,
        "baseline_gender": base_gnd,
        "opt_speaker": opt_spk,
        "opt_gender": opt_gnd,
        "notes": ref["notes"],
    })

with open("apps/api/eval_accuracy_audit.json", "w") as f:
    json.dump(audit_results, f, indent=2)

print("Saved audit results to eval_accuracy_audit.json")
