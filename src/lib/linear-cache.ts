import type { Issue, IssueLabelConnection, User, WorkflowState } from "@linear/sdk";

type CacheEntry<T> = {
  value: Promise<T>;
  expiresAt: number;
};

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

  async getOrSet(id: string, promise: Promise<T>): Promise<T> {
    const existing = await this.get(id);
    if (existing) return existing;
    console.log("get or set failed", id, this.name);

    this.set(id, promise);
    return promise;
  }
}

class LinearCache {
  private userCache = new TimedCache<User>(120_000, "user");
  private issueCache = new TimedCache<Issue>(60_000, "issue");
  private issueLabelsCache = new TimedCache<IssueLabelConnection>(60_000, "issue labels");
  private issueStateCache = new TimedCache<WorkflowState>(60_000, "issue state");

  // user
  getUser = (id: string) => this.userCache.get(id);
  setUser = (id: string, promise: Promise<User>) => this.userCache.set(id, promise);
  getOrSetUser = (id: string, promise: Promise<User>) =>
    this.userCache.getOrSet(id, promise);

  // issue
  getIssue = (id: string) => this.issueCache.get(id);
  setIssue = (id: string, promise: Promise<Issue>) => this.issueCache.set(id, promise);
  getOrSetIssue = (id: string, promise: Promise<Issue>) =>
    this.issueCache.getOrSet(id, promise);

  // labels
  getLabels = (id: string) => this.issueLabelsCache.get(id);
  setLabels = (id: string, promise: Promise<IssueLabelConnection>) =>
    this.issueLabelsCache.set(id, promise);
  getOrSetLabels = (id: string, promise: Promise<IssueLabelConnection>) =>
    this.issueLabelsCache.getOrSet(id, promise);

  // state
  getState = (id: string) => this.issueStateCache.get(id);
  setState = (id: string, promise: Promise<WorkflowState>) =>
    this.issueStateCache.set(id, promise);
  getOrSetState = (id: string, promise: Promise<WorkflowState>) =>
    this.issueStateCache.getOrSet(id, promise);
}

export const linearCache = new LinearCache();
