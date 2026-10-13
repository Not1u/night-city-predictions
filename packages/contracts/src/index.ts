/** v1.0: integer points; UTC ISO timestamps; ratios are NOT promised payouts. */
export const API_VERSION = 'v1';
export const EVENT_VERSION = 1;
export const CHECK_IN_TIMEZONE = 'UTC';
export const CHECK_IN_REWARD = 50;
export const MAX_POINTS = 1_000_000_000;
export type ID = string;
export type UTCDateTime = string;
export type RoundStatus = 'draft' | 'open' | 'closed' | 'result_pending' | 'settled' | 'refunded';
export interface Ratio { numerator: number; denominator: number }
export interface Round {
  id: ID; episode: number; title: string; status: RoundStatus;
  opens_at: UTCDateTime | null; closes_at: UTCDateTime | null;
  previous_round_id: ID | null; pool_total: number; participant_count: number;
}
export interface Character {
  id: ID; name: string; codename: string; group: 'crew' | 'associated' | 'memory';
  bio: string; image_url: string | null; death_image_url: string | null;
  source_url: string | null;
}
export interface CharacterOdds {
  character_id: ID; stake_total: number; participant_count: number;
  opening_reference: Ratio; live_reference: Ratio | null;
}
export interface RoundCharacter extends Character {
  death_confirmed: boolean; odds: CharacterOdds;
}
export interface User { id: ID; display_name: string; role: 'user' | 'admin' }
export interface Wallet { balance: number; currency: 'EUR_NC'; checked_in_today: boolean }
export interface Me { user: User; wallet: Wallet }
export interface Prediction {
  id: ID; round_id: ID; character_id: ID; user_id: ID; amount: number;
  created_at: UTCDateTime; payout: number | null;
}
export type LedgerKind = 'check_in' | 'prediction' | 'settlement' | 'refund' | 'activity_reward';
export interface LedgerEntry {
  id: ID; kind: LedgerKind; delta: number; balance_after: number;
  round_id: ID | null; prediction_id: ID | null; created_at: UTCDateTime;
}
export interface Comment {
  id: ID; character_id: ID; author: { id: ID; display_name: string };
  body: string; created_at: UTCDateTime; status: 'visible' | 'hidden';
}
export interface DeathResult {
  round_id: ID; dead_character_ids: ID[]; source_note: string;
  confirmed_by: ID; confirmed_at: UTCDateTime; revision: number;
}
export interface Settlement {
  round_id: ID; status: 'settled' | 'refunded'; pool_total: number;
  winning_stake: number; returned_total: number; settled_at: UTCDateTime;
}
export interface AuditEntry {
  id: ID; actor_id: ID; action: string; target_id: ID; request_id: ID;
  before: unknown; after: unknown; created_at: UTCDateTime;
}
export interface Page<T> { items: T[]; next_cursor: string | null }
export interface ApiEnvelope<T> { data: T; meta: { server_time: UTCDateTime; request_id: ID; api_version: 'v1' } }
export const errorCodes = [
  'UNAUTHENTICATED', 'FORBIDDEN', 'STEP_UP_REQUIRED', 'INVALID_INPUT',
  'NOT_FOUND', 'ROUND_NOT_OPEN', 'ROUND_CLOSED', 'CHARACTER_INELIGIBLE',
  'INSUFFICIENT_BALANCE', 'ALREADY_CHECKED_IN', 'IDEMPOTENCY_REQUIRED',
  'IDEMPOTENCY_CONFLICT', 'ALREADY_SETTLED', 'RESULT_REQUIRED', 'RATE_LIMITED',
  'FEATURE_NOT_READY', 'INTERNAL_ERROR', 'NETWORK_ERROR'
] as const;
export type ErrorCode = typeof errorCodes[number];
export interface ApiFailure { error: { code: ErrorCode; message: string }; meta: ApiEnvelope<never>['meta'] }
export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public status = 400) { super(message); }
}
export interface PredictionRequest { character_id: ID; amount: number }
export interface PredictionResponse { prediction: Prediction; wallet: Wallet }
export interface CheckInResponse { reward: number; date: string; wallet: Wallet; ledger: LedgerEntry }
export interface CommentRequest { body: string }
export interface ReportRequest { reason: 'spoiler' | 'abuse' | 'spam' | 'other'; detail?: string }
export interface AdminRoundRequest { episode: number; title: string; opens_at: UTCDateTime; closes_at: UTCDateTime; previous_round_id: ID | null }
export interface AdminCharacterRequest { name: string; codename: string; group: Character['group']; bio: string; source_url: string | null }
export interface AdminDeathRequest { dead_character_ids: ID[]; source_note: string; expected_revision: number }
/** Re-auth proof is single-use, expires within 5 minutes, bound to method/path/body hash. */
export interface StepUpRequest { action: string; target_id: ID; payload_hash: string; credential: unknown }
export interface StepUpResponse { proof: string; expires_at: UTCDateTime }
export interface DomainEvent<T> { schema_version: 1; sequence: number; round_id: ID; type: 'odds.updated' | 'round.closed' | 'round.settled' | 'comment.created'; data: T }
export interface RouteSpec { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; auth: 'public' | 'user' | 'admin' | 'step_up'; idempotent?: boolean; phase: 'read' | 'next' }
export const routes: readonly RouteSpec[] = [
  { method: 'GET', path: '/api/v1/rounds', auth: 'public', phase: 'read' },
  { method: 'GET', path: '/api/v1/rounds/:id/characters', auth: 'public', phase: 'read' },
  { method: 'GET', path: '/api/v1/rounds/:id/odds', auth: 'public', phase: 'read' },
  { method: 'GET', path: '/api/v1/auth/session', auth: 'user', phase: 'read' },
  { method: 'GET', path: '/api/v1/me', auth: 'user', phase: 'next' },
  { method: 'GET', path: '/api/v1/me/ledger', auth: 'user', phase: 'next' },
  { method: 'GET', path: '/api/v1/me/predictions?round_id=:id', auth: 'user', phase: 'next' },
  { method: 'POST', path: '/api/v1/check-ins', auth: 'user', idempotent: true, phase: 'next' },
  { method: 'POST', path: '/api/v1/rounds/:id/predictions', auth: 'user', idempotent: true, phase: 'next' },
  { method: 'GET', path: '/api/v1/characters/:id/comments', auth: 'public', phase: 'next' },
  { method: 'POST', path: '/api/v1/characters/:id/comments', auth: 'user', phase: 'next' },
  { method: 'POST', path: '/api/v1/comments/:id/reports', auth: 'user', phase: 'next' },
  { method: 'POST', path: '/api/v1/auth/logout', auth: 'user', phase: 'next' },
  { method: 'POST', path: '/api/v1/admin/auth/step-up', auth: 'admin', phase: 'next' },
  { method: 'GET', path: '/api/v1/admin/rounds', auth: 'admin', phase: 'next' },
  { method: 'POST', path: '/api/v1/admin/rounds', auth: 'step_up', phase: 'next' },
  { method: 'PATCH', path: '/api/v1/admin/rounds/:id', auth: 'step_up', phase: 'next' },
  { method: 'POST', path: '/api/v1/admin/rounds/:id/characters', auth: 'step_up', phase: 'next' },
  { method: 'POST', path: '/api/v1/admin/rounds/:id/open', auth: 'step_up', phase: 'next' },
  { method: 'POST', path: '/api/v1/admin/rounds/:id/close', auth: 'step_up', phase: 'next' },
  { method: 'POST', path: '/api/v1/admin/rounds/:id/deaths', auth: 'step_up', phase: 'next' },
  { method: 'POST', path: '/api/v1/admin/rounds/:id/settle', auth: 'step_up', idempotent: true, phase: 'next' },
  { method: 'GET', path: '/api/v1/admin/rounds/:id/next-candidates', auth: 'admin', phase: 'next' },
  { method: 'POST', path: '/api/v1/admin/characters', auth: 'step_up', phase: 'next' },
  { method: 'PATCH', path: '/api/v1/admin/characters/:id', auth: 'step_up', phase: 'next' },
  { method: 'DELETE', path: '/api/v1/admin/comments/:id', auth: 'step_up', phase: 'next' },
  { method: 'GET', path: '/api/v1/admin/reports', auth: 'admin', phase: 'next' },
  { method: 'PATCH', path: '/api/v1/admin/reports/:id', auth: 'step_up', phase: 'next' },
  { method: 'GET', path: '/api/v1/admin/audit', auth: 'admin', phase: 'next' },
  { method: 'POST', path: '/api/v1/admin/rewards', auth: 'step_up', idempotent: true, phase: 'next' },
  { method: 'POST', path: '/api/v1/admin/uploads', auth: 'step_up', phase: 'next' }
];
export const roundLabels: Record<RoundStatus, string> = { draft: '未开盘', open: '开放中', closed: '已封盘', result_pending: '待确认', settled: '已结算', refunded: '已退款' };
export function formatRatio(value: Ratio): string { return (value.numerator / value.denominator).toFixed(2) + 'x'; }
export function assertPoints(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > MAX_POINTS) throw new ApiError('INVALID_INPUT', '请输入有效的正整数积分');
}
