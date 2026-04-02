import type { Message } from "@fluxerjs/core";
import type { IssueLabel } from "@linear/sdk";
import { Linear } from "@/lib/linear";
import { linearCache } from "@/lib/linear-cache";
import { textEmbedOf } from "@/utils";
import {
  showEntityList,
  showEntityOptions,
  handleDeleteEntity,
  handleRenameEntity,
} from "./shared";

const RENAME_EMOJI = "✏️";
const DELETE_EMOJI = "🗑️";
const BACK_EMOJI = "↩️";

const LABEL_OPTIONS = [
  { emoji: RENAME_EMOJI, action: "Rename" },
  { emoji: DELETE_EMOJI, action: "Delete" },
  { emoji: BACK_EMOJI, action: "Back" },
];

async function getLabelsIgnoreCache(
  linear: Linear,
  teamId: string,
): Promise<IssueLabel[]> {
  linearCache.teamLabels.invalidate(teamId);
  return await linear.getLabelsOfTeam(teamId);
}

export async function handleLabels(
  msg: Message,
  args: string[],
  linear: Linear,
  teamId: string,
): Promise<void> {
  const teamLabels = await getLabelsIgnoreCache(linear, teamId);
  const action = args[1]?.toLowerCase();

  if (action === "add") {
    const labelName = args.slice(2).join(" ").trim();
    if (!labelName) {
      await msg.reply(textEmbedOf("Please provide a label name.", { color: 0xff0000 }));
      return;
    }

    const existing = teamLabels.find(
      (l) => l.name.toLowerCase() === labelName.toLowerCase(),
    );
    if (existing) {
      await msg.reply(
        textEmbedOf(`Label ${labelName} already exists.`, { color: 0xff0000 }),
      );
      return;
    }

    const result = await linear.client.createIssueLabel({
      name: labelName,
      teamId: teamId,
    });

    if (!result.success) {
      await msg.reply(textEmbedOf("Failed to create label.", { color: 0xff0000 }));
      return;
    }

    await msg.reply({
      embeds: [
        new (await import("@/utils/embed-builder")).EmbedBuilder()
          .setTitle("Label Created!")
          .setDescription(`Label ${labelName} has been created.`)
          .setColor(0x00ff00),
      ],
    });
    return;
  }

  await showLabelsList(msg, linear, teamId, teamLabels);
}

async function showLabelsList(
  msg: Message,
  linear: Linear,
  teamId: string,
  teamLabels: IssueLabel[],
): Promise<void> {
  await showEntityList({
    msg,
    linear,
    teamId,
    entityName: "label",
    entities: teamLabels,
    refreshEntities: () => getLabelsIgnoreCache(linear, teamId),
    renderItem: (label) => label.name,
    showOptions: (label, labels) => showLabelOptions(msg, linear, teamId, label, labels),
    onAdd: async (name) => {
      const result = await linear.client.createIssueLabel({
        name,
        teamId,
      });
      return result.success;
    },
  });
}

async function showLabelOptions(
  msg: Message,
  linear: Linear,
  teamId: string,
  selectedLabel: IssueLabel,
  teamLabels: IssueLabel[],
): Promise<void> {
  const msgResp = await msg.reply({
    embeds: [
      new (await import("@/utils/embed-builder")).EmbedBuilder()
        .setTitle(`Label: ${selectedLabel.name}`)
        .setDescription(
          `${RENAME_EMOJI} Rename | ${DELETE_EMOJI} Delete | ${BACK_EMOJI} Back`,
        )
        .setColor(0x00ff00),
    ],
  });

  await showEntityOptions({
    msg,
    msgResp,
    entity: selectedLabel,
    entities: teamLabels,
    entityName: "label",
    options: LABEL_OPTIONS,
    onSelect: async (emoji) => {
      if (emoji === DELETE_EMOJI) {
        const refreshed = await handleDeleteEntity(
          msg,
          msgResp,
          selectedLabel,
          "label",
          async () => {
            const result = await linear.client.deleteIssueLabel(selectedLabel.id);
            return result.success;
          },
          () => getLabelsIgnoreCache(linear, teamId),
        );
        if (refreshed) {
          await showLabelsList(msg, linear, teamId, refreshed);
        }
        return;
      }

      if (emoji === RENAME_EMOJI) {
        const refreshed = await handleRenameEntity(
          msg,
          msgResp,
          selectedLabel,
          "label",
          teamLabels,
          async (newName) => {
            const result = await linear.client.updateIssueLabel(selectedLabel.id, {
              name: newName,
            });
            return result.success;
          },
          () => getLabelsIgnoreCache(linear, teamId),
        );
        if (refreshed) {
          await showLabelsList(msg, linear, teamId, refreshed);
        }
      }
    },
    onBack: async (labels) => {
      const refreshed = await getLabelsIgnoreCache(linear, teamId);
      await showLabelsList(msg, linear, teamId, refreshed);
    },
  });
}
