"""Exhaustive test suite for linguistic guardrails, discourse marker filtering, and character name validation."""

import pytest
from novelova_core.linguistics import (
    DISCOURSE_AND_GRAMMAR_STOPWORDS,
    DISCOURSE_IDIOMS,
    GENERIC_TITLES_OF_ADDRESS,
    is_invalid_character_name,
)


def test_discourse_and_grammar_stopwords_coverage():
    assert "that" in DISCOURSE_AND_GRAMMAR_STOPWORDS
    assert "having" in DISCOURSE_AND_GRAMMAR_STOPWORDS
    assert "so" in DISCOURSE_AND_GRAMMAR_STOPWORDS
    assert "as" in DISCOURSE_AND_GRAMMAR_STOPWORDS
    assert "he" in DISCOURSE_AND_GRAMMAR_STOPWORDS
    assert "she" in DISCOURSE_AND_GRAMMAR_STOPWORDS
    assert "someone" in DISCOURSE_AND_GRAMMAR_STOPWORDS
    assert "everyone" in DISCOURSE_AND_GRAMMAR_STOPWORDS


def test_generic_titles_of_address_coverage():
    assert "young master" in GENERIC_TITLES_OF_ADDRESS
    assert "old master" in GENERIC_TITLES_OF_ADDRESS
    assert "my lord" in GENERIC_TITLES_OF_ADDRESS
    assert "milord" in GENERIC_TITLES_OF_ADDRESS
    assert "sir" in GENERIC_TITLES_OF_ADDRESS
    assert "doctor" in GENERIC_TITLES_OF_ADDRESS
    assert "father" in GENERIC_TITLES_OF_ADDRESS


@pytest.mark.parametrize(
    "invalid_name",
    [
        # Discourse markers and pronouns (The "That" bug)
        "That",
        "that",
        "THIS",
        "These",
        "Those",
        "Having",
        "being",
        "So",
        "As",
        "Then",
        "Now",
        "Thus",
        "Still",
        "Yet",
        "Meanwhile",
        "However",
        "Therefore",
        "Suddenly",
        "Finally",
        "He",
        "She",
        "They",
        "It",
        "We",
        "You",
        "Someone",
        "Everyone",
        "Nobody",
        "Nothing",
        "Anybody",
        "Who",
        "Whom",
        "Which",
        "What",
        # Multi-word discourse idioms
        "That said",
        "that said",
        "Having said that",
        "With that said",
        "As said",
        "So said",
        "All said and done",
        "In that case",
        "At that moment",
        "To be honest",
        # Bare vocatives and titles of address (The "Young master" bug)
        "Young master",
        "young master",
        "Young Master",
        "Old master",
        "Old Master",
        "Great master",
        "Young miss",
        "Young Miss",
        "My Lord",
        "milord",
        "My Lady",
        "milady",
        "Your Grace",
        "His Grace",
        "Your Majesty",
        "His Majesty",
        "Your Highness",
        "Sir",
        "Madam",
        "Ma'am",
        "Mister",
        "Boy",
        "Girl",
        "Kid",
        "Old man",
        "Old woman",
        "Father",
        "Mother",
        "Brother",
        "Sister",
        "Uncle",
        "Doctor",
        "Doc",
        "Officer",
        "Guard",
        "Butler",
        "Servant",
        "Maid",
        "Senior brother",
        "Junior brother",
        "Senior sister",
        "Junior sister",
        "Daoist",
        "Fellow daoist",
        "Patriarch",
        "Matriarch",
        "Cultivator",
        "Villain",
        "Fool",
        # Punctuation debris, empty values, leaked dialogue fragments
        "",
        " ",
        "...",
        "---",
        "?",
        "!",
        "123",
        "a",
        "Z",
        '"What did you say?"',
        "He shouted at the top of his lungs and ran away",
    ],
)
def test_is_invalid_character_name_rejects_non_characters(invalid_name: str):
    assert is_invalid_character_name(invalid_name) is True, f"Expected '{invalid_name}' to be rejected as invalid"


@pytest.mark.parametrize(
    "valid_name",
    [
        # Western names
        "Julien D. Evenus",
        "Delilah V. Rosemberg",
        "Cathrine Riley Graham",
        "Atlas Megrail",
        "Aoife Kell Megrail",
        "Herman Chambers",
        "Noel Rowe",
        "Herbert Newberman",
        "Jason",
        "Jordana",
        "Leon",
        "Arthur Pendragon",
        "Sherlock Holmes",
        "John Watson",
        # Titles combined with proper names (must NOT be rejected)
        "Doctor Watson",
        "Dr. Watson",
        "Mr. Darcy",
        "Mrs. Hudson",
        "Lord Voldemort",
        "Lady Catherine",
        "Captain Nemo",
        "Master Wayne",
        "Section Chief Jeon",
        "Elder Jeon",
        "Senior Brother Lin",
        "General Patton",
        "Professor McGonagall",
        # Asian / Xianxia / Fantasy names
        "Jeon Myeong-hoon",
        "Lin Dong",
        "Xiao Yan",
        "Meng Hao",
        "Han Jue",
        "Sung Jin-Woo",
        "Arthur Leywin",
        "Kim Dokja",
        "Yoo Joonghyuk",
    ],
)
def test_is_invalid_character_name_accepts_valid_characters(valid_name: str):
    assert is_invalid_character_name(valid_name) is False, f"Expected '{valid_name}' to be accepted as valid"


@pytest.mark.parametrize(
    "female_name",
    [
        "Delilah V. Rosemberg",
        "Cathrine Riley Graham",
        "Catherine",
        "Aoife Kell Megrail",
        "Lady Catherine",
        "Lady Delilah",
        "Mrs. Hudson",
        "Miss Bennet",
        "Princess Diana",
        "Queen Victoria",
        "Duchess Delilah",
        "Elena",
        "Sophia",
        "Emma",
        "Alice",
        "Jordana",
        "Victoria",
        "Diana",
        "Katarina",
        "Anastasia",
    ],
)
def test_infer_name_gender_female(female_name: str):
    from novelova_core.linguistics import infer_name_gender

    assert infer_name_gender(female_name) == "female", f"Expected '{female_name}' to infer as female"


@pytest.mark.parametrize(
    "male_name",
    [
        "Julien D. Evenus",
        "Atlas Megrail",
        "Herman Chambers",
        "Herbert Newberman",
        "Noel Rowe",
        "Jason",
        "Leon",
        "Lord Voldemort",
        "Sirius Black",
        "King Arthur",
        "Prince Hamlet",
        "Father Brown",
        "Brother John",
    ],
)
def test_infer_name_gender_male(male_name: str):
    from novelova_core.linguistics import infer_name_gender

    assert infer_name_gender(male_name) == "male", f"Expected '{male_name}' to infer as male"
