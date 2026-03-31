import { LinearClient, Team } from "@linear/sdk";

export interface LinearIssue {
  id: string;
  title: string;
  identifier: string;
  url: string;
  state?: {
    name: string;
  };
}

export interface LinearTeam {
  id: string;
  name: string;
}

export interface LinearComment {
  id: string;
  body: string;
  url: string;
}

export interface LinearUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

class LinearHelpers {
  static getDayAgo = () => {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return dayAgo;
  };

  static countIssuesPerState = (issues: LinearIssue[]) => {
    const counts = issues.reduce(
      (acc, issue) => {
        const state = issue.state?.name;
        if (!state) return acc;
        acc[state] = (acc[state] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return counts;
  };
}

export class Linear {
  private client: LinearClient;
  static helpers = LinearHelpers;

  constructor(token: string) {
    this.client = new LinearClient({ apiKey: token });
  }

  async changeIssueState(issueId: string, state: string): Promise<LinearIssue> {
    const result = await this.client.updateIssue(issueId, {
      stateId: state,
    });

    if (!result.success) {
      throw new Error("Failed to change issue state");
    }

    const issue = await result.issue;
    if (!issue) {
      throw new Error("Failed to change issue state");
    }

    return {
      id: issue.id,
      title: issue.title ?? "",
      identifier: issue.identifier ?? "",
      url: issue.url ?? "",
      state: issue.state ? { name: (await issue.state).name ?? "" } : undefined,
    };
  }

  async getTeams(): Promise<LinearTeam[]> {
    const result = await this.client.teams();
    const nodes = result.nodes;
    return nodes.map((team) => ({
      id: team.id,
      createdAt: team.createdAt,
      name: team.name ?? "",
    }));
  }

  async createIssue(
    title: string,
    description: string,
    teamId: string,
  ): Promise<LinearIssue> {
    const result = await this.client.createIssue({
      title,
      description,
      teamId,
    });

    if (!result.success || !result.issue) {
      throw new Error("Failed to create issue");
    }

    await result.issue;
    const issue = await result.issue;
    return {
      id: issue.id,
      title: issue.title ?? "",
      identifier: issue.identifier ?? "",
      url: issue.url ?? "",
    };
  }

  async searchIssues(query: string): Promise<LinearIssue[]> {
    const result = await this.client.issues({
      filter: {
        id: { eq: query },
      },
    });
    const nodes = result.nodes;
    const issues: LinearIssue[] = [];

    for await (const issue of nodes) {
      const state = await issue.state;
      issues.push({
        id: issue.id,
        title: issue.title ?? "",
        identifier: issue.identifier ?? "",
        url: issue.url ?? "",
        state: state ? { name: state.name ?? "" } : undefined,
      });
    }

    return issues;
  }

  async getCompletedIssues(
    teamId: string,
    {
      since,
    }: {
      since?: Date;
    },
  ): Promise<LinearIssue[]> {
    const issuesResult = await this.client.issues({
      filter: { updatedAt: { gte: since } },
    });

    const issues: LinearIssue[] = [];

    for await (const issue of issuesResult.nodes) {
      const team = await issue.team;
      const state = await issue.state;

      if (team?.id === teamId && state?.name === "Done") {
        issues.push({
          id: issue.id,
          title: issue.title ?? "",
          identifier: issue.identifier ?? "",
          url: issue.url ?? "",
        });
      }
    }

    return issues;
  }

  async getAllIssues(
    teamId: string,
    {
      since,
    }: {
      since?: Date;
    },
  ): Promise<LinearIssue[]> {
    const issuesResult = await this.client.issues({
      filter: {
        team: { id: { eq: teamId } },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
    });

    const issues: LinearIssue[] = [];

    for await (const issue of issuesResult.nodes) {
      const state = await issue.state;
      issues.push({
        id: issue.id,
        title: issue.title ?? "",
        identifier: issue.identifier ?? "",
        url: issue.url ?? "",
        state: state ? { name: state.name ?? "" } : undefined,
      });
    }

    return issues;
  }

  async createComment(issueId: string, body: string): Promise<LinearComment> {
    const result = await this.client.createComment({
      issueId,
      body,
    });

    if (!result.success) {
      throw new Error("Failed to create comment");
    }

    const comment = await result.comment;
    if (!comment) {
      throw new Error("Failed to create comment");
    }

    return {
      id: comment.id,
      body: comment.body ?? "",
      url: comment.url ?? "",
    };
  }

  async getViewer(): Promise<LinearUser> {
    const viewer = await this.client.viewer;
    return {
      id: viewer.id,
      name: viewer.name ?? "",
      email: viewer.email ?? "",
      avatarUrl: viewer.avatarUrl ?? undefined,
    };
  }
}
