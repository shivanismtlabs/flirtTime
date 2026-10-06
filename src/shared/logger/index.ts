import pino from 'pino';
import { env } from '../config/index.js';

export const logger = pino({
  name: env.APP_NAME,
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            messageFormat: '{msg}',
            // Keep our icons visible; hide noisy bindings in boot logs
            singleLine: false,
          },
        }
      : undefined,
});

export type Logger = typeof logger;

export { status, ok, fail, warn, step, skip, banner } from './status.js';
export { LogChannel } from './channels.js';
