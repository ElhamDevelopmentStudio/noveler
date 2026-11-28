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
  preferences?: Record<string, unknown>;
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

export interface EmotionProfile {
  label: string;
  /** 8-dim vector: [happy, angry, sad, afraid, disgusted, melancholic, surprised, calm] */
  vector: number[];
  emo_alpha: number;
  duration_factor: number;
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
  emotion_profile?: EmotionProfile | null;
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

export interface ChapterPreflightAudioDto {
  preferred_tts_model?: string | null;
  kaggle_account_id?: string | null;
}

export interface ChapterPreflightAudioResponse {
  model_id: string;
  model_name: string;
  dataset_slug: string;
  size_mb: number;
  is_cached: boolean;
  requires_decision: boolean;
  kaggle_account_id?: string | null;
  kaggle_account_username?: string | null;
  message: string;
}

export interface ChapterGenerateAudioDto {
  kaggle_account_id?: string | null;
  allow_dev_offline?: boolean;
  preferred_tts_model?: string | null;
  cache_to_dataset?: boolean;
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
  progress?: number;
  lanes: BatchAudioLane[];
}

export interface GenerateBatchAudioDto {
  chapter_ids?: string[];
  allow_dev_offline?: boolean;
  preferred_tts_model?: string;
  cache_to_dataset?: boolean;
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
  emotion_profile?: EmotionProfile | null;
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

export interface CharacterDossier {
  age_group?: string;
  personality_traits?: string[];
  vocal_traits?: {
    pitch?: string;
    timbre?: string;
    cadence?: string;
    accent_or_style?: string;
  };
  relationships?: Array<{ character: string; relation: string }>;
  summary?: string;
  voice_design_prompt?: string;
  sample_lines?: string[];
  chapters_sampled?: number[];
  updated_at?: string;
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
  dossier?: CharacterDossier | null;
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
  progress?: number;
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

export interface TelegramSendBatchRequestDto {
  mode?: "all_synthesized" | "selected" | "range";
  chapter_ids?: string[];
  range_start?: number;
  range_end?: number;
  force_preview?: boolean;
}

export interface TelegramSendBatchResponse {
  project_id: string;
  total_chapters: number;
  status: string;
  message: string;
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
  description?: string | null;
  duration_seconds?: number | null;
  is_default?: boolean;
  default_for_gender?: "male" | "female" | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceListResponse {
  voices: Voice[];
  total: number;
  default_male_voice_id?: string | null;
  default_female_voice_id?: string | null;
}

export interface MakeDefaultVoiceResponse {
  voice_id: string;
  voice_name: string;
  gender: string;
  is_default: boolean;
  affected_characters_count: number;
  message: string;
}

export interface VoiceDesignCharacterInput {
  character_id: string;
  voice_design_prompt?: string | null;
  sample_lines?: string[] | null;
  voice_name?: string | null;
}

export interface VoiceDesignRequest {
  project_id: string;
  character_ids?: string[] | null;
  items?: VoiceDesignCharacterInput[] | null;
  auto_assign?: boolean;
  is_global?: boolean;
  cache_to_dataset?: boolean;
  kaggle_account_id?: string | null;
  auto_build_missing_dossiers?: boolean;
}

export interface VoiceDesignCharacterResult {
  character_id: string;
  character_name: string;
  status: "pending" | "completed" | "failed";
  voice_id?: string | null;
  voice_name?: string | null;
  audio_url?: string | null;
  voice_design_prompt?: string | null;
  auto_assigned?: boolean;
  error?: string | null;
}

export interface VoiceDesignJob {
  id: string;
  project_id: string;
  user_id: string;
  kaggle_account_id?: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  auto_assign: boolean;
  is_global: boolean;
  cache_to_dataset: boolean;
  total_characters: number;
  completed_characters: number;
  progress_percentage: number;
  current_step?: string | null;
  error_message?: string | null;
  target_character_ids: string[];
  results: VoiceDesignCharacterResult[];
  created_at: string;
  updated_at: string;
}

export interface BuildDossiersResponse {
  project_id: string;
  generated_count: number;
  skipped_count: number;
  failed_count: number;
  usage: Record<string, number>;
  items: Array<{
    character_id: string;
    character_name: string;
    status: string;
    dossier?: CharacterDossier | null;
    error?: string | null;
  }>;
}

export interface ChapterPackagingMetadata {
  episode_title: string;
  short_recap: string;
  youtube_description: string;
  content_warnings: string[];
  mood_tags: string[];
  style?: string;
  generated_at?: string;
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
  triggers: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateSFXDto {
  name: string;
  category?: SFXCategory;
  is_global?: boolean;
  project_id?: string | null;
  default_volume?: number;
  triggers?: string[];
}

export interface UpdateSFXDto {
  name?: string;
  category?: SFXCategory;
  is_global?: boolean;
  default_volume?: number;
  triggers?: string[];
}

export interface FoleyOccurrence {
  segment_id: string;
  chapter_id: string;
  chapter_number: number;
  chapter_title: string;
  order_index: number;
  speaker?: string | null;
  delivery_type?: SegmentDelivery;
  matched_text: string;
  segment_text: string;
  already_has_foley: boolean;
  current_action?: "replace" | "alongside" | null;
}

export interface ScanFoleyOccurrencesDto {
  triggers?: string[];
  chapter_ids?: string[];
}

export interface ScanFoleyOccurrencesResponse {
  sfx_id: string;
  triggers: string[];
  total_matches: number;
  occurrences: FoleyOccurrence[];
}

export interface ApplyFoleyTargetDto {
  segment_id: string;
  target_text: string;
}

export interface ApplyFoleyDto {
  triggers?: string[];
  action: "replace" | "alongside";
  targets?: ApplyFoleyTargetDto[];
  volume?: number;
}

export interface ApplyFoleyResponse {
  applied_count: number;
  message: string;
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





export interface ChapterCursorPage {
  items: Chapter[];
  next_cursor: number | null;
  prev_cursor: number | null;
  has_more: boolean;
  total_chapters: number;
  total_words: number;
}

export interface ParseJob {
  id: string;
  project_id: string;
  job_type: 'parse' | 'format';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  total_chapters: number;
  processed_chapters: number;
  total_segments: number;
  processed_segments: number;
  progress_percent: number;
  progress?: number;
  current_step?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackageChapterItem {
  id: string;
  chapter_number: number;
  title: string;
  is_synthesized: boolean;
  duration_seconds: number;
  word_count: number;
  filename: string;
}

export interface PackagePreviewResponse {
  project_id: string;
  project_title: string;
  safe_project_title: string;
  author: string;
  genre: string;
  has_cover_art: boolean;
  cover_art_url: string | null;
  total_chapters_count: number;
  synthesized_chapters_count: number;
  archive_filename: string;
  target_download_path: string;
  example_filename: string;
  format: string;
  chapters: PackageChapterItem[];
}

export interface PackageChaptersRequest {
  mode: "all_synthesized" | "selected" | "range";
  chapter_ids?: string[];
  range_start?: number;
  range_end?: number;
}

export interface ProjectArchivePreviewResponse {
  title: string;
  author: string | null;
  genre: string | null;
  language: string | null;
  status: string;
  total_chapters: number;
  tagged_chapters_count: number;
  untagged_chapters_count: number;
  total_segments: number;
  total_words: number;
  total_characters: number;
  has_cover: boolean;
  has_manuscript: boolean;
  exported_at: string | null;
  schema_version: string;
  total_voices?: number;
  total_sfx?: number;
  total_foley_cues?: number;
}

export interface TaggedProjectSummary {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  total_chapters: number;
  tagged_chapters_count: number;
  tagged_segments_count: number;
  dialogue_segments_count: number;
  total_words: number;
  updated_at: string | null;
}

export interface ExportTaggedDatasetPayload {
  project_ids?: string[];
  format?: "json" | "txt";
}

export interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  expires_at: string | null;
  rate_limit_rpm: number | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export interface ApiTokenCreated extends ApiToken {
  token: string;
}

export interface ApiTokenCreateRequest {
  name: string;
  expires_in_days?: number | null;
  rate_limit_rpm?: number | null;
}

export interface ApiTokenListResponse {
  tokens: ApiToken[];
  total: number;
}

export interface HfTokenStatus {
  has_token: boolean;
  token_masked: string | null;
}

export type FoleyCueAction = "replace" | "alongside" | "after";

export interface SfxDesignItemInput {
  asset_key?: string | null;
  name: string;
  prompt: string;
  category: SFXCategory;
  duration_seconds: number;
  default_volume?: number;
  triggers?: string[];
  is_global?: boolean | null;
  replace_sfx_id?: string | null;
}

export interface PendingFoleyCueInput {
  segment_id: string;
  sfx_id?: string | null;
  asset_key?: string | null;
  sfx_name?: string;
  target_text: string;
  action: FoleyCueAction;
  volume: number;
}

export interface PendingAtmosphereSpanInput {
  start_segment_id: string;
  end_segment_id: string;
  segment_ids?: string[];
  sfx_id?: string | null;
  asset_key?: string | null;
  sfx_name?: string;
  volume: number;
}

export interface SfxDesignRequest {
  project_id: string;
  items: SfxDesignItemInput[];
  pending_cues?: PendingFoleyCueInput[];
  pending_atmosphere_spans?: PendingAtmosphereSpanInput[];
  auto_apply_cues?: boolean;
  is_global?: boolean;
  cache_to_dataset?: boolean;
  kaggle_account_id?: string | null;
}

export interface SfxDesignItemResult {
  asset_key: string;
  name: string;
  category: SFXCategory;
  prompt: string;
  duration_seconds?: number | null;
  status: "pending" | "completed" | "failed";
  sfx_id?: string | null;
  audio_url?: string | null;
  applied_cues_count?: number;
  error?: string | null;
}

export interface SfxDesignJob {
  id: string;
  project_id: string;
  user_id: string;
  kaggle_account_id?: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  auto_apply_cues: boolean;
  is_global: boolean;
  cache_to_dataset: boolean;
  total_items: number;
  completed_items: number;
  progress_percentage: number;
  current_step?: string | null;
  error_message?: string | null;
  results: SfxDesignItemResult[];
  created_at: string;
  updated_at: string;
}

export interface AutoSfxProposedAsset {
  asset_key: string;
  name: string;
  category: SFXCategory;
  prompt: string;
  duration_seconds: number;
  triggers: string[];
  default_volume: number;
  usage_count: number;
}

export interface AutoSfxMatchedAsset {
  sfx_id: string;
  name: string;
  category: SFXCategory;
  audio_url: string;
  default_volume: number;
  usage_count: number;
}

export interface AutoSfxFoleyCue {
  segment_id: string;
  order_index: number;
  speaker?: string | null;
  segment_text: string;
  sfx_id?: string | null;
  asset_key?: string | null;
  sfx_name: string;
  is_new_asset: boolean;
  target_text: string;
  action: FoleyCueAction;
  volume: number;
  reason?: string;
}

export interface AutoSfxAtmosphereSpan {
  start_segment_id: string;
  end_segment_id: string;
  start_order_index: number;
  end_order_index: number;
  segment_ids: string[];
  segment_count: number;
  sfx_id?: string | null;
  asset_key?: string | null;
  sfx_name: string;
  is_new_asset: boolean;
  volume: number;
  reason?: string;
}

export interface AutoSfxChapterPlan {
  chapter_id: string;
  chapter_number: number;
  chapter_title: string;
  foley_cues: AutoSfxFoleyCue[];
  atmosphere_spans: AutoSfxAtmosphereSpan[];
}

export interface AutoSfxCueResponse {
  project_id: string;
  dry_run: boolean;
  chapters_processed: number;
  applied_foley_count: number;
  applied_atmosphere_segments: number;
  proposed_assets: AutoSfxProposedAsset[];
  matched_assets: AutoSfxMatchedAsset[];
  plans: AutoSfxChapterPlan[];
  usage: Record<string, number>;
  message: string;
}

export interface ApplySfxPlanRequest {
  foley_cues: PendingFoleyCueInput[];
  atmosphere_spans: PendingAtmosphereSpanInput[];
}

export interface ApplySfxPlanResponse {
  applied_foley_count: number;
  applied_atmosphere_segments: number;
  message: string;
}

export interface SfxCueJob {
  id: string;
  project_id: string;
  user_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  chapter_ids: string[];
  include_foley: boolean;
  include_atmosphere: boolean;
  propose_missing_assets: boolean;
  total_chapters: number;
  processed_chapters: number;
  total_chunks: number;
  processed_chunks: number;
  progress_percentage: number;
  current_step?: string | null;
  error_message?: string | null;
  result_plan?: AutoSfxCueResponse | null;
  created_at: string;
  updated_at: string;
}


