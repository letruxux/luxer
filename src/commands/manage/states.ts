import type { Message } from "@fluxerjs/core";
import type { WorkflowState } from "@linear/sdk";
import { Linear } from "@/lib/linear";
import { linearCache } from "@/lib/linear-cache";
import { textEmbedOf } from "@/utils";
import { showEntityList, showEntityOptions, handleRenameEntity } from "./shared";

const RENAME_EMOJI = "✏️";
const ARCHIVE_EMOJI = "📦";
const BACK_EMOJI = "↩️";

const STATE_TYPES = [
  { type: "unstarted", label: "Unstarted", emoji: "⚪" },
  { type: "started", label: "Started", emoji: "🟢" },
  { type: "completed", label: "Completed", emoji: "✅" },
  { type: "canceled", label: "Canceled", emoji: "🔴" },
] as const;

const STATE_OPTIONS = [
  { emoji: ARCHIVE_EMOJI, action: "Archive" },
  { emoji: RENAME_EMOJI, action: "Rename" },
  { emoji: BACK_EMOJI, action: "Back" },
];

async function getStatesIgnoreCache(
  linear: Linear,
  teamId: string,
): Promise<WorkflowState[]> {
  linearCache.teamStates.invalidate(teamId);
  return await linear.getStatesOfTeam(teamId);
}

function renderState(state: WorkflowState, index: number): string {
  const icon =
    state.type === "started"
      ? "🟢"
      : state.type === "canceled"
        ? "🔴"
        : state.type === "completed"
          ? "✅"
          : "⚪";
  const archived = (state as { archivedAt?: string }).archivedAt ? " 📦" : "";
  return `${icon} ${state.name} (${state.type})${archived}`;
}

export async function handleStates(
  msg: Message,
  args: string[],
  linear: Linear,
  teamId: string,
): Promise<void> {
  const teamStates = await getStatesIgnoreCache(linear, teamId);
  const action = args[1]?.toLowerCase();

  if (action === "add") {
    const stateName = args.slice(2).join(" ").trim();
    if (!stateName) {
      await msg.reply(textEmbedOf("Please provide a state name.", { color: 0xff0000 }));
      return;
    }

    const existing = teamStates.find(
      (s) => s.name.toLowerCase() === stateName.toLowerCase(),
    );
    if (existing) {
      await msg.reply(
        textEmbedOf(`State ${stateName} already exists.`, { color: 0xff0000 }),
      );
      return;
    }

    const selectedType = await selectStateType(msg);
    if (!selectedType) return;

    const result = await linear.client.createWorkflowState({
      name: stateName,
      teamId: teamId,
      color: "#666666",
      type: selectedType.type,
    });

    if (!result.success) {
      await msg.reply(textEmbedOf("Failed to create state.", { color: 0xff0000 }));
      return;
    }

    await msg.reply({
      embeds: [
        new (await import("@/utils/embed-builder")).EmbedBuilder()
          .setTitle("State Created!")
          .setDescription(`State ${stateName} has been created.`)
          .setColor(0x00ff00),
      ],
    });
    return;
  }

  await showStatesList(msg, linear, teamId, teamStates);
}

async function selectStateType(
  msg: Message,
): Promise<(typeof STATE_TYPES)[number] | null> {
  const typeEmojis = STATE_TYPES.map((t) => t.emoji);
  const typeList = STATE_TYPES.map((t) => `${t.emoji} ${t.label}`).join("\n");

  const typeMsg = await msg.reply({
    embeds: [
      new (await import("@/utils/embed-builder")).EmbedBuilder()
        .setTitle("Select State Type")
        .setDescription(typeList)
        .setColor(0x00ff00),
    ],
  });

  const typeResp = await msg.client.handlers.reaction.wait(typeMsg, {
    allowedUserIds: [msg.author.id],
    allowedEmojis: typeEmojis,
    timeout: 120_000,
  });

  if (!typeResp) {
    await typeMsg.edit(textEmbedOf("Took too long!", { color: 0xff0000 }));
    msg.client.handlers.reaction.clearReactionCacheForMessage(typeMsg.id);
    await typeMsg.removeAllReactions();
    return null;
  }

  const selectedType = STATE_TYPES.find((t) => t.emoji === typeResp.emoji.name);
  await typeMsg.removeAllReactions();

  return selectedType ?? null;
}

