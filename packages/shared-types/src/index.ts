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
  character_id?: string | null;
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
  created_at: string;
  updated_at: string;
  segments?: ScriptSegment[];
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
  aliases?: string[];
  created_at?: string;
  updated_at?: string;
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


