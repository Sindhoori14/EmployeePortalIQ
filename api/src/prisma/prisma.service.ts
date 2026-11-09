import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaService');
  private keepAliveTimer?: NodeJS.Timeout;

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    let connected = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Prisma connected to Neon PostgreSQL successfully.');
        connected = true;
        break;
      } catch (err: any) {
        this.logger.warn(`Prisma connect attempt ${attempt}/3 failed: ${err.message}. Retrying in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    if (connected) {
      // Keep-alive ping every 3 minutes (180s) to prevent Neon from going to sleep
      this.keepAliveTimer = setInterval(async () => {
        try {
          await this.$queryRawUnsafe('SELECT 1;');
        } catch {
          // silently ignore keep-alive failure
        }
      }, 180_000);
      if (this.keepAliveTimer.unref) this.keepAliveTimer.unref();
    }
  }

  async onModuleDestroy() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    await this.$disconnect();
  }
}