async function showStatesList(
  msg: Message,
  linear: Linear,
  teamId: string,
  teamStates: WorkflowState[],
): Promise<void> {
  await showEntityList({
    msg,
    linear,
    teamId,
    entityName: "state",
    entities: teamStates,
    refreshEntities: () => getStatesIgnoreCache(linear, teamId),
    renderItem: renderState,
    showOptions: (state, states) => showStateOptions(msg, linear, teamId, state, states),
    onAdd: async (name) => {
      const selectedType = await selectStateType(msg);
      if (!selectedType) return false;

      const result = await linear.client.createWorkflowState({
        name,
        teamId,
        color: "#666666",
        type: selectedType.type,
      });
      return result.success;
    },
  });
}

async function showStateOptions(
  msg: Message,
  linear: Linear,
  teamId: string,
  selectedState: WorkflowState,
  teamStates: WorkflowState[],
): Promise<void> {
  const msgResp = await msg.reply({
    embeds: [
      new (await import("@/utils/embed-builder")).EmbedBuilder()
        .setTitle(`State: ${selectedState.name}`)
        .setDescription(
          `${ARCHIVE_EMOJI} Archive | ${RENAME_EMOJI} Rename | ${BACK_EMOJI} Back`,
        )
        .setColor(0x00ff00),
    ],
  });

  await showEntityOptions({
    msg,
    msgResp,
    entity: selectedState,
    entities: teamStates,
    entityName: "state",
    options: STATE_OPTIONS,
    onSelect: async (emoji) => {
      if (emoji === ARCHIVE_EMOJI) {
        const confirmed = await confirmArchive(msg, msgResp, selectedState.name);
        if (!confirmed) {
          const refreshed = await getStatesIgnoreCache(linear, teamId);
          await showStatesList(msg, linear, teamId, refreshed);
          return;
        }

        const result = await linear.client.archiveWorkflowState(selectedState.id);
        if (!result.success) {
          await msgResp.edit(
            textEmbedOf("Failed to archive state.", { color: 0xff0000 }),
          );
          return;
        }

        const refreshed = await getStatesIgnoreCache(linear, teamId);
        await showStatesList(msg, linear, teamId, refreshed);
        return;
      }

      if (emoji === RENAME_EMOJI) {
        const refreshed = await handleRenameEntity(
          msg,
          msgResp,
          selectedState,
          "state",
          teamStates,
          async (newName) => {
            const result = await linear.client.updateWorkflowState(selectedState.id, {
              name: newName,
            });
            return result.success;
          },
          () => getStatesIgnoreCache(linear, teamId),
        );
        if (refreshed) {
          await showStatesList(msg, linear, teamId, refreshed);
        }
      }
    },
    onBack: async () => {
      const refreshed = await getStatesIgnoreCache(linear, teamId);
      await showStatesList(msg, linear, teamId, refreshed);
    },
  });
}

async function confirmArchive(
  msg: Message,
  msgResp: Message,
  stateName: string,
): Promise<boolean> {
  const { YES_EMOJI, YES_NO_EMOJIS } = await import("@/handlers/reaction-handler");
  const { handleTimeout } = await import("@/utils/ui-helpers");

  await msgResp.edit({
    embeds: [
      new (await import("@/utils/embed-builder")).EmbedBuilder()
        .setTitle(`Archive ${stateName}?`)
        .setDescription("React with ✅ to confirm or ❌ to cancel")
        .setColor(0xffaa00),
    ],
  });

  const confirmResp = await msg.client.handlers.reaction.wait(msgResp, {
    allowedUserIds: [msg.author.id],
    allowedEmojis: YES_NO_EMOJIS,
    timeout: 120_000,
  });

  if (!confirmResp || confirmResp.emoji.name !== YES_EMOJI) {
    await msgResp.removeAllReactions();
    return false;
  }

  await msgResp.removeAllReactions();
  return true;
}
