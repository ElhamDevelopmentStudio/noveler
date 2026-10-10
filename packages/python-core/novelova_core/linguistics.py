"""Linguistic guardrails, discourse marker filtering, and character name validation."""

import re

# Comprehensive stopword list for closed-class words, discourse markers, connectives,
# pronouns, prepositions, and adverbs that must never be treated as candidate character names.
DISCOURSE_AND_GRAMMAR_STOPWORDS: frozenset[str] = frozenset({
    # Demonstratives & Pronouns
    "that", "this", "these", "those", "it", "its", "itself",
    "he", "him", "his", "himself", "she", "her", "hers", "herself",
    "they", "them", "their", "theirs", "themselves",
    "we", "us", "our", "ours", "ourselves",
    "you", "your", "yours", "yourself", "yourselves",
    "i", "me", "my", "mine", "myself",
    "who", "whom", "whose", "which", "what", "whatever", "whoever", "whomever", "whichever",

    # Indefinite & Quantifiers
    "someone", "somebody", "something", "everyone", "everybody", "everything",
    "anyone", "anybody", "anything", "no one", "nobody", "nothing",
    "none", "all", "both", "neither", "either", "each", "every",
    "some", "any", "few", "many", "several", "much", "more", "most",
    "other", "others", "another", "one", "ones",

    # Discourse Connectives & Transitional Adverbs
    "having", "being", "so", "as", "then", "now", "thus", "still", "yet",
    "again", "instead", "meanwhile", "afterward", "afterwards", "finally",
    "suddenly", "later", "once", "never", "always", "often", "sometimes",
    "seldom", "rarely", "just", "only", "even", "already", "soon", "well",
    "indeed", "surely", "certainly", "perhaps", "maybe", "possibly", "probably",
    "actually", "honestly", "clearly", "obviously", "furthermore", "moreover",
    "nevertheless", "nonetheless", "however", "therefore", "consequently",
    "besides", "likewise", "similarly", "though", "although", "whereas",
    "while", "since", "because", "further", "hence", "forth", "anyway", "anyhow",

    # Prepositions, Locatives & Directionals
    "there", "here", "where", "wherever", "when", "whenever", "how", "why",
    "before", "after", "during", "through", "across", "along", "behind",
    "beyond", "inside", "outside", "above", "below", "under", "over",
    "between", "among", "against", "without", "within", "about", "around",
    "into", "onto", "upon", "towards", "toward", "from", "with",

    # Common English words/verbs that can appear adjacent to speech verbs in non-speech contexts
    "such", "same", "true", "false", "yes", "no", "not", "like", "unlike",
    "said", "replied", "asked", "told", "saying", "speaking",
})

# Multi-word discourse idioms that start with a capital letter in prose
DISCOURSE_IDIOMS: frozenset[str] = frozenset({
    "that said", "having said that", "having said this", "with that said",
    "with this said", "as said", "so said", "all said and done",
    "in that case", "at that moment", "at this moment", "at the same time",
    "on the contrary", "in fact", "as a matter of fact", "for example",
    "for instance", "to be honest", "frankly speaking", "generally speaking",
    "all in all", "in addition", "as well", "once upon a time",
})

