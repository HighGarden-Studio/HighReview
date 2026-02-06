import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { authRoutes } from './routes/auth.routes.js';
import { prRoutes } from './routes/pr.routes.js';
import { fsRoutes } from './routes/fs.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import { indexRoutes } from './routes/index.routes.js';
import { repositoriesRoutes } from './routes/repositories.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { indexingRoutes } from './routes/indexing.routes.js';
import { CronService } from './services/CronService.js';
import { getFileWatcherService } from './services/FileWatcherService.js';
import { DatabaseService } from './services/DatabaseService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function startServer(port: number) {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'development' ? 'info' : 'warn',
    },
  });

  // WebSocket 플러그인 등록
  await fastify.register(fastifyWebsocket);

  // CORS 설정 (개발 모드에서 Vite dev server와 통신)
  await fastify.register(fastifyCors, {
    origin: ['http://localhost:5273', 'http://127.0.0.1:5273'],
    credentials: true,
  });

  // API 라우트 예시
  fastify.get('/api/health', async () => {
    return { status: 'ok', message: 'HighReview API is running' };
  });

  fastify.get('/api/hello', async () => {
    return { message: 'Hello from HighReview backend!' };
  });

  // Auth 라우트 등록
  await fastify.register(authRoutes);

  // PR 관련 라우트 등록
  await fastify.register(prRoutes);

  // 파일 시스템 라우트 등록
  await fastify.register(fsRoutes);

  // AI 라우트 등록
  await fastify.register(aiRoutes);

  // Index 라우트 등록
  await fastify.register(indexRoutes);

  // Repositories 라우트 등록
  await fastify.register(repositoriesRoutes);

  // Settings 라우트 등록
  await fastify.register(settingsRoutes);

  // Indexing 라우트 등록
  await fastify.register(indexingRoutes);

  // Initialize cron jobs
  const cronService = CronService.getInstance();
  await cronService.initializeJobs();
  console.log(`[Server] Initialized ${cronService.getActiveJobsCount()} cron jobs`);



  // 프로덕션 모드에서 빌드된 프론트엔드 정적 파일 서빙
  const publicPath = join(__dirname, '..', 'public');
  if (existsSync(publicPath)) {
    await fastify.register(fastifyStatic, {
      root: publicPath,
      prefix: '/',
    });

    // SPA를 위한 fallback
    fastify.setNotFoundHandler((request, reply) => {
      if (!request.url.startsWith('/api')) {
        reply.sendFile('index.html');
      } else {
        reply.code(404).send({ error: 'Not Found' });
      }
    });
  }

  await fastify.listen({ port, host: '0.0.0.0' });

  // Increase timeout for long-running AI requests (60 minutes for slow local LLMs)
  fastify.server.setTimeout(3600000);

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal}, starting graceful shutdown...`);

    try {
      // Stop all file watchers
      const watcherService = getFileWatcherService();
      await watcherService.stopAll();
      console.log('[Server] Stopped all file watchers');

      // Close Fastify server
      await fastify.close();
      console.log('[Server] Server closed successfully');

      process.exit(0);
    } catch (error) {
      console.error('[Server] Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return fastify;
}
