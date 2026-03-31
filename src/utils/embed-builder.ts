import type { EmbedFieldData, EmbedFooterOptions } from "@fluxerjs/builders";
import { EmbedBuilder as OldEmbedBuilder } from "@fluxerjs/core";

const DEFAULT_FOOTER = {
  text: "linear.app",
  iconURL:
    "https://fluxerusercontent.com/avatars/1488524605469763558/88b0a0fc.webp?size=160",
} satisfies EmbedFooterOptions;

export class EmbedBuilder extends OldEmbedBuilder {
  constructor() {
    super();
    this.setColor(0x000001);
    this.setFooter(DEFAULT_FOOTER);
  }

  override setFooter(options: EmbedFooterOptions | null): this {
    if (!options?.text) {
      return super.setFooter(null);
    }

    return super.setFooter({
      iconURL: DEFAULT_FOOTER.iconURL,
      ...options,
      text:
        options.text === DEFAULT_FOOTER.text
          ? options.text
          : `${options.text} | ${DEFAULT_FOOTER.text}`,
    });
  }

  override setDescription(description: string | null): this {
    if (description === null || description.length === 0) {
      return this;
    }

    return super.setDescription(description);
  }

  override addFields(...fields: EmbedFieldData[]): this {
    return super.addFields(
      ...fields.filter((f) => f.name.length > 0 && f.value.length > 0),
    );
  }
}