# Bare vocatives, honorifics, titles of address, and generic descriptors that cannot stand alone
# as canonical character names unless attached to a proper noun (e.g. "Doctor Watson" is valid,
# but "Doctor" alone or "Young master" alone is an addressee or generic category).
GENERIC_TITLES_OF_ADDRESS: frozenset[str] = frozenset({
    # Social / Noble / Feudal / Xianxia Honorifics
    "young master", "old master", "great master", "grandmaster",
    "young miss", "old miss", "young lady", "old lady",
    "senior brother", "senior sister", "junior brother", "junior sister",
    "martial brother", "martial sister", "sect master", "clan master",
    "patriarch", "matriarch", "daoist", "fellow daoist", "cultivator",
    "senior", "junior",

    # Feudal & Royal Address
    "my lord", "milord", "my lady", "milady",
    "your grace", "his grace", "her grace",
    "your majesty", "his majesty", "her majesty",
    "your highness", "his highness", "her highness",
    "your honor", "your excellency", "sire",

    # Kinship / Family terms used alone
    "father", "mother", "dad", "mom", "brother", "sister",
    "uncle", "aunt", "grandfather", "grandmother", "grandpa", "grandma",
    "son", "daughter", "cousin", "nephew", "niece",

    # Common Roles / Occupations used as bare titles
    "doctor", "doc", "physician", "nurse", "healer",
    "officer", "guard", "guardsman", "soldier", "knight", "captain", "commander",
    "lieutenant", "general", "chief", "leader",
    "butler", "servant", "maid", "attendant", "waiter", "waitress",
    "bartender", "innkeeper", "shopkeeper", "merchant", "driver", "coachman",
    "priest", "pastor", "monk", "abbot", "pope", "bishop",
    "teacher", "professor", "master", "mistress",

    # Generic Vocatives & Age/Sex Descriptors
    "sir", "madam", "ma'am", "mister", "miss",
    "boy", "girl", "kid", "child", "lad", "lass", "babe", "baby",
    "old man", "old woman", "stranger", "traveler", "wanderer",
    "villain", "bastard", "fool", "idiot", "monster",
})

# Speech verbs for dialogue attribution in narrative context
SPEECH_VERBS = (
    r"said|replied|asked|whispered|shouted|murmured|muttered|cried|warned|"
    r"sighed|laughed|yelled|demanded|gasped|groaned|growled|snapped|breathed|"
    r"called|screamed|hissed|sneered|inquired|exclaimed|uttered"
)


def is_invalid_character_name(name: str | None) -> bool:
    """
    Determine if a candidate name is linguistically invalid as a canonical character.

    Catches discourse markers ('That', 'Having'), pronouns ('He', 'She'),
    bare vocatives/honorifics ('Young master', 'Sir', 'My Lord'),
    grammatical connectives, punctuation debris, or leaked dialogue fragments.
    """
    if not name:
        return True

    cleaned = name.strip().strip("\"'“”‘’[](){}:;,.-")
    if not cleaned or len(cleaned) <= 1:
        return True

    # Must contain at least one alphabetic character
    if not re.search(r"[a-zA-Z]", cleaned):
        return True

    # Reject strings containing clause/sentence terminators or formatting control characters
    if any(char in cleaned for char in ('!', '?', ';', ':', '\n', '\t')):
        return True

    # If period exists, verify that every period belongs to an approved abbreviation or initial
    if '.' in cleaned:
        # Strip legitimate title abbreviations and single-letter initials (e.g., "Dr.", "Mr.", "D.", "V.")
        stripped_dots = re.sub(r"\b(?:Dr|Mr|Mrs|Ms|Prof)\.", "", cleaned)
        stripped_dots = re.sub(r"\b[A-Za-z]\.", "", stripped_dots)
        if '.' in stripped_dots:
            # Remaining periods indicate sentence fragments, ellipses, or prose sentences
            return True

    # Reject overly long phrases (character names shouldn't exceed 4 words)
    words = cleaned.split()
    if len(words) > 4:
        return True

    cleaned_lower = cleaned.lower()

    # 1. Exact match on discourse/grammar stopwords or closed-class words
    if cleaned_lower in DISCOURSE_AND_GRAMMAR_STOPWORDS:
        return True

    # 2. Check multi-word discourse idioms (e.g. "that said", "having said", "as such")
    if cleaned_lower in DISCOURSE_IDIOMS:
        return True

    # 3. Check bare vocatives, generic honorifics, and social titles without a proper noun
    if cleaned_lower in GENERIC_TITLES_OF_ADDRESS:
        return True

    # 4. Check if all words in the candidate are stopwords or common speech verbs
    if all(w.lower() in DISCOURSE_AND_GRAMMAR_STOPWORDS for w in words):
        return True

    # 5. Check if candidate starts with a discourse marker followed by a speech verb (e.g., "That said")
    if len(words) == 2 and words[0].lower() in DISCOURSE_AND_GRAMMAR_STOPWORDS and words[1].lower() in {
        "said", "replied", "asked", "whispered", "shouted", "cried", "sighed", "warned",
    }:
        return True

    return False


