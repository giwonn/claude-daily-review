export interface StorageAdapter {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<string[]>;
  mkdir(dir: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
}
