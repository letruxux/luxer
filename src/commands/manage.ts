import { type Message } from "@fluxerjs/core";
import { type Command } from "@/handlers/command-handler";
import { embedOf, textEmbedOf } from "@/utils";
import { EmbedBuilder } from "@/utils/embed-builder";
import { linearCache } from "@/lib/linear-cache";
import { Linear } from "@/lib/linear";
import type { IssueLabel, WorkflowState } from "@linear/sdk";
import { NUMBER_EMOJIS, YES_NO_EMOJIS, YES_EMOJI } from "@/handlers/reaction-handler";

const ARCHIVE_EMOJI = "📦";
const BACK_EMOJI = "↩️";
const DELETE_EMOJI = "🗑️";
const RENAME_EMOJI = "✏️";
const ADD_EMOJI = "➕";
const INTERACTION_TIMEOUT = 120_000;

const STATE_TYPES = [
  { type: "unstarted", label: "Unstarted", emoji: "⚪" },
  { type: "started", label: "Started", emoji: "🟢" },
  { type: "completed", label: "Completed", emoji: "✅" },
  { type: "canceled", label: "Canceled", emoji: "🔴" },
] as const;

async function getFreshLabels(linear: Linear, teamId: string): Promise<IssueLabel[]> {
  linearCache.teamLabels.invalidate(teamId);
  return await linear.getLabelsOfTeam(teamId);
}

async function getFreshStates(linear: Linear, teamId: string): Promise<WorkflowState[]> {
  linearCache.teamStates.invalidate(teamId);
  return await linear.getStatesOfTeam(teamId);
}

export const manage = {
  name: "manage",
  description: "Manage team labels and states",
  guildOnly: true,
  requireConfig: true,
  adminOnly: true,
  requireAccountLinked: true,

  aliases: [],
  async execute(msg: Message, args: string[], extra) {
    const linear = extra.userLinear!;
    const teamId = extra.config!.teamId!;
    const subcommand = args[0]?.toLowerCase();

    if (!subcommand || !["labels", "states"].includes(subcommand)) {
      const prefix = await msg.client.handlers.command.getPrefix(msg);
      await msg.reply(
        textEmbedOf(
          `Use \`${prefix}manage labels\` or \`${prefix}manage states\` to manage team labels or states.`,
          { title: "Manage command" },
        ),
      );
      return;
    }

    if (subcommand === "labels") {
      await handleLabels(msg, args, linear, teamId);
    } else if (subcommand === "states") {
      await handleStates(msg, args, linear, teamId);
    }
  },
} satisfies Command;

async function handleLabels(
  msg: Message,
  args: string[],
  linear: Linear,
  teamId: string,
) {
  const teamLabels = await getFreshLabels(linear, teamId);

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

    await getFreshLabels(linear, teamId);

    await msg.reply(
      embedOf(
        new EmbedBuilder()
          .setTitle("Label Created!")
          .setDescription(`Label ${labelName} has been created.`)
          .setColor(0x00ff00),
      ),
    );
    return;
  }

  await showLabelsList(msg, args, linear, teamId, teamLabels);
}

