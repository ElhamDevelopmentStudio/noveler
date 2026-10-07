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
  created_at: string;
  updated_at: string;
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
}

export interface ScriptSegment {
  id: string;
  chapter_id: string;
  order_index: number;
  text: string;
  is_dialogue: boolean;
  speaker?: string | null;
  speaker_gender?: string | null;
  emotion?: string | null;
  audio_status: string;
}

export interface Chapter {
  id: string;
  project_id: string;
  chapter_number: number;
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
}

export interface CharacterVoiceAssignmentDto {
  character_id: string;
  assigned_voice_id: string;
  assigned_voice_name: string;
}

export interface PronunciationOccurrence {
  chapter_number: number;
  chapter_title: string;
  segment_id: string;
  current_text: string;
  after_replacement: string;
  included: boolean;
}

export interface PronunciationSearchResponseData {
  phrase: string;
  replacement: string;
  total_occurrences: number;
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
  created_at: string;
}

export interface StageBJob {
  id: string;
  job_code: string;
  project_id: string;
  stage: string;
  status: "running" | "paused" | "stopped" | "complete";
  current_operation: string;
  current_batch: number;
  total_batches: number;
  records_processed: number;
  total_records: number;
  progress_percent: number;
  most_recent_step: string;
  elapsed_display: string;
  started_display: string;
  heartbeat_display: string;
  started_at: string;
  last_heartbeat_at: string;
}




