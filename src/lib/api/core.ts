/* eslint-disable @typescript-eslint/no-explicit-any -- row types are unknown here; callers narrow them */
// Tourny's client for its own API: queries, functions, accounts, images and live changes.
// Plain TypeScript on fetch and WebSocket, no dependencies. The web app and the mobile app use the same file:
// `node scripts/sync-client.mjs` copies it to mobile/src/lib/client.ts, so edit only this one.

export type ApiError = { message: string; code?: string; details?: string | null; hint?: string | null; status?: number };
export type Result<T> = { data: T | null; error: ApiError | null; count?: number | null; status?: number };

export type User = { id: string; email?: string; user_metadata: Record<string, any>; app_metadata: Record<string, any>; created_at?: string; [key: string]: any };
/** What is kept between visits: the two tokens and when the access token runs out (seconds since 1970). */
export type StoredSession = { access_token: string; refresh_token: string; expires_at: number };
/** A sign-in, with the account as the access token describes it. Ask `auth.getUser()` for the current state. */
export type Session = StoredSession & { user: User };

/** Where a client keeps its sign-in: cookies on the web, AsyncStorage on mobile. Writing may fail (server render); that is ignored. */
export type SessionStore = {
  get(): StoredSession | null | Promise<StoredSession | null>;
  set(session: StoredSession | null): void | Promise<void>;
  /** Renews an expired session some other way than calling the API with the stored refresh token (null: signed out). */
  renew?(): Promise<StoredSession | null>;
};

type AnyDb = any;
type IsAny<T> = 0 extends 1 & T ? true : false;
type RowOf<DB, N extends string> = IsAny<DB> extends true
  ? any
  : DB extends { public: { Tables: infer T; Views: infer V } }
    ? N extends keyof T ? (T[N] extends { Row: infer R } ? R : any) : N extends keyof V ? (V[N] extends { Row: infer R } ? R : any) : any
    : any;
type InsertOf<DB, N extends string> = IsAny<DB> extends true ? any : DB extends { public: { Tables: infer T } } ? (N extends keyof T ? (T[N] extends { Insert: infer I } ? I : any) : any) : any;
type UpdateOf<DB, N extends string> = IsAny<DB> extends true ? any : DB extends { public: { Tables: infer T } } ? (N extends keyof T ? (T[N] extends { Update: infer U } ? U : any) : any) : any;
type FnArgs<DB, F extends string> = IsAny<DB> extends true ? any : DB extends { public: { Functions: infer Fns } } ? (F extends keyof Fns ? (Fns[F] extends { Args: infer A } ? A : any) : any) : any;
type FnReturns<DB, F extends string> = IsAny<DB> extends true ? any : DB extends { public: { Functions: infer Fns } } ? (F extends keyof Fns ? (Fns[F] extends { Returns: infer R } ? R : any) : any) : any;

const noSession: ApiError = { message: 'Auth session missing!', status: 401 };

async function failure(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => '');
  try {
    const body = JSON.parse(text);
    return { message: body.message ?? body.msg ?? body.error_description ?? body.error ?? res.statusText, code: body.code ?? body.error_code, details: body.details ?? null, hint: body.hint ?? null, status: res.status };
  } catch {
    return { message: text || res.statusText || `Request failed (${res.status})`, status: res.status };
  }
}

const thrown = (e: unknown): ApiError => ({ message: e instanceof Error ? e.message : String(e), status: 0 });

// -- queries ------------------------------------------------------------------------------------

type Ctx = { url: string; token: () => Promise<string | null>; fetch: typeof fetch };

/** A query on a table or view, built by chaining and run when awaited. */
export class Query<T, R = any> implements PromiseLike<Result<T>> {
  private params = new URLSearchParams();
  private prefer: string[] = [];
  private method: 'GET' | 'HEAD' | 'POST' | 'PATCH' | 'DELETE' = 'GET';
  private body: unknown;
  private one: 'single' | 'maybe' | null = null;

  private ctx: Ctx;
  private table: string;
  constructor(ctx: Ctx, table: string) { this.ctx = ctx; this.table = table; }

