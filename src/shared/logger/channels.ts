/** Channel markers for PM2 / terminal logs — easy to scan. */
export const LogChannel = {
  api: '🌐',
  socket: '🔌',
  admin: '🛡️',
} as const;

export type LogChannelKey = keyof typeof LogChannel;
