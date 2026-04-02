import { LinearClient } from "@linear/sdk";
import { linearCache } from "./linear-cache";
import { env } from "@/env";

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

export interface OAuthTokens {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
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

  static async refreshLinearToken(refreshToken: string): Promise<OAuthTokens> {
    const tokenResponse = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: env.LINEAR_CLIENT_ID!,
        client_secret: env.LINEAR_CLIENT_SECRET!,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to refresh token");
    }

    return (await tokenResponse.json()) as OAuthTokens;
  }
}

export class Linear {
  public client: LinearClient;
  static helpers = LinearHelpers;

  constructor(token: string) {
    this.client = new LinearClient({ apiKey: token });
  }

  async getUserTeamIds() {
    const result = await this.client.teams();
    const nodes = result.nodes.map((e) => e.id);
    return nodes;
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

  async getStatesOfTeam(teamId: string) {
    const result = await (await this.client.team(teamId)).states();
    const nodes = result.nodes;
    return nodes;
  }

  async getLabelsOfTeam(teamId: string) {
    const result = await linearCache.issueLabels.getOrSet(
      teamId,
      this.client.team(teamId).then((e) => e.labels()),
    );
    const nodes = result.nodes;
    return nodes;
  }

  async getMemberById(teamId: string, userId: string) {
    const result = await linearCache.user.getOrSet(
      userId,
      this.client
        .team(teamId)
        .then((a) =>
          a.members({ filter: { id: { eq: userId } } }).then((a) => a.nodes[0]!),
        ),
    );

    if (!result) return null;

    return result;
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

  async getViewer() {
    const viewer = await this.client.viewer;
    return viewer;
  }
}
