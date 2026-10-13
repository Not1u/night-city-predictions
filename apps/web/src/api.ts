import { ApiError, type ApiEnvelope, type ApiFailure, type Me, type Round, type RoundCharacter, type Page, type LedgerEntry, type Prediction, type Comment, type PredictionRequest, assertPoints } from '@night-city/contracts';
import { demoRounds, emptyRoundCharacters } from '../../../packages/contracts/src/fixtures';
import { authToken, signOut } from './auth';
export interface Client {
  mode: 'mock' | 'api'; serverOffset: number;
  rounds(): Promise<Round[]>; characters(round: string): Promise<RoundCharacter[]>;
  me(): Promise<Me | null>; login(): Promise<void>; logout(): Promise<void>;
  checkIn(key: string): Promise<void>; predict(round: string, body: PredictionRequest, key: string): Promise<void>;
  ledger(): Promise<LedgerEntry[]>; predictions(round: string): Promise<Prediction[]>;
  comments(character: string): Promise<Comment[]>; comment(character: string, body: string): Promise<void>;
  report(id: string): Promise<void>;
}
interface DemoState { version: 1; rounds: Round[]; loggedIn: boolean; balance: number; date: string | null; ledger: LedgerEntry[]; predictions: Prediction[]; comments: Comment[]; reported: string[]; keys: Record<string,string> }
const STORAGE = 'night-city-demo-v1';
/** Browser-only disposable simulation. Never exported to D1 or used as trusted state. */
export class MockClient implements Client {
  mode = 'mock' as const; serverOffset = 0;
  private state: DemoState;
  constructor() {
    const empty: DemoState = { version: 1, rounds: demoRounds(), loggedIn: false, balance: 0, date: null, ledger: [], predictions: [], comments: [], reported: [], keys: {} };
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as DemoState | null;
      this.state = stored?.version === 1 && Array.isArray(stored.rounds) && Array.isArray(stored.ledger) && Number.isSafeInteger(stored.balance) ? stored : empty;
    } catch { this.state = empty; }
  }
  private save() { try { localStorage.setItem(STORAGE, JSON.stringify(this.state)); } catch { /* Remains usable in memory when storage is disabled. */ } }
  private auth() { if (!this.state.loggedIn) throw new ApiError('UNAUTHENTICATED', '请先进入演示账户'); }
  private record(kind: LedgerEntry['kind'], delta: number, round: string | null = null, prediction: string | null = null) {
    this.state.balance += delta;
    this.state.ledger.unshift({ id: crypto.randomUUID(), kind, delta, balance_after: this.state.balance, round_id: round, prediction_id: prediction, created_at: new Date().toISOString() });
  }
  async rounds() {
    return this.state.rounds.map(r => {
      const orders = this.state.predictions.filter(p => p.round_id === r.id);
      return { ...r, status: r.status === 'open' && Date.parse(r.closes_at!) <= Date.now() ? 'closed' as const : r.status, pool_total: orders.reduce((sum,p) => sum + p.amount,0), participant_count: new Set(orders.map(p=>p.user_id)).size };
    });
  }
  async characters(round: string) {
    const orders = this.state.predictions.filter(p => p.round_id === round);
    const total = orders.reduce((sum,p) => sum + p.amount,0);
    return emptyRoundCharacters().map(c => {
      const own = orders.filter(p => p.character_id === c.id);
      const stake = own.reduce((sum,p) => sum + p.amount,0);
      return { ...c, odds: { ...c.odds, stake_total: stake, participant_count: new Set(own.map(p=>p.user_id)).size, live_reference: stake ? { numerator: total, denominator: stake } : null } };
    });
  }
  async me(): Promise<Me | null> { return this.state.loggedIn ? { user: { id: 'demo-user', display_name: '夜城访客', role: 'user' }, wallet: { balance: this.state.balance, currency: 'EUR_NC', checked_in_today: this.state.date === new Date().toISOString().slice(0,10) } } : null; }
  async login() { this.state.loggedIn = true; this.save(); }
  async logout() { this.state.loggedIn = false; this.save(); }
  async checkIn(key: string) {
    this.auth();
    if (this.state.keys[key]) { if (this.state.keys[key] !== 'check-in') throw new ApiError('IDEMPOTENCY_CONFLICT','请求标识已被使用'); return; }
    const date = new Date().toISOString().slice(0,10);
    if (this.state.date === date) throw new ApiError('ALREADY_CHECKED_IN', '今日已领取，请在 UTC 零点后再来');
    this.record('check_in',50); this.state.date = date; this.state.keys[key] = 'check-in'; this.save();
  }
  async predict(round: string, body: PredictionRequest, key: string) {
    this.auth(); assertPoints(body.amount);
    const fingerprint = JSON.stringify({round,...body});
    if (this.state.keys[key]) { if (this.state.keys[key] !== fingerprint) throw new ApiError('IDEMPOTENCY_CONFLICT','请求内容不一致'); return; }
    const current = this.state.rounds.find(r => r.id === round);
    if (!current || current.status !== 'open') throw new ApiError('ROUND_NOT_OPEN','本轮尚未开放');
    if (Date.now() >= Date.parse(current.closes_at!)) throw new ApiError('ROUND_CLOSED','本轮已封盘，无法提交');
    if (!emptyRoundCharacters().some(c=>c.id===body.character_id)) throw new ApiError('CHARACTER_INELIGIBLE','角色不在本轮名单');
    if (this.state.balance < body.amount) throw new ApiError('INSUFFICIENT_BALANCE','积分不足，试试每日签到');
    const prediction: Prediction = { id: crypto.randomUUID(), round_id: round, character_id: body.character_id, user_id: 'demo-user', amount: body.amount, payout: null, created_at: new Date().toISOString() };
    this.record('prediction',-body.amount,round,prediction.id); this.state.predictions.unshift(prediction);
    this.state.keys[key] = fingerprint; this.save();
  }
  async ledger() { this.auth(); return this.state.ledger; }
  async predictions(round: string) { this.auth(); return this.state.predictions.filter(p=>p.round_id===round); }
  async comments(character: string) { return this.state.comments.filter(c=>c.character_id===character && c.status==='visible'); }
  async comment(character: string, body: string) {
    this.auth(); body=body.trim();
    if (!body || body.length > 500) throw new ApiError('INVALID_INPUT','留言应为 1–500 个字符');
    const last=this.state.comments[0];
    if(last && Date.now()-Date.parse(last.created_at)<10000) throw new ApiError('RATE_LIMITED','稍等 10 秒再发送下一条');
    this.state.comments.unshift({id:crypto.randomUUID(), character_id:character,author:{id:'demo-user',display_name:'夜城访客'},body,created_at:new Date().toISOString(),status:'visible'}); this.save();
  }
  async report(id: string) { this.auth(); if(!this.state.comments.some(c=>c.id===id)) throw new ApiError('NOT_FOUND','留言不存在'); if(this.state.reported.includes(id)) throw new ApiError('INVALID_INPUT','这条留言已在本地标记举报'); this.state.reported.push(id); this.save(); }
}
class HttpClient implements Client {
  mode = 'api' as const; serverOffset = 0;
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    const needsAuth = path.startsWith('/me') || path.startsWith('/auth') || (init?.method && init.method !== 'GET');
    const token = needsAuth ? await authToken() : null;
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization',`Bearer ${token}`);
    try { response = await fetch((import.meta.env?.VITE_API_BASE_URL ?? '') + '/api/v1' + path, { ...init, headers, signal: AbortSignal.timeout(15000) }); }
    catch { throw new ApiError('NETWORK_ERROR','无法连接服务，请检查网络后重试'); }
    let json: ApiEnvelope<T> | ApiFailure;
    try { json = await response.json(); } catch { throw new ApiError('NETWORK_ERROR','服务暂时不可用，请稍后重试'); }
    this.serverOffset = Date.parse(json.meta.server_time) - Date.now();
    if ('error' in json) throw new ApiError(json.error.code,json.error.message,response.status);
    return json.data;
  }
  private disabled(): never { throw new ApiError('FEATURE_NOT_READY','当前开放账户与签到；预测和社区稍后开放'); }
  async rounds() { return (await this.request<Page<Round>>('/rounds')).items; }
  async characters(id:string) { return (await this.request<Page<RoundCharacter>>(`/rounds/${encodeURIComponent(id)}/characters`)).items; }
  async me():Promise<Me|null> { if (!await authToken()) return null; try{return await this.request<Me>('/me');}catch(e){if(e instanceof ApiError && e.code==='UNAUTHENTICATED') return null; throw e;} }
  async login(){await this.request('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true})});}
  async logout(){await signOut();}
  async checkIn(key:string){await this.request('/check-ins',{method:'POST',headers:{'Idempotency-Key':key}});}
  async predict(){this.disabled();}
  async ledger(){return (await this.request<Page<LedgerEntry>>('/me/ledger')).items;}
  async predictions(id:string){return (await this.request<Page<Prediction>>(`/me/predictions?round_id=${encodeURIComponent(id)}`)).items;}
  async comments(id:string){return (await this.request<Page<Comment>>(`/characters/${encodeURIComponent(id)}/comments`)).items;}
  async comment(){this.disabled();} async report(){this.disabled();}
}
export const client: Client = import.meta.env?.VITE_DATA_MODE === 'api' ? new HttpClient() : new MockClient();
