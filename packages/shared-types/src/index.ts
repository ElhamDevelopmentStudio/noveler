export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export interface HealthResponse {
  status: "ok" | "degraded" | "error";
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface PaginationMeta {
  page: number;
  pageSize?: number;
  page_size?: number;
  totalItems?: number;
  total_items?: number;
  totalPages?: number;
  total_pages?: number;
}


export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface User {
  id: string;
  name: string;
  email: string;
  handle: string;
  role: string;
  social: string | null;
  avatar_attachment_id?: string | null;
  avatar_url?: string | null;
  preferred_tts_model?: string;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface UpdateProfileDto {
  name?: string;
  email?: string;
  handle?: string;
  social?: string | null;
  current_password?: string;
  password?: string;
  avatar_attachment_id?: string | null;
  preferred_tts_model?: string;
}

export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  claimed_at: string | null;
  url: string;
  created_at: string;
}

export interface ForgotPasswordResponse {
  message: string;
  reset_token?: string | null;
}

export type ProjectStatus = "in_production" | "review" | "ready_to_parse" | "complete";

export interface Project {
  id: string;
  title: string;
  author: string | null;
  owner: string | null;
  source: string | null;
  status: ProjectStatus;
  status_label: string;
  language: string | null;
  genre: string | null;
  publication_date: string | null;
  created_date: string | null;
  isbn: string | null;
  thumbnail_attachment_id: string | null;
  thumbnail_url: string | null;
  manuscript_attachment_id: string | null;
  manuscript_filename: string | null;
  manuscript_size: number | null;
  manuscript_url: string | null;
  settings?: ProjectSettings;
  created_at: string;
  updated_at: string;
}

export interface ProjectSettings {
  paralinguistic_tags_enabled?: boolean;
  active_paralinguistic_tags?: Record<string, boolean>;
}

export interface ProjectCounts {
  all: number;
  in_production: number;
  needs_review: number;
  complete: number;
  ready_to_parse: number;
}

export interface PaginatedProjects {
  items: Project[];
  counts: ProjectCounts;
  meta: PaginationMeta;
}

export interface CreateProjectDto {
  title: string;
  author?: string | null;
  owner?: string | null;
  source?: string | null;
  status?: ProjectStatus;
  language?: string | null;
  genre?: string | null;
  publication_date?: string | null;
  created_date?: string | null;
  isbn?: string | null;
  manuscript_attachment_id?: string | null;
  thumbnail_attachment_id?: string | null;
}

export interface UpdateProjectDto {
  title?: string;
  author?: string | null;
  owner?: string | null;
  source?: string | null;
  status?: ProjectStatus;
  language?: string | null;
  genre?: string | null;
  publication_date?: string | null;
  created_date?: string | null;
  isbn?: string | null;
  manuscript_attachment_id?: string | null;
  thumbnail_attachment_id?: string | null;
}

export interface ParseOptionsDto {
  remove_whitespace?: boolean;
  normalize_paragraphs?: boolean;
  separate_sentence_wise?: boolean;
  detect_chapter_headings?: boolean;
  preserve_italics?: boolean;
  fix_punctuation_spacing?: boolean;
  speak_unambiguous_numbers?: boolean;
  preserve_existing_tags?: boolean;
}

export interface FormatOptionsDto {
  remove_whitespace?: boolean;
  normalize_paragraphs?: boolean;
  fix_punctuation_spacing?: boolean;
  speak_unambiguous_numbers?: boolean;
  normalize_dialogue_quotes?: boolean;
  chapter_id?: string | null;
}

export interface FormatResponseData {
  project_id: string;
  formatted_segments_count: number;
  affected_chapters_count: number;
  message: string;
}

export interface TaggingJobOptionsDto {
  chapter_ids?: string[];
  start_chapter?: number;
  end_chapter?: number;
  resume?: boolean;
  force?: boolean;
  allow_offline_heuristic?: boolean;
}

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

export interface FoleyCue {
  id: string;
  sfx_id: string;
  sfx_name: string;
  audio_url: string;
  target_text: string;
  action: "replace" | "after";
  start_index?: number;
  end_index?: number;
  volume?: number;
}

export interface ScriptSegment {
  id: string;
  chapter_id: string;
  order_index: number;
  text: string;
  delivery_type?: SegmentDelivery;
  continuation_type?: SegmentContinuation;
  parent_turn_id?: string | null;
  dialogue_chain_id?: string | null;
  raw_speaker_tag?: string | null;
  is_dialogue: boolean;
  is_internal_thought?: boolean;
  speaker?: string | null;
  speaker_gender?: string | null;
  emotion?: string | null;
  audio_status: string;
  audio_url?: string | null;
  duration_ms?: number | null;
  character_id?: string | null;
  sfx_cues?: FoleyCue[] | null;
  atmosphere_id?: string | null;
  atmosphere_name?: string | null;
  atmosphere_volume?: number | null;
  voice_filter_id?: string | null;
}

export interface SegmentAlignment {
  segment_id: string;
  order_index: number;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  storage_key?: string | null;
  audio_url?: string | null;
}

export interface ChapterAudioStream {
  chapter_id: string;
  chapter_title: string;
  audio_url?: string | null;
  total_duration_seconds: number;
  is_synthesized: boolean;
  audio_job_status?: "none" | "queued" | "generating" | "complete" | "failed";
  audio_job_error?: string | null;
  audio_account_used?: string | null;
  audio_job_id?: string | null;
  alignments: SegmentAlignment[];
}

export interface ChapterGenerateAudioDto {
  kaggle_account_id?: string | null;
  allow_dev_offline?: boolean;
}

export interface ChapterGenerateAudioResponse {
  chapter_id: string;
  status: string;
  kaggle_account_used?: string | null;
  audio_url?: string | null;
  estimated_duration_seconds: number;
  message: string;
}

export interface BatchAudioLane {
  lane_index: number;
  account_username: string;
  account_id: string;
  job_id: string;
  total_chapters: number;
  completed_chapters: number;
  current_chapter_id?: string | null;
  current_chapter_title?: string | null;
  current_chapter_number?: number | null;
  status: "queued" | "running" | "complete" | "failed";
  chapter_ids: string[];
}

export interface BatchAudioStatusResponse {
  is_active: boolean;
  total_chapters: number;
  completed_chapters: number;
  progress_percent: number;
  lanes: BatchAudioLane[];
}

export interface GenerateBatchAudioDto {
  chapter_ids?: string[];
  allow_dev_offline?: boolean;
  preferred_tts_model?: string;
}

export interface GenerateBatchAudioResponse {
  project_id: string;
  total_chapters: number;
  lanes: BatchAudioLane[];
  message: string;
}

export interface CancelBatchAudioResponse {
  success: boolean;
  cancelled_jobs_count: number;
  cancelled_chapters_count: number;
  message: string;
}

export interface SegmentRegenerateAudioDto {
  speed?: number;
  stability?: number;
  similarity?: number;
  character_voice_id?: string | null;
}

export interface SegmentRegenerateAudioResponse {
  segment: ScriptSegment;
  chapter_id: string;
  take_number: number;
  duration_ms: number;
  audio_url: string;
  message: string;
}

export interface ScriptSegmentUpdateDto {
  text?: string | null;
  speaker?: string | null;
  speaker_gender?: string | null;
  delivery_type?: SegmentDelivery | null;
  emotion?: string | null;
  is_dialogue?: boolean | null;
  is_internal_thought?: boolean | null;
  character_id?: string | null;
  raw_speaker_tag?: string | null;
  sfx_cues?: FoleyCue[] | null;
  atmosphere_id?: string | null;
  atmosphere_name?: string | null;
  atmosphere_volume?: number | null;
  voice_filter_id?: string | null;
}

export interface BatchAtmosphereDto {
  segment_ids: string[];
  atmosphere_id?: string | null;
  atmosphere_name?: string | null;
  atmosphere_volume?: number | null;
}

export interface ScriptSegmentSplitDto {
  split_index: number;
}

export interface ScriptSegmentMergeDto {
  direction?: "next" | "previous";
}

export interface Chapter {
  id: string;
  project_id: string;
  chapter_number: number;
  batch_number?: number;
  title: string;
  order_index: number;
  word_count: number;
  estimated_duration_seconds: number;
  status: string;
  audio_url?: string | null;
  alignment_json?: string | null;
  audio_job_status?: "none" | "queued" | "generating" | "complete" | "failed";
  audio_job_error?: string | null;
  audio_account_used?: string | null;
  audio_job_id?: string | null;
  created_at: string;
  updated_at: string;
  segments?: ScriptSegment[];
}

export interface ChapterCreateDto {
  title?: string;
}

export interface ChapterUpdateDto {
  title?: string;
}

export interface ChapterReorderDto {
  chapter_ids: string[];
}

export interface ChapterTextSaveDto {
  text: string;
}

export interface UrlImportDto {
  url: string;
}

export interface UrlImportResponseDto {
  url: string;
  title?: string | null;
  text: string;
}

export interface ParseResponseData {
  project_id: string;
  status: string;
  total_chapters: number;
  total_batches?: number;
  total_words: number;
  chapters: Chapter[];
}

export interface Character {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  gender: string;
  role_description?: string | null;
  dialogue_count: number;
  word_count: number;
  chapters_span?: string | null;
  assigned_voice_id?: string | null;
  assigned_voice_name?: string | null;
  is_general?: boolean;
  is_system?: boolean;
  voice_filter_id?: string | null;
  aliases?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface UpdateCharacterDto {
  name?: string;
  gender?: string;
  role_description?: string | null;
  assigned_voice_id?: string | null;
  assigned_voice_name?: string | null;
  voice_filter_id?: string | null;
}

export interface CharacterVoiceAssignmentDto {
  character_id: string;
  assigned_voice_id: string;
  assigned_voice_name: string;
}

export interface CharacterMergeDto {
  source_character_id: string;
  target_character_id: string;
}

export interface CharacterMergeAffectedChapter {
  id: string;
  chapter_number: number;
  title: string;
  segment_count: number;
}

export interface CharacterMergeSampleSegment {
  id: string;
  chapter_id: string;
  chapter_number: number;
  chapter_title: string;
  text: string;
  delivery_type: string;
}

export interface CharacterMergePreviewResponse {
  source_character: Character;
  target_character?: Character | null;
  affected_segments_count: number;
  affected_words_count: number;
  affected_chapters: CharacterMergeAffectedChapter[];
  sample_segments: CharacterMergeSampleSegment[];
  warnings: string[];
}

export interface CharacterAliasSuggestion {
  source_character_id: string;
  source_name: string;
  target_character_id: string;
  target_name: string;
  reason: string;
  confidence: number;
}

export interface PronunciationOccurrence {
  chapter_id?: string;
  chapter_number: number;
  chapter_title: string;
  segment_id: string;
  current_text: string;
  after_replacement?: string;
  preview_text?: string;
  is_included?: boolean;
  included?: boolean;
}

export interface PronunciationSearchResponseData {
  word?: string;
  phrase?: string;
  replacement: string;
  total_occurrences?: number;
  total_found?: number;
  occurrences: PronunciationOccurrence[];
}

export interface PronunciationRule {
  id: string;
  project_id: string;
  phrase: string;
  replacement: string;
  match_case: boolean;
  scope: string;
  occurrences_count: number;
  excluded_segment_ids?: string[];
  is_active?: boolean;
  created_at: string;
  updated_at?: string;
}

export type TaggingJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface TaggingJobLlmReport {
  model: string;
  completed_at: string;
  duration_seconds: number;
  total_api_calls: number;
  tokens: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cache_hit_tokens: number;
    cache_miss_tokens: number;
  };
  cost: {
    estimated_cost_usd: number;
    currency: string;
    pricing_model: string;
  };
  account: {
    balance_remaining?: string | null;
    currency: string;
  };
  breakdown: {
    total_segments: number;
    dialogue_segments: number;
    narration_segments: number;
    characters_synced: Array<{
      name: string;
      gender: string;
      lines: number;
    }>;
  };
}

export interface TaggingJobScope {
  type: "full" | "single" | "range" | "custom";
  label: string;
  chapter_number?: number;
  chapter_title?: string;
  chapter_id?: string;
  start_chapter?: number;
  end_chapter?: number;
  chapter_count?: number;
}

export interface TaggingJob {
  id: string;
  project_id: string;
  status: TaggingJobStatus;
  total_chapters: number;
  processed_chapters: number;
  total_segments: number;
  processed_segments: number;
  progress_percent: number;
  current_chapter_title?: string | null;
  current_step?: string | null;
  eta_seconds?: number | null;
  error_type?: string | null;
  error_message?: string | null;
  llm_report?: TaggingJobLlmReport | null;
  target_scope?: TaggingJobScope | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}
export interface RawContentResponse {
  project_id: string;
  offset: number;
  limit: number;
  chunk_size: number;
  total_characters: number;
  has_more: boolean;
  next_offset: number | null;
  content: string;
}

export interface TelegramSettings {
  enabled: boolean;
  bot_token_masked: string | null;
  chat_id: string | null;
  has_token: boolean;
}

export interface UpdateTelegramSettingsDto {
  enabled: boolean;
  bot_token?: string | null;
  chat_id?: string | null;
}

export interface TelegramTestRequestDto {
  bot_token?: string | null;
  chat_id?: string | null;
}

export interface TelegramTestResponse {
  success: boolean;
  message: string;
  bot_username?: string | null;
  bot_name?: string | null;
}

export interface TelegramSendChapterRequestDto {
  force_preview?: boolean;
}

export interface TelegramSendChapterResponse {
  success: boolean;
  message: string;
  chapter_id: string;
  chapter_number: number;
  chat_id: string;
  title: string;
  filename: string;
  is_preview: boolean;
}

export interface KaggleAccount {
  id: string;
  username: string;
  key_masked: string;
  priority: number;
  is_active: boolean;
  status: "available" | "in_use" | "exhausted" | "cooldown" | "failed";
  dataset_status?: "uninitialized" | "ready" | "initializing" | "failed";
  dataset_ref?: string | null;
  last_used_at?: string | null;
  exhausted_at?: string | null;
  estimated_reset_at?: string | null;
  total_hours_used: number;
  created_at: string;
  updated_at: string;
}

export interface KaggleDatasetStatusResponse {
  account_id: string;
  username: string;
  dataset_status: "uninitialized" | "ready" | "initializing" | "failed";
  dataset_ref?: string | null;
  message: string;
}

export interface CreateKaggleAccountDto {
  username: string;
  key: string;
  priority?: number;
  is_active?: boolean;
  verify_first?: boolean;
}

export interface UpdateKaggleAccountDto {
  username?: string;
  key?: string;
  priority?: number;
  is_active?: boolean;
  verify_first?: boolean;
}

export interface KaggleAccountTestResponse {
  success: boolean;
  username: string;
  message: string;
}

export interface KagglePoolSummary {
  total_accounts: number;
  active_accounts: number;
  available_accounts: number;
  in_use_accounts: number;
  exhausted_accounts: number;
  total_gpu_hours_available: number;
}

export interface Voice {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  gender: "male" | "female" | "neutral";
  is_global: boolean;
  audio_url: string;
  audio_storage_key: string;
  avatar_url?: string | null;
  avatar_storage_key?: string | null;
  reference_text?: string | null;
  duration_seconds?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateVoiceDto {
  name: string;
  gender?: "male" | "female" | "neutral";
  is_global?: boolean;
  project_id?: string | null;
  reference_text?: string | null;
}

export interface UpdateVoiceDto {
  name?: string;
  gender?: "male" | "female" | "neutral";
  is_global?: boolean;
  reference_text?: string | null;
}

export type SFXCategory = "foley" | "atmosphere";

export interface SFXItem {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  category: SFXCategory;
  is_global: boolean;
  audio_url: string;
  audio_storage_key: string;
  duration_seconds?: number | null;
  default_volume: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSFXDto {
  name: string;
  category?: SFXCategory;
  is_global?: boolean;
  project_id?: string | null;
  default_volume?: number;
}

export interface UpdateSFXDto {
  name?: string;
  category?: SFXCategory;
  is_global?: boolean;
  default_volume?: number;
}

export interface VoiceFilterPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  samplePrompt: string;
  dspSpec?: string;
}