async function showLabelsList(
  msg: Message,
  args: string[],
  linear: Linear,
  teamId: string,
  teamLabels: IssueLabel[],
  existingMsg?: Message,
) {
  const emojiList = NUMBER_EMOJIS.slice(0, teamLabels.length);
  const labelList = teamLabels.length
    ? teamLabels.map((l, i) => `${emojiList[i]} ${l.name}`).join("\n")
    : "No labels";

  const msgResp = existingMsg
    ? await existingMsg.edit(
        embedOf(
          new EmbedBuilder()
            .setTitle("Team Labels")
            .setDescription(labelList)
            .addFields({
              name: "Actions",
              value: `${ADD_EMOJI} Add`,
            })
            .setColor(0x00ff00),
        ),
      )
    : await msg.reply(
        embedOf(
          new EmbedBuilder()
            .setTitle("Team Labels")
            .setDescription(labelList)
            .addFields({
              name: "Actions",
              value: `${ADD_EMOJI} Add`,
            })
            .setColor(0x00ff00),
        ),
      );

  const allEmojis = [...emojiList, ADD_EMOJI];

  const resp = await msg.client.handlers.reaction.wait(msgResp, {
    allowedUserIds: [msg.author.id],
    allowedEmojis: allEmojis,
    timeout: INTERACTION_TIMEOUT,
  });

  if (!resp) {
    await msgResp.edit(textEmbedOf("Took too long!", { color: 0xff0000 }));
    msg.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);
    await msgResp.removeAllReactions();
    return;
  }

  const emojiName = resp.emoji.name;
  await msgResp.removeAllReactions();

  if (emojiName === ADD_EMOJI) {
    await msgResp.edit(
      textEmbedOf("Send the new label name (or 'cancel' to abort)", {
        title: "Add Label",
      }),
    );
    msg.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);

    const nameMsg = await msg.client.handlers.textInput.waitForMessage(msg.channelId, {
      allowedUserId: msg.author.id,
      timeout: INTERACTION_TIMEOUT,
    });

    if (!nameMsg) {
      await msgResp.edit(textEmbedOf("Took too long!", { color: 0xff0000 }));
      msg.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);
      return;
    }

    const newLabelName = nameMsg.content.trim();
    await nameMsg.delete();

    if (newLabelName.toLowerCase() === "cancel") {
      const refreshedLabels = await getFreshLabels(linear, teamId);
      await showLabelsList(msg, args, linear, teamId, refreshedLabels);
      return;
    }

    if (!newLabelName) {
      await msgResp.edit(textEmbedOf("Name cannot be empty.", { color: 0xff0000 }));
      return;
    }

    const duplicate = teamLabels.find(
      (l) => l.name.toLowerCase() === newLabelName.toLowerCase(),
    );
    if (duplicate) {
      await msgResp.edit(
        textEmbedOf(`Label ${newLabelName} already exists.`, { color: 0xff0000 }),
      );
      return;
    }

    const createResult = await linear.client.createIssueLabel({
      name: newLabelName,
      teamId: teamId,
    });

    if (!createResult.success) {
      await msgResp.edit(textEmbedOf("Failed to create label.", { color: 0xff0000 }));
      return;
    }

    const refreshedLabels = await getFreshLabels(linear, teamId);
    await showLabelsList(msg, args, linear, teamId, refreshedLabels);
    return;
  }

  const index = emojiList.indexOf(emojiName);
  if (index === -1) {
    return;
  }

  const selectedLabel = teamLabels[index]!;
  await showLabelOptions(msg, args, linear, teamId, selectedLabel, teamLabels);
}

async function showLabelOptions(
  msg: Message,
  args: string[],
  linear: Linear,
  teamId: string,
  selectedLabel: IssueLabel,
  teamLabels: IssueLabel[],
) {
  const msgResp = await msg.reply(
    embedOf(
      new EmbedBuilder()
        .setTitle(`Label: ${selectedLabel.name}`)
        .setDescription(
          `${RENAME_EMOJI} Rename | ${DELETE_EMOJI} Delete | ${BACK_EMOJI} Back`,
        )
        .setColor(0x00ff00),
    ),
  );

  const optionsResp = await msg.client.handlers.reaction.wait(msgResp, {
    allowedUserIds: [msg.author.id],
    allowedEmojis: [BACK_EMOJI, DELETE_EMOJI, RENAME_EMOJI],
    timeout: INTERACTION_TIMEOUT,
  });

  if (!optionsResp) {
    await msgResp.edit(textEmbedOf("Took too long!", { color: 0xff0000 }));
    msg.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);
    await msgResp.removeAllReactions();
    return;
  }

  const chosenEmoji = optionsResp.emoji.name;
  await msgResp.removeAllReactions();

  if (chosenEmoji === BACK_EMOJI) {
    msg.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);
    await showLabelsList(msg, args, linear, teamId, teamLabels, msgResp);
    return;
  }

  if (chosenEmoji === DELETE_EMOJI) {
    await msgResp.edit(
      embedOf(
        new EmbedBuilder()
          .setTitle(`Delete ${selectedLabel.name}?`)
          .setDescription("React with ✅ to confirm or ❌ to cancel")
          .setColor(0xffaa00),
      ),
    );

    const confirmResp = await msg.client.handlers.reaction.wait(msgResp, {
      allowedUserIds: [msg.author.id],
      allowedEmojis: YES_NO_EMOJIS,
      timeout: INTERACTION_TIMEOUT,
    });

    if (!confirmResp || confirmResp.emoji.name !== YES_EMOJI) {
      const refreshedLabels = await getFreshLabels(linear, teamId);
      await showLabelsList(msg, args, linear, teamId, refreshedLabels, msgResp);
      return;
    }

    await msgResp.removeAllReactions();

    const { success } = await linear.client.deleteIssueLabel(selectedLabel.id);

    if (!success) {
      await msgResp.edit(textEmbedOf("Failed to delete label.", { color: 0xff0000 }));
      return;
    }

    const refreshedLabels = await getFreshLabels(linear, teamId);
    await showLabelsList(msg, args, linear, teamId, refreshedLabels, msgResp);
    return;
  }

  if (chosenEmoji === RENAME_EMOJI) {
    await msgResp.edit(
      textEmbedOf("Send the new name for the label (or 'cancel' to abort)", {
        title: `Rename ${selectedLabel.name}`,
      }),
    );

    const nameMsg = await msg.client.handlers.textInput.waitForMessage(msg.channelId, {
      allowedUserId: msg.author.id,
      timeout: INTERACTION_TIMEOUT,
    });

    if (!nameMsg) {
      await msgResp.edit(textEmbedOf("Took too long!", { color: 0xff0000 }));
      msg.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);
      return;
    }

    const newName = nameMsg.content.trim();
    await nameMsg.delete();

    if (newName.toLowerCase() === "cancel") {
      await showLabelsList(msg, args, linear, teamId, teamLabels, msgResp);
      return;
    }

    if (!newName) {
      await msgResp.edit(textEmbedOf("Name cannot be empty.", { color: 0xff0000 }));
      return;
    }

    const duplicate = teamLabels.find(
      (l) => l.id !== selectedLabel.id && l.name.toLowerCase() === newName.toLowerCase(),
    );
    if (duplicate) {
      await msgResp.edit(
        textEmbedOf(`Label ${newName} already exists.`, { color: 0xff0000 }),
      );
      return;
    }

    const renameResult = await linear.client.updateIssueLabel(selectedLabel.id, {
      name: newName,
    });

    if (!renameResult.success) {
      await msgResp.edit(textEmbedOf("Failed to rename label.", { color: 0xff0000 }));
      return;
    }

    const refreshedLabels = await getFreshLabels(linear, teamId);
    await showLabelsList(msg, args, linear, teamId, refreshedLabels, msgResp);
  }
}

