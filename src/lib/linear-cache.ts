import type {
  Issue,
  IssueLabelConnection,
  User,
  WorkflowState,
  IssueLabel,
  WorkflowState as WorkflowStateType,
} from "@linear/sdk";

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

    this.set(id, promise);
    return promise;
  }
}

class LinearCache {
  private userCache = new TimedCache<User>(120_000, "user");
  private issueCache = new TimedCache<Issue>(60_000, "issue");
  private issueLabelsCache = new TimedCache<IssueLabelConnection>(60_000, "issue labels");
  private issueStateCache = new TimedCache<WorkflowState>(60_000, "issue state");
  private teamLabelsCache = new TimedCache<IssueLabel[]>(60_000, "team labels");
  private teamStatesCache = new TimedCache<WorkflowStateType[]>(60_000, "team states");
  private userTeamsCache = new TimedCache<string[]>(600_000, "user teams");

  getOrSetUser = (id: string, promise: Promise<User>) =>
    this.userCache.getOrSet(id, promise);

  getOrSetIssue = (id: string, promise: Promise<Issue>) =>
    this.issueCache.getOrSet(id, promise);

  getOrSetLabels = (id: string, promise: Promise<IssueLabelConnection>) =>
    this.issueLabelsCache.getOrSet(id, promise);

  getOrSetState = (id: string, promise: Promise<WorkflowState>) =>
    this.issueStateCache.getOrSet(id, promise);

  getOrSetTeamLabels = (teamId: string, promise: Promise<IssueLabel[]>) =>
    this.teamLabelsCache.getOrSet(teamId, promise);

  getOrSetTeamStates = (teamId: string, promise: Promise<WorkflowStateType[]>) =>
    this.teamStatesCache.getOrSet(teamId, promise);

  getOrSetUserTeams = (userId: string, promise: Promise<string[]>) =>
    this.userTeamsCache.getOrSet(userId, promise);
}

export const linearCache = new LinearCache();