  /** Choosing columns on a plain read; after insert/update/upsert/delete it asks for the changed rows back. */
  select(columns?: '*', opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): Query<R[], R>;
  select(columns: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): Query<any[], any>;
  select(columns = '*', opts: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean } = {}): any {
    let quoted = false;
    this.params.set('select', [...columns].filter((c) => { if (c === '"') quoted = !quoted; return quoted || !/\s/.test(c); }).join(''));
    if (this.method !== 'GET') this.prefer.push('return=representation');
    if (opts.count) this.prefer.push(`count=${opts.count}`);
    if (opts.head) this.method = 'HEAD';
    return this;
  }

  insert(values: any): Query<null, R> {
    this.method = 'POST';
    this.body = values;
    if (Array.isArray(values)) this.params.set('columns', [...new Set(values.flatMap((v) => Object.keys(v)))].map((c) => `"${c}"`).join(','));
    return this as any;
  }
  upsert(values: any, opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}): Query<null, R> {
    this.insert(values);
    this.prefer.push(`resolution=${opts.ignoreDuplicates ? 'ignore' : 'merge'}-duplicates`);
    if (opts.onConflict) this.params.set('on_conflict', opts.onConflict);
    return this as any;
  }
  update(values: any): Query<null, R> {
    this.method = 'PATCH';
    this.body = values;
    return this as any;
  }
  delete(): Query<null, R> {
    this.method = 'DELETE';
    return this as any;
  }

  private add(column: string, operator: string, value: unknown) {
    this.params.append(column, `${operator}.${value}`);
    return this;
  }
  eq(column: string, value: unknown) { return this.add(column, 'eq', value); }
  neq(column: string, value: unknown) { return this.add(column, 'neq', value); }
  gt(column: string, value: unknown) { return this.add(column, 'gt', value); }
  gte(column: string, value: unknown) { return this.add(column, 'gte', value); }
  lt(column: string, value: unknown) { return this.add(column, 'lt', value); }
  lte(column: string, value: unknown) { return this.add(column, 'lte', value); }
  like(column: string, pattern: string) { return this.add(column, 'like', pattern); }
  ilike(column: string, pattern: string) { return this.add(column, 'ilike', pattern); }
  is(column: string, value: null | boolean) { return this.add(column, 'is', value); }
  in(column: string, values: readonly unknown[]) {
    const item = (v: unknown) => (typeof v === 'string' && /[,()"\s]/.test(v) ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : String(v));
    return this.add(column, 'in', `(${values.map(item).join(',')})`);
  }
  contains(column: string, value: string | readonly unknown[] | Record<string, unknown>) {
    return this.add(column, 'cs', typeof value === 'string' ? value : Array.isArray(value) ? `{${value.join(',')}}` : JSON.stringify(value));
  }
  not(column: string, operator: string, value: unknown) { return this.add(column, `not.${operator}`, value); }
  filter(column: string, operator: string, value: unknown) { return this.add(column, operator, value); }
  match(query: Record<string, unknown>) { Object.entries(query).forEach(([k, v]) => this.eq(k, v)); return this; }
  or(filters: string) { this.params.append('or', `(${filters})`); return this; }

  order(column: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const term = `${column}.${opts.ascending === false ? 'desc' : 'asc'}${opts.nullsFirst === undefined ? '' : opts.nullsFirst ? '.nullsfirst' : '.nullslast'}`;
    this.params.set('order', this.params.has('order') ? `${this.params.get('order')},${term}` : term);
    return this;
  }
  limit(count: number) { this.params.set('limit', String(count)); return this; }
  range(from: number, to: number) { this.params.set('offset', String(from)); this.params.set('limit', String(to - from + 1)); return this; }

  /** Exactly one row, or an error. */
  single(): Query<R, R> { this.one = 'single'; return this as any; }
  /** One row, or null when there is none. */
  maybeSingle(): Query<R | null, R> { this.one = 'maybe'; return this as any; }

  then<A = Result<T>, B = never>(onfulfilled?: ((value: Result<T>) => A | PromiseLike<A>) | null, onrejected?: ((reason: any) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<Result<T>> {
    try {
      const headers: Record<string, string> = {};
      const token = await this.ctx.token();
      if (token) headers.Authorization = `Bearer ${token}`;
      if (this.body !== undefined) headers['Content-Type'] = 'application/json';
      if (this.one === 'single') headers.Accept = 'application/vnd.pgrst.object+json';
      if (this.method !== 'GET' && this.method !== 'HEAD' && !this.prefer.some((p) => p.startsWith('return='))) this.prefer.push('return=minimal');
      if (this.prefer.length) headers.Prefer = this.prefer.join(',');
      const query = this.params.toString();
      const res = await this.ctx.fetch(`${this.ctx.url}/rest/${this.table}${query ? `?${query}` : ''}`, {
        method: this.method, headers, body: this.body === undefined ? undefined : JSON.stringify(this.body), cache: 'no-store',
      });
      if (!res.ok) {
        const error = await failure(res);
        if (this.one === 'single' && res.status === 406) error.code = 'PGRST116';
        return { data: null, error, status: res.status };
      }
      const range = res.headers.get('content-range')?.split('/')[1];
      const count = range && range !== '*' ? Number(range) : null;
      const text = this.method === 'HEAD' ? '' : await res.text();
      let data = text ? JSON.parse(text) : null;
      if (this.one === 'maybe' && Array.isArray(data)) {
        if (data.length > 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', status: 406 }, status: 406 };
        data = data[0] ?? null;
      }
      return { data, error: null, count, status: res.status };
    } catch (e) {
      return { data: null, error: thrown(e) };
    }
  }
}

/** A call to a database function. */
export class Call<T, R = any> implements PromiseLike<Result<T>> {
  private one: 'single' | 'maybe' | null = null;
  private ctx: Ctx;
  private fn: string;
  private args: unknown;
  constructor(ctx: Ctx, fn: string, args: unknown) { this.ctx = ctx; this.fn = fn; this.args = args; }

  single(): Call<R, R> { this.one = 'single'; return this as any; }
  maybeSingle(): Call<R | null, R> { this.one = 'maybe'; return this as any; }

  then<A = Result<T>, B = never>(onfulfilled?: ((value: Result<T>) => A | PromiseLike<A>) | null, onrejected?: ((reason: any) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<Result<T>> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = await this.ctx.token();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await this.ctx.fetch(`${this.ctx.url}/rpc/${this.fn}`, { method: 'POST', headers, body: JSON.stringify(this.args ?? {}), cache: 'no-store' });
      if (!res.ok) return { data: null, error: await failure(res), status: res.status };
      const text = await res.text();
      let data = text ? JSON.parse(text) : null;
      if (this.one) {
        const rows = Array.isArray(data) ? data : data == null ? [] : [data];
        if (rows.length > 1 || (rows.length === 0 && this.one === 'single')) {
          return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', status: 406 }, status: 406 };
        }
        data = rows[0] ?? null;
      }
      return { data, error: null, status: res.status };
    } catch (e) {
      return { data: null, error: thrown(e) };
    }
  }
}

// -- accounts -----------------------------------------------------------------------------------

export type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED';

const read = async (store: SessionStore) => { try { return await store.get(); } catch { return null; } };
const write = async (store: SessionStore, session: StoredSession | null) => { try { await store.set(session); } catch { /* a server render cannot set cookies; the proxy does */ } };

/** The account named in an access token: its claims carry the id, email and profile data. */
function withUser(tokens: StoredSession): Session {
  const payload = atob(tokens.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'));
  const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(payload, (c) => c.charCodeAt(0))));
  return { ...tokens, user: { id: claims.sub, email: claims.email, user_metadata: claims.user_metadata ?? {}, app_metadata: claims.app_metadata ?? {} } };
}

class Auth {
  private listeners = new Set<(event: AuthEvent, session: Session | null) => void>();
  private refreshing: Promise<Session | null> | null = null;

  private url: string;
  private store: SessionStore;
  private doFetch: typeof fetch;
  constructor(url: string, store: SessionStore, doFetch: typeof fetch) { this.url = url; this.store = store; this.doFetch = doFetch; }

  private async post<T>(path: string, body: unknown, token?: string): Promise<{ data: T | null; error: ApiError | null }> {
    try {
      const res = await this.doFetch(`${this.url}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), cache: 'no-store',
      });
      if (!res.ok) return { data: null, error: await failure(res) };
      const text = await res.text();
      return { data: text ? JSON.parse(text) : (null as T | null), error: null };
    } catch (e) {
      return { data: null, error: thrown(e) };
    }
  }

  private emit(event: AuthEvent, session: Session | null) {
    this.listeners.forEach((listener) => listener(event, session));
  }

  private async keep(raw: any, event: AuthEvent): Promise<Session> {
    const tokens: StoredSession = { access_token: raw.access_token, refresh_token: raw.refresh_token, expires_at: raw.expires_at };
    await write(this.store, tokens);
    const session = withUser(tokens);
    this.emit(event, session);
    return session;
  }

  async signInWithPassword(credentials: { email: string; password: string }) {
    const { data, error } = await this.post<any>('/auth/token?grant_type=password', credentials);
    if (error || !data) return { data: { user: null, session: null }, error: error ?? { message: 'Sign-in failed' } };
    const session = await this.keep(data, 'SIGNED_IN');
    return { data: { user: session.user ?? null, session }, error: null };
  }

  async signUp(input: { email: string; password: string; options?: { data?: Record<string, unknown>; emailRedirectTo?: string } }) {
    const { data, error } = await this.post<any>('/auth/signup', { email: input.email, password: input.password, data: input.options?.data });
    if (error || !data) return { data: { user: null, session: null }, error: error ?? { message: 'Sign-up failed' } };
    if (!data.access_token) return { data: { user: data.user ?? data, session: null }, error: null };
    const session = await this.keep(data, 'SIGNED_IN');
    return { data: { user: session.user ?? null, session }, error: null };
  }

  /** The signed-in session, renewed first when it is about to expire. */
  async getSession(): Promise<{ data: { session: Session | null }; error: ApiError | null }> {
    const stored = await read(this.store);
    if (!stored) return { data: { session: null }, error: null };
    if (stored.expires_at - 30 > Math.floor(Date.now() / 1000)) return { data: { session: withUser(stored) }, error: null };
    this.refreshing ??= this.renew(stored).finally(() => { this.refreshing = null; });
    return { data: { session: await this.refreshing }, error: null };
  }

  private async renew(stored: StoredSession): Promise<Session | null> {
    if (this.store.renew) {
      try {
        const renewed = await this.store.renew();
        if (!renewed) { this.emit('SIGNED_OUT', null); return null; }
        const session = withUser(renewed);
        this.emit('TOKEN_REFRESHED', session);
        return session;
      } catch {
        return null; // offline: keep the sign-in for next time
      }
    }
    const { data, error } = await this.post<any>('/auth/token?grant_type=refresh_token', { refresh_token: stored.refresh_token });
    if (error || !data) {
      // A refresh the server refuses means the sign-in is over; a network failure keeps it for next time.
      if (error && error.status && error.status < 500) {
        await write(this.store, null);
        this.emit('SIGNED_OUT', null);
      }
      return null;
    }
    return this.keep(data, 'TOKEN_REFRESHED');
  }

  async getUser(): Promise<{ data: { user: User | null }; error: ApiError | null }> {
    const { data: { session } } = await this.getSession();
    if (!session) return { data: { user: null }, error: noSession };
    try {
      const res = await this.doFetch(`${this.url}/auth/user`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      if (!res.ok) return { data: { user: null }, error: await failure(res) };
      return { data: { user: await res.json() }, error: null };
    } catch (e) {
      return { data: { user: null }, error: thrown(e) };
    }
  }

  async updateUser(changes: { password?: string; data?: Record<string, unknown> }) {
    const { data: { session } } = await this.getSession();
    if (!session) return { data: { user: null }, error: noSession };
    try {
      const res = await this.doFetch(`${this.url}/auth/user`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(changes), cache: 'no-store',
      });
      if (!res.ok) return { data: { user: null }, error: await failure(res) };
      const user = await res.json();
      this.emit('USER_UPDATED', session);
      return { data: { user }, error: null };
    } catch (e) {
      return { data: { user: null }, error: thrown(e) };
    }
  }

  async signOut() {
    const stored = await read(this.store);
    if (stored) await this.post('/auth/logout', {}, stored.access_token);
    await write(this.store, null);
    this.emit('SIGNED_OUT', null);
    return { error: null };
  }

  /** Emails a reset link. `challenge` is the PKCE challenge for the code that comes back to `redirectTo`. */
  async requestPasswordReset(email: string, opts: { redirectTo?: string; challenge?: string } = {}) {
    const query = opts.redirectTo ? `?redirect_to=${encodeURIComponent(opts.redirectTo)}` : '';
    const { error } = await this.post(`/auth/recover${query}`, { email, code_challenge: opts.challenge, code_challenge_method: opts.challenge ? 's256' : undefined });
    return { error };
  }

  /** Trades the code from an emailed link (and the verifier kept when it was requested) for a sign-in. */
  async exchangeCode(code: string, verifier: string) {
    const { data, error } = await this.post<any>('/auth/token?grant_type=pkce', { auth_code: code, code_verifier: verifier });
    if (error || !data) return { data: { user: null, session: null }, error: error ?? { message: 'The link is invalid or has expired' } };
    const session = await this.keep(data, 'SIGNED_IN');
    return { data: { user: session.user ?? null, session }, error: null };
  }

  onAuthStateChange(listener: (event: AuthEvent, session: Session | null) => void) {
    this.listeners.add(listener);
    void this.getSession().then(({ data }) => { if (this.listeners.has(listener)) listener('INITIAL_SESSION', data.session); });
    return { data: { subscription: { unsubscribe: () => { this.listeners.delete(listener); } } } };
  }
}

// -- images -------------------------------------------------------------------------------------

class Bucket {
  private ctx: Ctx;
  private name: string;
  constructor(ctx: Ctx, name: string) { this.ctx = ctx; this.name = name; }

  getPublicUrl(path: string) {
    return { data: { publicUrl: `${this.ctx.url}/storage/object/public/${this.name}/${path.split('/').map(encodeURIComponent).join('/')}` } };
  }

  async upload(path: string, file: Blob | ArrayBuffer | ArrayBufferView, opts: { contentType?: string; upsert?: boolean; cacheControl?: string } = {}): Promise<{ data: { path: string }; error: null } | { data: null; error: ApiError }> {
    try {
      const headers: Record<string, string> = { 'Content-Type': opts.contentType ?? (file instanceof Blob && file.type ? file.type : 'application/octet-stream') };
      const token = await this.ctx.token();
      if (token) headers.Authorization = `Bearer ${token}`;
      if (opts.upsert) headers['x-upsert'] = 'true';
      const res = await this.ctx.fetch(`${this.ctx.url}/storage/object/${this.name}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers, body: file as BodyInit });
      return res.ok ? { data: { path }, error: null } : { data: null, error: await failure(res) };
    } catch (e) {
      return { data: null, error: thrown(e) };
    }
  }

  async remove(paths: string[]): Promise<{ data: { name: string }[] | null; error: ApiError | null }> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = await this.ctx.token();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await this.ctx.fetch(`${this.ctx.url}/storage/object/${this.name}`, { method: 'DELETE', headers, body: JSON.stringify({ prefixes: paths }) });
      return res.ok ? { data: await res.json(), error: null } : { data: null, error: await failure(res) };
    } catch (e) {
      return { data: null, error: thrown(e) };
    }
  }
}