async function handleStates(
  msg: Message,
  args: string[],
  linear: Linear,
  teamId: string,
) {
  const teamStates = await getFreshStates(linear, teamId);

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

    const typeEmojis = STATE_TYPES.map((t) => t.emoji);
    const typeList = STATE_TYPES.map((t) => `${t.emoji} ${t.label}`).join("\n");

    const typeMsg = await msg.reply(
      embedOf(
        new EmbedBuilder()
          .setTitle("Select State Type")
          .setDescription(typeList)
          .setColor(0x00ff00),
      ),
    );

    const typeResp = await msg.client.handlers.reaction.wait(typeMsg, {
      allowedUserIds: [msg.author.id],
      allowedEmojis: typeEmojis,
      timeout: INTERACTION_TIMEOUT,
    });

    if (!typeResp) {
      await typeMsg.edit(textEmbedOf("Took too long!", { color: 0xff0000 }));
      msg.client.handlers.reaction.clearReactionCacheForMessage(typeMsg.id);
      await typeMsg.removeAllReactions();
      return;
    }

    const selectedType = STATE_TYPES.find((t) => t.emoji === typeResp.emoji.name);
    await typeMsg.removeAllReactions();

    if (!selectedType) {
      return;
    }

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

    await getFreshStates(linear, teamId);

    await msg.reply(
      embedOf(
        new EmbedBuilder()
          .setTitle("State Created!")
          .setDescription(`State ${stateName} has been created.`)
          .setColor(0x00ff00),
      ),
    );
    return;
  }

  await showStatesList(msg, args, linear, teamId, teamStates);
}

