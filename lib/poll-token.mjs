#!/usr/bin/env node
import { pollForToken } from './github-auth.mjs';
const deviceCode = JSON.parse(process.argv[2]);
const token = await pollForToken(deviceCode);
console.log(token);