// -- live changes -------------------------------------------------------------------------------

export type ChangeFilter = { event: '*' | 'INSERT' | 'UPDATE' | 'DELETE'; schema?: string; table: string; filter?: string };
export type Change = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; schema: string; table: string; commit_timestamp: string; new: any; old: any; errors: unknown };
export type ChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

type Binding = { filter: ChangeFilter; callback: (change: Change) => void; id?: number };

export class Channel {
  readonly bindings: Binding[] = [];
  status: ((status: ChannelStatus) => void) | undefined;
  joinRef: string | null = null;

  private socket: Socket;
  readonly name: string;
  constructor(socket: Socket, name: string) { this.socket = socket; this.name = name; }

  /** Listens for changes to rows of a table (the only kind of live event there is). */
  on(_type: 'postgres_changes', filter: ChangeFilter, callback: (change: Change) => void): this {
    this.bindings.push({ filter: { schema: 'public', ...filter }, callback });
    return this;
  }

  subscribe(status?: (status: ChannelStatus) => void): this {
    this.status = status;
    this.socket.join(this);
    return this;
  }

  unsubscribe() {
    this.socket.leave(this);
  }
}

/** One WebSocket shared by every channel of a client. It reconnects and rejoins on its own. */
class Socket {
  private ws: WebSocket | null = null;
  private channels = new Map<string, Channel>();
  private refs = 0;
  private open = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private pending = new Map<string, Channel>();