async function showStatesList(
  msg: Message,
  args: string[],
  linear: Linear,
  teamId: string,
  teamStates: WorkflowState[],
  existingMsg?: Message,
) {
  const emojiList = NUMBER_EMOJIS.slice(0, teamStates.length);
  const stateList = teamStates.length
    ? teamStates
        .map((s, i) => {
          const icon =
            s.type === "started"
              ? "🟢"
              : s.type === "canceled"
                ? "🔴"
                : s.type === "completed"
                  ? "✅"
                  : "⚪";
          const archived = (s as { archivedAt?: string }).archivedAt ? " 📦" : "";
          return `${emojiList[i]} ${icon} ${s.name} (${s.type})${archived}`;
        })
        .join("\n")
    : "No states";

  const msgResp = existingMsg
    ? await existingMsg.edit(
        embedOf(
          new EmbedBuilder()
            .setTitle("Team States")
            .setDescription(stateList)
            .addFields({
              name: "Actions",
              value: `${ADD_EMOJI} Add`,
            })
            .setColor(0x00ff00),
        ),
      )
    : await msg.reply(
        embedOf(
          new EmbedBuilder()
            .setTitle("Team States")
            .setDescription(stateList)
            .addFields({
              name: "Actions",
              value: `${ADD_EMOJI} Add`,
            })
            .setColor(0x00ff00),
        ),
      );

  const allEmojis = [...emojiList, ADD_EMOJI];

  const resp = await msg.client.handlers.reaction.wait(msgResp, {
    allowedUserIds: [msg.author.id],
    allowedEmojis: allEmojis,
    timeout: INTERACTION_TIMEOUT,
  });

  if (!resp) {
    await msgResp.edit(textEmbedOf("Took too long!", { color: 0xff0000 }));
    msg.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);
    await msgResp.removeAllReactions();
    return;
  }

  const emojiName = resp.emoji.name;
  await msgResp.removeAllReactions();

  if (emojiName === ADD_EMOJI) {
    await msgResp.edit(
      textEmbedOf("Send the new state name (or 'cancel' to abort)", {
        title: "Add State",
      }),
    );
    msg.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);

    const nameMsg = await msg.client.handlers.textInput.waitForMessage(msg.channelId, {
      allowedUserId: msg.author.id,
      timeout: INTERACTION_TIMEOUT,
    });

    if (!nameMsg) {
      await msgResp.edit(textEmbedOf("Took too long!", { color: 0xff0000 }));
      msg.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);
      return;
    }

    const newStateName = nameMsg.content.trim();
    await nameMsg.delete();

    if (newStateName.toLowerCase() === "cancel") {
      const refreshedStates = await getFreshStates(linear, teamId);
      await showStatesList(msg, args, linear, teamId, refreshedStates, msgResp);
      return;
    }

    if (!newStateName) {
      await msgResp.edit(textEmbedOf("Name cannot be empty.", { color: 0xff0000 }));
      return;
    }

    const duplicate = teamStates.find(
      (s) => s.name.toLowerCase() === newStateName.toLowerCase(),
    );
    if (duplicate) {
      await msgResp.edit(
        textEmbedOf(`State ${newStateName} already exists.`, { color: 0xff0000 }),
      );
      return;
    }

    const typeEmojis = STATE_TYPES.map((t) => t.emoji);
    const typeList = STATE_TYPES.map((t) => `${t.emoji} ${t.label}`).join("\n");

    await msgResp.edit(
      embedOf(
        new EmbedBuilder()
          .setTitle("Select State Type")
          .setDescription(typeList)
          .setColor(0x00ff00),
      ),
    );

    const typeResp = await msg.client.handlers.reaction.wait(msgResp, {
      allowedUserIds: [msg.author.id],
      allowedEmojis: typeEmojis,
      timeout: INTERACTION_TIMEOUT,
    });

    if (!typeResp) {
      await msgResp.edit(textEmbedOf("Took too long!", { color: 0xff0000 }));
      msg.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);
      await msgResp.removeAllReactions();
      return;
    }

    const selectedType = STATE_TYPES.find((t) => t.emoji === typeResp.emoji.name);
    await msgResp.removeAllReactions();

    if (!selectedType) {
      return;
    }

    const createResult = await linear.client.createWorkflowState({
      name: newStateName,
      teamId: teamId,
      color: "#666666",
      type: selectedType.type,
    });

    if (!createResult.success) {
      await msgResp.edit(textEmbedOf("Failed to create state.", { color: 0xff0000 }));
      return;
    }

    const refreshedStates = await getFreshStates(linear, teamId);
    await showStatesList(msg, args, linear, teamId, refreshedStates, msgResp);
    return;
  }

  const index = emojiList.indexOf(emojiName);
  if (index === -1) {
    return;
  }

  const selectedState = teamStates[index]!;
  await showStateOptions(msg, args, linear, teamId, selectedState, teamStates, msgResp);
}

