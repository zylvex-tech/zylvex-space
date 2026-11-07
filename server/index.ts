import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiApp } from './app';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.ZYLVEX_DATA_FILE ?? path.resolve(currentDirectory, '../var/zylvex-space.json');
const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT must be a valid TCP port');

const { app } = createApiApp({ dataFile, secureCookies: process.env.NODE_ENV === 'production' });
const server = createServer(app);
server.listen(port, host, () => console.log(`ZYLVEX SPACE API listening on http://${host}:${port}`));

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