  private url: string;
  constructor(url: string) { this.url = url; }

  join(channel: Channel) {
    this.channels.set(channel.name, channel);
    this.connect();
    if (this.open) this.sendJoin(channel);
  }

  leave(channel: Channel) {
    this.channels.delete(channel.name);
    if (this.open && channel.joinRef) this.send(channel.joinRef, String(++this.refs), `realtime:${channel.name}`, 'phx_leave', {});
    if (this.channels.size === 0) this.close();
  }

  private connect() {
    if (this.ws || typeof WebSocket === 'undefined') return;
    const ws = new WebSocket(`${this.url.replace(/^http/, 'ws')}/realtime/websocket?vsn=2.0.0`);
    this.ws = ws;
    ws.onopen = () => {
      this.open = true;
      this.attempts = 0;
      this.heartbeat = setInterval(() => this.send(null, String(++this.refs), 'phoenix', 'heartbeat', {}), 25000);
      this.channels.forEach((channel) => this.sendJoin(channel));
    };
    ws.onmessage = (event) => this.receive(String(event.data));
    ws.onclose = () => {
      this.drop();
      if (this.channels.size === 0) return;
      this.channels.forEach((channel) => channel.status?.('CLOSED'));
      this.retry = setTimeout(() => { this.retry = null; this.connect(); }, Math.min(1000 * 2 ** this.attempts++, 10000));
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  private drop() {
    this.open = false;
    this.ws = null;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private close() {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const ws = this.ws;
    this.drop();
    ws?.close();
  }

  private sendJoin(channel: Channel) {
    const ref = String(++this.refs);
    channel.joinRef = ref;
    this.pending.set(ref, channel);
    this.send(ref, ref, `realtime:${channel.name}`, 'phx_join', {
      config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: channel.bindings.map((b) => b.filter), private: false },
    });
  }

  private send(joinRef: string | null, ref: string, topic: string, event: string, payload: unknown) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify([joinRef, ref, topic, event, payload]));
  }

