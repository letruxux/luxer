import type {
  Issue,
  IssueLabelConnection,
  User,
  WorkflowState,
  IssueLabel,
  WorkflowState as WorkflowStateType,
} from "@linear/sdk";
import { hexToTerminal, Logger } from "./logger";

type CacheEntry<T> = {
  value: Promise<T>;
  expiresAt: number;
};

const logger = new Logger(`${hexToTerminal("#2f9")}[cache]${Logger.resetColor}`, "#fff");

class TimedCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  constructor(
    private ttlMs: number,
    private name: string,
  ) {}

  async get(id: string): Promise<T | null> {
    const entry = this.cache.get(id);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(id);
      return null;
    }

    return entry.value;
  }

  async set(id: string, promise: Promise<T>) {
    this.cache.set(id, { value: promise, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(id: string) {
    this.cache.delete(id);
  }

  async getOrSet(id: string, promise: Promise<T>): Promise<T> {
    const existing = await this.get(id);
    logger.dim("! using cached item for", this.name);
    if (existing) return existing;

    logger.dim("X cache failed for", this.name);
    this.set(id, promise);
    return promise;
  }
}

class LinearCache {
  user = new TimedCache<User>(120_000, "user");
  issue = new TimedCache<Issue>(60_000, "issue");
  issueLabels = new TimedCache<IssueLabelConnection>(60_000, "issue labels");
  issueState = new TimedCache<WorkflowState>(60_000, "issue state");
  teamLabels = new TimedCache<IssueLabel[]>(60_000, "team labels");
  teamStates = new TimedCache<WorkflowStateType[]>(60_000, "team states");
  userTeams = new TimedCache<string[]>(600_000, "user teams");
}

export const linearCache = new LinearCache();
