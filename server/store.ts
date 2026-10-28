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
      CREATE TABLE IF NOT EXISTS office_messages(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), owner_id TEXT NOT NULL REFERENCES users(id), actor_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS office_message_owner ON office_messages(project_id,owner_id,created_at);
      CREATE TABLE IF NOT EXISTS presence(project_id TEXT NOT NULL REFERENCES projects(id), actor_id TEXT NOT NULL, actor_type TEXT NOT NULL CHECK(actor_type IN ('human','agent')), room TEXT NOT NULL CHECK(room IN ('office','meeting','library','commons')), meeting_id TEXT REFERENCES meetings(id), updated_at TEXT NOT NULL, PRIMARY KEY(project_id,actor_id,actor_type));
      CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), meeting_id TEXT REFERENCES meetings(id), body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed', actor_name TEXT NOT NULL, confirmed_by TEXT REFERENCES users(id), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), meeting_id TEXT REFERENCES meetings(id), title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, assignee_id TEXT REFERENCES agents(id), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), visibility TEXT NOT NULL, version INTEGER NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id,path));
      CREATE TABLE IF NOT EXISTS file_versions(file_id TEXT NOT NULL REFERENCES files(id), version INTEGER NOT NULL, content BLOB NOT NULL, actor_name TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(file_id,version));
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(id), kind TEXT NOT NULL, payload TEXT NOT NULL, owner_id TEXT, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS event_project ON events(project_id,id);
      CREATE INDEX IF NOT EXISTS message_project ON messages(project_id,meeting_id,created_at);
      CREATE TABLE IF NOT EXISTS agent_preferences(agent_id TEXT PRIMARY KEY REFERENCES agents(id), meeting_policy TEXT NOT NULL DEFAULT 'ask' CHECK(meeting_policy IN ('ask','auto')), allow_direct INTEGER NOT NULL DEFAULT 0 CHECK(allow_direct IN (0,1)));
      CREATE TABLE IF NOT EXISTS meeting_invitations(id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id), actor_id TEXT NOT NULL, actor_type TEXT NOT NULL CHECK(actor_type IN ('human','agent')), invited_by TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')), seen_at TEXT, deferred_at TEXT, joined_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(meeting_id,actor_id,actor_type));
      CREATE INDEX IF NOT EXISTS invitation_recipient ON meeting_invitations(actor_type,actor_id,created_at);
      CREATE TABLE IF NOT EXISTS direct_conversations(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), user_id TEXT NOT NULL REFERENCES users(id), agent_id TEXT NOT NULL REFERENCES agents(id), created_at TEXT NOT NULL, UNIQUE(project_id,user_id,agent_id));
      CREATE TABLE IF NOT EXISTS direct_messages(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES direct_conversations(id), actor_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS direct_message_conversation ON direct_messages(conversation_id,created_at);
      CREATE TABLE IF NOT EXISTS message_targets(message_id TEXT NOT NULL REFERENCES messages(id), agent_id TEXT NOT NULL REFERENCES agents(id), PRIMARY KEY(message_id,agent_id));
      CREATE TABLE IF NOT EXISTS agent_requests(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), agent_id TEXT NOT NULL REFERENCES agents(id), message_id TEXT NOT NULL, conversation_id TEXT REFERENCES direct_conversations(id), meeting_id TEXT REFERENCES meetings(id), status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','replied','failed')), lease_id TEXT, claimed_at TEXT, reply_id TEXT, created_at TEXT NOT NULL, UNIQUE(message_id,agent_id));
      CREATE INDEX IF NOT EXISTS agent_request_queue ON agent_requests(project_id,agent_id,status,created_at);
      CREATE TABLE IF NOT EXISTS agent_credentials(id TEXT PRIMARY KEY,agent_id TEXT NOT NULL REFERENCES agents(id),token_hash TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL,last_seen TEXT,mcp_seen TEXT);
      CREATE TABLE IF NOT EXISTS agent_pairings(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),agent_id TEXT NOT NULL REFERENCES agents(id),owner_id TEXT NOT NULL REFERENCES users(id),code_hash TEXT UNIQUE NOT NULL,expires_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'waiting',credential_hash TEXT,client_name TEXT,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_preferences(viewer_id TEXT NOT NULL REFERENCES users(id),thread_key TEXT NOT NULL,group_name TEXT NOT NULL DEFAULT '',archived INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(viewer_id,thread_key));
      CREATE TABLE IF NOT EXISTS chat_hidden(viewer_id TEXT NOT NULL REFERENCES users(id),thread_key TEXT NOT NULL,message_id TEXT NOT NULL,PRIMARY KEY(viewer_id,thread_key,message_id));
      CREATE TABLE IF NOT EXISTS chat_redactions(thread_key TEXT NOT NULL,message_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(thread_key,message_id));
      CREATE TABLE IF NOT EXISTS chat_policies(thread_key TEXT PRIMARY KEY,project_id TEXT NOT NULL,kind TEXT NOT NULL,target_id TEXT,owner_id TEXT,days INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS chat_summaries(id TEXT PRIMARY KEY,thread_key TEXT NOT NULL,first_sequence INTEGER NOT NULL,last_sequence INTEGER NOT NULL,source_count INTEGER NOT NULL,extracts TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS chat_summary_thread ON chat_summaries(thread_key,last_sequence);
      CREATE TABLE IF NOT EXISTS git_repositories(project_id TEXT PRIMARY KEY REFERENCES projects(id),remote_url TEXT NOT NULL,base_branch TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS git_workspaces(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),owner_id TEXT NOT NULL REFERENCES users(id),agent_id TEXT NOT NULL REFERENCES agents(id),task_id TEXT REFERENCES tasks(id),remote_url TEXT NOT NULL,base_branch TEXT NOT NULL,allow_write INTEGER NOT NULL,allow_push INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'waiting',device_hash TEXT,client_name TEXT,last_seen TEXT,summary TEXT,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS git_workspace_owner ON git_workspaces(project_id,owner_id);
      CREATE TABLE IF NOT EXISTS git_jobs(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES git_workspaces(id),action TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',lease_id TEXT,claimed_at TEXT,result TEXT,error TEXT,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS git_job_workspace ON git_jobs(workspace_id,created_at);
      CREATE TABLE IF NOT EXISTS git_reviews(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),workspace_id TEXT NOT NULL REFERENCES git_workspaces(id),task_id TEXT REFERENCES tasks(id),owner_id TEXT NOT NULL REFERENCES users(id),branch TEXT NOT NULL,commit_id TEXT NOT NULL,review_url TEXT,created_at TEXT NOT NULL);
    `);
    // Preserve access for AI participants invited before explicit approval existed.
    this.db
      .exec(`INSERT OR IGNORE INTO meeting_invitations(id,meeting_id,actor_id,actor_type,invited_by,status,created_at,updated_at)
      SELECT 'legacy-' || p.meeting_id || '-' || p.agent_id,p.meeting_id,p.agent_id,'agent',m.creator_id,'accepted',m.created_at,m.created_at FROM participants p JOIN meetings m ON m.id=p.meeting_id;`);
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