  private receive(raw: string) {
    let message: [string | null, string | null, string, string, any];
    try { message = JSON.parse(raw); } catch { return; }
    const [joinRef, ref, topic, event, payload] = message;
    const channel = this.channels.get(topic.replace(/^realtime:/, ''));
    if (event === 'phx_reply' && ref && this.pending.has(ref)) {
      const joining = this.pending.get(ref)!;
      this.pending.delete(ref);
      if (payload.status === 'ok') {
        const accepted: { id: number }[] = payload.response?.postgres_changes ?? [];
        joining.bindings.forEach((binding, i) => { binding.id = accepted[i]?.id; });
        joining.status?.('SUBSCRIBED');
      } else {
        joining.status?.('CHANNEL_ERROR');
      }
    } else if (event === 'postgres_changes' && channel && joinRef === channel.joinRef) {
      const data = payload.data;
      const change: Change = { eventType: data.type, schema: data.schema, table: data.table, commit_timestamp: data.commit_timestamp, new: data.record ?? {}, old: data.old_record ?? {}, errors: data.errors };
      channel.bindings.filter((b) => b.id !== undefined && (payload.ids as number[]).includes(b.id)).forEach((b) => b.callback(change));
    }
  }
}

// -- the client ---------------------------------------------------------------------------------

