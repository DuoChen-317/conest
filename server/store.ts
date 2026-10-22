import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  randomUUID,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export type Row = Record<string, any>;
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const secret = () => randomBytes(32).toString("base64url");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function passwordHash(value: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
}
export function passwordMatches(value: string, stored: string) {
  const [salt, hex] = stored.split(":");
  const expected = Buffer.from(hex, "hex");
  const actual = scryptSync(value, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS members(project_id TEXT NOT NULL REFERENCES projects(id), user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL, PRIMARY KEY(project_id,user_id));
      CREATE TABLE IF NOT EXISTS invites(token_hash TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), expires_at TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, model TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'idle', last_seen TEXT, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meetings(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, agenda TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', creator_id TEXT NOT NULL REFERENCES users(id), max_turns INTEGER NOT NULL DEFAULT 12, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS participants(meeting_id TEXT NOT NULL REFERENCES meetings(id), agent_id TEXT NOT NULL REFERENCES agents(id), PRIMARY KEY(meeting_id,agent_id));
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), meeting_id TEXT REFERENCES meetings(id), actor_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), meeting_id TEXT REFERENCES meetings(id), body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed', actor_name TEXT NOT NULL, confirmed_by TEXT REFERENCES users(id), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), meeting_id TEXT REFERENCES meetings(id), title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, assignee_id TEXT REFERENCES agents(id), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), visibility TEXT NOT NULL, version INTEGER NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id,path));
      CREATE TABLE IF NOT EXISTS file_versions(file_id TEXT NOT NULL REFERENCES files(id), version INTEGER NOT NULL, content BLOB NOT NULL, actor_name TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(file_id,version));
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(id), kind TEXT NOT NULL, payload TEXT NOT NULL, owner_id TEXT, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS event_project ON events(project_id,id);
      CREATE INDEX IF NOT EXISTS message_project ON messages(project_id,meeting_id,created_at);
    `);
  }
  one(sql: string, ...params: any[]): Row | undefined {
    return this.db.prepare(sql).get(...params) as Row | undefined;
  }
  all(sql: string, ...params: any[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }
  run(sql: string, ...params: any[]) {
    return this.db.prepare(sql).run(...params);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
