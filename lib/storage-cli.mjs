#!/usr/bin/env node
// @ts-check
import { loadConfig, createStorageAdapter } from './config.mjs';

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const config = loadConfig();
  if (!config) { process.stderr.write('config not found\n'); process.exit(1); }

  const storage = await createStorageAdapter(config);

  switch (command) {
    case 'read': {
      const content = await storage.read(args[0]);
      if (content !== null) process.stdout.write(content);
      break;
    }
    case 'write': {
      let data = '';
      process.stdin.setEncoding('utf-8');
      for await (const chunk of process.stdin) { data += chunk; }
      await storage.write(args[0], data);
      break;
    }
    case 'append': {
      let data = '';
      process.stdin.setEncoding('utf-8');
      for await (const chunk of process.stdin) { data += chunk; }
      await storage.append(args[0], data);
      break;
    }
    case 'list': {
      const entries = await storage.list(args[0]);
      process.stdout.write(entries.join('\n') + '\n');
      break;
    }
    case 'exists': {
      const exists = await storage.exists(args[0]);
      process.stdout.write(exists ? 'true\n' : 'false\n');
      process.exit(exists ? 0 : 1);
      break;
    }
    default:
      process.stderr.write(`Unknown command: ${command}\nUsage: storage-cli <read|write|append|list|exists> <path>\n`);
      process.exit(1);
  }
}
main().catch((err) => { process.stderr.write(`Error: ${err.message}\n`); process.exit(1); });