export type ApiOptions = { store: SessionStore; fetch?: typeof fetch };

export class Api<DB = AnyDb> {
  readonly auth: Auth;
  private ctx: Ctx;
  private socket: Socket;

  readonly url: string;
  constructor(url: string, opts: ApiOptions) {
    this.url = url;
    const base = url.replace(/\/+$/, '');
    // `fetch` is looked up when called, so tests and Next.js can replace it after the client exists.
    const doFetch: typeof fetch = opts.fetch ?? ((input, init) => fetch(input, init));
    this.auth = new Auth(base, opts.store, doFetch);
    this.ctx = { url: base, fetch: doFetch, token: async () => (await this.auth.getSession()).data.session?.access_token ?? null };
    this.socket = new Socket(base);
  }

  from<N extends string>(table: N) {
    const q = () => new Query<any, any>(this.ctx, table);
    return {
      select: ((columns?: string, opts?: any) => q().select(columns as any, opts)) as Query<RowOf<DB, N>[], RowOf<DB, N>>['select'],
      insert: (values: InsertOf<DB, N> | InsertOf<DB, N>[]) => q().insert(values) as Query<null, RowOf<DB, N>>,
      upsert: (values: InsertOf<DB, N> | InsertOf<DB, N>[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => q().upsert(values, opts) as Query<null, RowOf<DB, N>>,
      update: (values: UpdateOf<DB, N>) => q().update(values) as Query<null, RowOf<DB, N>>,
      delete: () => q().delete() as Query<null, RowOf<DB, N>>,
    };
  }

  rpc<F extends string>(fn: F, args?: FnArgs<DB, F> & Record<string, unknown>): Call<FnReturns<DB, F>> {
    return new Call(this.ctx, fn, args);
  }

  readonly storage = { from: (bucket: string) => new Bucket(this.ctx, bucket) };

  channel(name: string): Channel {
    return new Channel(this.socket, name);
  }

  removeChannel(channel: Channel) {
    channel.unsubscribe();
  }
}
