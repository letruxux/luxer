import type { Message } from "@fluxerjs/core";
import { EmbedBuilder } from "@/utils/embed-builder";
import { embedOf, textEmbedOf } from "@/utils";
import {
  handleTimeout,
  confirmAction,
  waitForTextInput,
  normalizeCancel,
} from "@/utils/ui-helpers";
import { NUMBER_EMOJIS } from "@/handlers/reaction-handler";

const ADD_EMOJI = "➕";
const INTERACTION_TIMEOUT = 120_000;

export interface TeamEntity {
  id: string;
  name: string;
}

interface EntityListOptions<T extends TeamEntity> {
  msg: Message;
  linear: import("@/lib/linear").Linear;
  teamId: string;
  entityName: "label" | "state";
  entities: T[];
  refreshEntities: () => Promise<T[]>;
  renderItem: (entity: T, index: number) => string;
  showOptions: (entity: T, entities: T[]) => Promise<void>;
  onAdd?: (name: string) => Promise<boolean>;
}

export async function showEntityList<T extends TeamEntity>({
  msg,
  linear,
  teamId,
  entityName,
  entities,
  refreshEntities,
  renderItem,
  showOptions,
  onAdd,
}: EntityListOptions<T>): Promise<void> {
  const emojiList = NUMBER_EMOJIS.slice(0, entities.length);
  const listText = entities.length
    ? entities.map((e, i) => `${emojiList[i]} ${renderItem(e, i)}`).join("\n")
    : `No ${entityName}s`;

  const allEmojis = onAdd ? [...emojiList, ADD_EMOJI] : emojiList;

  const msgResp = await msg.reply(
    embedOf(
      new EmbedBuilder()
        .setTitle(`Team ${entityName === "label" ? "Labels" : "States"}`)
        .setDescription(listText)
        .addFields({
          name: "Actions",
          value: onAdd ? `${ADD_EMOJI} Add` : "None",
        })
        .setColor(0x00ff00),
    ),
  );

  const resp = await msg.client.handlers.reaction.wait(msgResp, {
    allowedUserIds: [msg.author.id],
    allowedEmojis: allEmojis,
    timeout: INTERACTION_TIMEOUT,
  });

  if (!resp) {
    await handleTimeout(msgResp);
    return;
  }

  const emojiName = resp.emoji.name;
  await msgResp.removeAllReactions();

  if (onAdd && emojiName === ADD_EMOJI) {
    const newName = await waitForTextInput(msg, msgResp, `Add ${entityName}`);
    if (!newName || normalizeCancel(newName)) {
      const refreshed = await refreshEntities();
      await showEntityList({
        msg,
        linear,
        teamId,
        entityName,
        entities: refreshed,
        refreshEntities,
        renderItem,
        showOptions,
        onAdd,
      });
      return;
    }

    if (!newName) {
      await handleTimeout(msgResp);
      return;
    }

    const duplicate = entities.find(
      (e) => e.name.toLowerCase() === newName.toLowerCase(),
    );
    if (duplicate) {
      await msgResp.edit(
        textEmbedOf(`${entityName} ${newName} already exists.`, { color: 0xff0000 }),
      );
      return;
    }

    const success = await onAdd(newName);
    if (!success) {
      await msgResp.edit(
        textEmbedOf(`Failed to create ${entityName}.`, { color: 0xff0000 }),
      );
      return;
    }

    const refreshed = await refreshEntities();
    await showEntityList({
      msg,
      linear,
      teamId,
      entityName,
      entities: refreshed,
      refreshEntities,
      renderItem,
      showOptions,
      onAdd,
    });
    return;
  }

  const index = emojiList.indexOf(emojiName);
  if (index === -1) return;

  const selected = entities[index]!;
  await showOptions(selected, entities);
}

export interface EntityOptionsOptions<T extends TeamEntity> {
  msg: Message;
  msgResp: Message;
  entity: T;
  entities: T[];
  entityName: "label" | "state";
  options: { emoji: string; action: string }[];
  onSelect: (emoji: string) => Promise<void>;
  onBack: (entities: T[]) => Promise<void>;
}

export async function showEntityOptions<T extends TeamEntity>({
  msg,
  msgResp,
  entity,
  entities,
  entityName,
  options,
  onSelect,
  onBack,
}: EntityOptionsOptions<T>): Promise<void> {
  const optionEmojis = options.map((o) => o.emoji);

  const msgUpdated = await msgResp.edit(
    embedOf(
      new EmbedBuilder()
        .setTitle(`${entityName === "label" ? "Label" : "State"}: ${entity.name}`)
        .setDescription(options.map((o) => `${o.emoji} ${o.action}`).join(" | "))
        .setColor(0x00ff00),
    ),
  );

  const resp = await msg.client.handlers.reaction.wait(msgUpdated, {
    allowedUserIds: [msg.author.id],
    allowedEmojis: optionEmojis,
    timeout: INTERACTION_TIMEOUT,
  });

  if (!resp) {
    await handleTimeout(msgUpdated);
    return;
  }

  const emojiName = resp.emoji.name;
  await msgUpdated.removeAllReactions();

  const option = options.find((o) => o.emoji === emojiName);

  if (!option) return;

  if (option.action === "Back") {
    await onBack(entities);
    return;
  }

  await onSelect(emojiName);
}

export async function handleDeleteEntity<T extends TeamEntity>(
  msg: Message,
  msgResp: Message,
  entity: T,
  entityName: "label" | "state",
  onDelete: () => Promise<boolean>,
  refreshEntities: () => Promise<T[]>,
): Promise<T[] | null> {
  const confirmed = await confirmAction(msg, msgResp, `Delete ${entity.name}?`);
  if (!confirmed) {
    return null;
  }

  const success = await onDelete();
  if (!success) {
    await msgResp.edit(
      textEmbedOf(`Failed to delete ${entityName}.`, { color: 0xff0000 }),
    );
    return null;
  }

  return await refreshEntities();
}

export async function handleRenameEntity<T extends TeamEntity>(
  msg: Message,
  msgResp: Message,
  entity: T,
  entityName: "label" | "state",
  entities: T[],
  onRename: (newName: string) => Promise<boolean>,
  refreshEntities: () => Promise<T[]>,
): Promise<T[] | null> {
  const newName = await waitForTextInput(msg, msgResp, `Rename ${entity.name}`);
  if (!newName || normalizeCancel(newName)) {
    return null;
  }

  if (!newName) {
    await msgResp.edit(textEmbedOf("Name cannot be empty.", { color: 0xff0000 }));
    return null;
  }

  const duplicate = entities.find(
    (e) => e.id !== entity.id && e.name.toLowerCase() === newName.toLowerCase(),
  );
  if (duplicate) {
    await msgResp.edit(
      textEmbedOf(`${entityName} ${newName} already exists.`, { color: 0xff0000 }),
    );
    return null;
  }

  const success = await onRename(newName);
  if (!success) {
    await msgResp.edit(
      textEmbedOf(`Failed to rename ${entityName}.`, { color: 0xff0000 }),
    );
    return null;
  }

  return await refreshEntities();
}
