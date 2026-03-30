export interface Profile {
  company: string;
  role: string;
  team: string;
  context: string;
}

export interface Periods {
  daily: true;
  weekly: boolean;
  monthly: boolean;
  quarterly: boolean;
  yearly: boolean;
}

export interface LocalStorageConfig {
  basePath: string;
}

export interface GitHubStorageConfig {
  owner: string;
  repo: string;
  token: string;
  basePath: string;
}

export interface StorageConfig {
  type: "local" | "github";
  local?: LocalStorageConfig;
  github?: GitHubStorageConfig;
}

export interface Config {
  storage: StorageConfig;
  language: string;
  periods: Periods;
  profile: Profile;
}

export interface StorageAdapter {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<string[]>;
  mkdir(dir: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
}

export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  [key: string]: unknown;
}

export interface GitEntry {
  action: 'commit';
  hash: string;
  branch: string;
  message?: string;
  remote?: string;
  cwd: string;
  timestamp: string;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}
