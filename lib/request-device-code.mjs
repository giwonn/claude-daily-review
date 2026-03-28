#!/usr/bin/env node
import { requestDeviceCode } from './github-auth.mjs';
const r = await requestDeviceCode();
console.log(JSON.stringify(r));
