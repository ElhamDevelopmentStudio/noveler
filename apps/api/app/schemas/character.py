from pydantic import BaseModel, ConfigDict


class CharacterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    slug: str
    gender: str
    role_description: str | None = None
    dialogue_count: int = 0
    word_count: int = 0
    chapters_span: str | None = None
    assigned_voice_id: str | None = None
    assigned_voice_name: str | None = None


class CharacterVoiceAssignment(BaseModel):
    character_id: str
    assigned_voice_id: str
    assigned_voice_name: str


class BatchCastAssignRequest(BaseModel):
    assignments: list[CharacterVoiceAssignment]
