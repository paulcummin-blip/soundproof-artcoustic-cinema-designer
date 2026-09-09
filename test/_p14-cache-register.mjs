// _p14-cache-register.mjs — registers the custom loader for P14 target cache tests.
import { register } from 'node:module';
register('./_p14-cache-loader.mjs', import.meta.url);