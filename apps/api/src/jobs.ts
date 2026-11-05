import { QUEUE } from "@avt/shared";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

/** Hands work to the worker process. The API never runs captures itself. */
@Injectable()
export class Jobs implements OnModuleDestroy {
  private readonly connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null, lazyConnect: true });
  private readonly maintenance = new Queue(QUEUE.maintenance, { connection: this.connection });

  async startRun(brandId: string) {
    await this.enqueue("start-run", brandId);
  }

  /** Brand-level background work handled by the worker: "insights", "site-check". */
  async enqueue(name: "start-run" | "insights" | "site-check", brandId: string) {
    await this.maintenance.add(name, { brandId }, { removeOnComplete: 100, removeOnFail: 100 });
  }

  async onModuleDestroy() {
    await this.maintenance.close();
    this.connection.disconnect();
  }
}