COMMON_FEMALE_TITLES: frozenset[str] = frozenset({
    "mrs.", "ms.", "miss", "lady", "madam", "madame", "duchess",
    "princess", "queen", "empress", "baroness", "countess", "sister",
    "mother", "aunt", "grandmother", "dame", "maiden",
})

COMMON_MALE_TITLES: frozenset[str] = frozenset({
    "mr.", "lord", "sir", "duke", "prince", "king", "emperor",
    "baron", "count", "brother", "father", "uncle", "grandfather",
    "patriarch",
})

COMMON_FEMALE_FIRST_NAMES: frozenset[str] = frozenset({
    "mara", "elena", "clara", "sarah", "mary", "anna", "alice", "jane",
    "june", "emma", "lucy", "kate", "delilah", "catherine", "cathrine",
    "aoife", "elizabeth", "victoria", "charlotte", "sophia", "isabella",
    "mia", "olivia", "amelia", "harper", "evelyn", "abigail", "emily",
    "ella", "avery", "sofia", "camila", "aria", "scarlett", "grace",
    "chloe", "penelope", "layla", "riley", "zoey", "nora", "lily",
    "eleanor", "hannah", "lillian", "addison", "aubrey", "ellie",
    "stella", "natalie", "zoe", "leah", "hazel", "violet", "aurora",
    "savannah", "audrey", "brooklyn", "bella", "claire", "skylar",
    "paisley", "everly", "caroline", "nova", "emilia", "kennedy",
    "samantha", "maya", "willow", "kinsley", "naomi", "aaliyah",
    "ariana", "allison", "gabriella", "madelyn", "cora", "ruby", "eva",
    "serenity", "autumn", "adeline", "hailey", "gianna", "valentina",
    "isla", "eliana", "quinn", "ivy", "sadie", "piper", "lydia",
    "alexa", "josephine", "emery", "julia", "arianna", "vivian",
    "kaylee", "sophie", "brielle", "madeline", "diana", "katarina",
    "anastasia", "jessica", "jennifer", "amanda", "melissa", "stephanie",
    "rebecca", "laura", "sharon", "cynthia", "kathleen", "amy", "shirley",
    "angela", "helen", "brenda", "pamela", "nicole", "katherine",
    "christine", "debra", "rachel", "carolyn", "janet", "maria", "heather",
    "diane", "julie", "joyce", "joan", "kelly", "christina", "ruth",
    "judith", "megan", "andrea", "cheryl", "jacqueline", "martha",
    "gloria", "teresa", "ann", "sara", "madison", "frances", "jean",
    "kathryn", "doris", "judy", "denise", "amber", "marilyn", "beverly",
    "danielle", "theresa", "marie", "brittany", "rose", "kayla",
    "alexis", "lori", "tammy", "tiffany", "crystal", "monica", "jordana",
})


def infer_name_gender(name: str | None) -> str:
    """
    Infer fallback gender ('female' or 'male') from titles and common given names.
    Used strictly as a fallback when contextual LLM inference is absent or invalid.
    """
    if not name:
        return "male"

    cleaned = name.strip()
    c_lower = cleaned.lower()

    # Check title prefix: e.g. "Lady Catherine", "Mrs. Hudson"
    if any(c_lower.startswith(t + " ") or c_lower == t for t in COMMON_FEMALE_TITLES):
        return "female"
    if any(c_lower.startswith(t + " ") or c_lower == t for t in COMMON_MALE_TITLES):
        return "male"

    words = [re.sub(r"[^\w]", "", w) for w in c_lower.split() if re.sub(r"[^\w]", "", w)]
    if not words:
        return "male"

    # Check first given name: e.g. "Delilah V. Rosemberg" -> "delilah"
    first_word = words[0]
    if first_word in COMMON_FEMALE_FIRST_NAMES:
        return "female"

    return "male"