async function showStateOptions(
  msg: Message,
  args: string[],
  linear: Linear,
  teamId: string,
  selectedState: WorkflowState,
  teamStates: WorkflowState[],
  existingMsg?: Message,
) {
  const msgResp = existingMsg
    ? await existingMsg.edit(
        embedOf(
          new EmbedBuilder()
            .setTitle(`State: ${selectedState.name}`)
            .setDescription(
              `${ARCHIVE_EMOJI} Archive | ${RENAME_EMOJI} Rename | ${BACK_EMOJI} Back`,
            )
            .setColor(0x00ff00),
        ),
      )
    : await msg.reply(
        embedOf(
          new EmbedBuilder()
            .setTitle(`State: ${selectedState.name}`)
            .setDescription(
              `${ARCHIVE_EMOJI} Archive | ${RENAME_EMOJI} Rename | ${BACK_EMOJI} Back`,
            )
            .setColor(0x00ff00),
        ),
      );

  const optionsResp = await msg.client.handlers.reaction.wait(msgResp, {
    allowedUserIds: [msg.author.id],
    allowedEmojis: [BACK_EMOJI, ARCHIVE_EMOJI, RENAME_EMOJI],
    timeout: INTERACTION_TIMEOUT,
  });

  if (!optionsResp) {
    await msgResp.edit(textEmbedOf("Took too long!", { color: 0xff0000 }));
    msg.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);
    await msgResp.removeAllReactions();
    return;
  }

  const chosenEmoji = optionsResp.emoji.name;
  await msgResp.removeAllReactions();

  if (chosenEmoji === BACK_EMOJI) {
    msg.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);
    await showStatesList(msg, args, linear, teamId, teamStates, msgResp);
    return;
  }

  if (chosenEmoji === ARCHIVE_EMOJI) {
    await msgResp.edit(
      embedOf(
        new EmbedBuilder()
          .setTitle(`Archive ${selectedState.name}?`)
          .setDescription("React with ✅ to confirm or ❌ to cancel")
          .setColor(0xffaa00),
      ),
    );

    const confirmResp = await msg.client.handlers.reaction.wait(msgResp, {
      allowedUserIds: [msg.author.id],
      allowedEmojis: YES_NO_EMOJIS,
      timeout: INTERACTION_TIMEOUT,
    });

    if (!confirmResp || confirmResp.emoji.name !== YES_EMOJI) {
      const refreshedStates = await getFreshStates(linear, teamId);
      await showStatesList(msg, args, linear, teamId, refreshedStates, msgResp);
      return;
    }

    await msgResp.removeAllReactions();

    const { success } = await linear.client.archiveWorkflowState(selectedState.id);

    if (!success) {
      await msgResp.edit(textEmbedOf("Failed to archive state.", { color: 0xff0000 }));
      return;
    }

    const refreshedStates = await getFreshStates(linear, teamId);
    await showStatesList(msg, args, linear, teamId, refreshedStates, msgResp);
    return;
  }

  if (chosenEmoji === RENAME_EMOJI) {
    await msgResp.edit(
      textEmbedOf("Send the new name for the state (or 'cancel' to abort)", {
        title: `Rename ${selectedState.name}`,
      }),
    );

    const nameMsg = await msg.client.handlers.textInput.waitForMessage(msg.channelId, {
      allowedUserId: msg.author.id,
      timeout: INTERACTION_TIMEOUT,
    });

    if (!nameMsg) {
      await msgResp.edit(textEmbedOf("Took too long!", { color: 0xff0000 }));
      msg.client.handlers.reaction.clearReactionCacheForMessage(msgResp.id);
      return;
    }

    const newName = nameMsg.content.trim();
    await nameMsg.delete();

    if (newName.toLowerCase() === "cancel") {
      await showStatesList(msg, args, linear, teamId, teamStates, msgResp);
      return;
    }

    if (!newName) {
      await msgResp.edit(textEmbedOf("Name cannot be empty.", { color: 0xff0000 }));
      return;
    }

    const duplicate = teamStates.find(
      (s) => s.id !== selectedState.id && s.name.toLowerCase() === newName.toLowerCase(),
    );
    if (duplicate) {
      await msgResp.edit(
        textEmbedOf(`State ${newName} already exists.`, { color: 0xff0000 }),
      );
      return;
    }

    const renameResult = await linear.client.updateWorkflowState(selectedState.id, {
      name: newName,
    });

    if (!renameResult.success) {
      await msgResp.edit(textEmbedOf("Failed to rename state.", { color: 0xff0000 }));
      return;
    }

    const refreshedStates = await getFreshStates(linear, teamId);
    await showStatesList(msg, args, linear, teamId, refreshedStates, msgResp);
  }
}
