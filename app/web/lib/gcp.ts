import "server-only";
import { Storage } from "@google-cloud/storage";

const globalGcp = globalThis as unknown as {
  storage?: Storage;
  tasks?: {
    queuePath: (project: string, location: string, queue: string) => string;
    createTask: (args: Record<string, unknown>) => Promise<unknown>;
  };
};

export function getStorageClient(): Storage {
  if (!globalGcp.storage) {
    globalGcp.storage = new Storage();
  }
  return globalGcp.storage;
}

export function getTasksClient() {
  if (!globalGcp.tasks) {
    // Avoid Next.js build-time ESM resolution issue in @google-cloud/tasks.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CloudTasksClient } = require("@google-cloud/tasks");
    globalGcp.tasks = new CloudTasksClient();
  }
  return globalGcp.tasks!;
}

export function getRequiredEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}
