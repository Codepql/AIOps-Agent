import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.debug ? 'debug' : 'info',
  redact: ['dashscopeApiKey', 'apiKey', '*.apiKey', 'headers.authorization'],
});
