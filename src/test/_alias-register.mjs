import { register } from 'node:module';
register(new URL('../../test/_alias-loader.mjs', import.meta.url), import.meta.url);