import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants.js";
import { addProgress } from "../utils/functions/economy/achievements.js";
import { getBalance, updateBalance } from "../utils/functions/economy/balance.js";
import { getInventory, setInventoryItem } from "../utils/functions/economy/inventory.js";
import { getPrestige } from "../utils/functions/economy/prestige.js";
import { createGame } from "../utils/functions/economy/stats.js";
import { createUser, userExists } from "../utils/functions/economy/utils.js";
import { addToNypsiBank, getNypsiBankBalance, removeFromNypsiBankBalance } from "../utils/functions/tax.js";
import { addCooldown, getRemaining, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import ms = require("ms");

const cmd = new Command("bankrob", "attempt to rob a bank for a high reward", "money");

const defaults = new Map<string, number>([
  ["bank of america", 3_000_000],
  ["maze bank", 2_000_000],
  ["barclays", 1_000_000],
  ["lloyds", 750_000],
  ["monzo", 500_000],
]);

const requirements = new Map<string, number>([
  ["bank of america", 4],
  ["maze bank", 3],
  ["barclays", 2],
  ["lloyds", 1],
  ["monzo", 0],
]);

let bankWorths = new Map<string, number>(defaults);

setInterval(() => {
  bankWorths = new Map(defaults);
}, ms("24 hours"));

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if ((await getBalance(message.member)) < 5_000) {
    return send({ embeds: [new ErrorEmbed("you must have atleast $5k")], ephemeral: true });
  }

  const getMaxValues = async (bankBalance: number) => {
    const balance = await getBalance(message.member);
    const inventory = await getInventory(message.member);

    let maxLoss = balance * 0.63;
    let maxSteal = balance * 0.5;

    if (maxLoss > bankBalance * 0.6) {
      maxLoss = bankBalance * 0.7;
      maxSteal = bankBalance * 0.5;
    } else if (maxSteal < 500_000) {
      maxSteal = 500_000;
      maxLoss = balance * 0.95;
    }

    let lawyer = false;

    if (inventory.find((i) => i.item == "lawyer") && inventory.find((i) => i.item == "lawyer").amount > 0) {
      lawyer = true;
      maxLoss = maxLoss * 0.35;
    }

    return { loss: Math.floor(maxLoss), steal: Math.floor(maxSteal), lawyer };
  };

  const displayBankInfo = async (bank: string, bankWorth: Map<string, number>) => {
    let loss: number;
    let steal: number;
    let lawyer: boolean;

    let worth: number;

    if (bank == "nypsi") {
      worth = await getNypsiBankBalance();
      const res = await getMaxValues(worth);

      loss = res.loss;
      steal = res.steal;
      lawyer = res.lawyer;
    } else {
      worth = bankWorth.get(bank);
      const res = await getMaxValues(bankWorth.get(bank));

      loss = res.loss;
      steal = res.steal;
      lawyer = res.lawyer;
    }

    return `**${bank}**\n*$${worth.toLocaleString()}*\n\n**max steal** $${steal.toLocaleString()}\n**max loss** $${loss.toLocaleString()}${
      lawyer ? " 🧑‍⚖️" : ""
    }${
      (await onCooldown(cmd.name, message.member))
        ? `\n\non cooldown for \`${await getRemaining(cmd.name, message.member)}\``
        : ""
    }`;
  };

  const robBank = async (bank: string, bankWorth: Map<string, number>) => {
    if (await onCooldown(cmd.name, message.member)) {
      const embed = await getResponse(cmd.name, message.member);

      if (message instanceof Message) {
        message.channel.send({ embeds: [embed] });
        return;
      } else {
        message.followUp({ embeds: [embed] });
        return;
      }
    }

    if ((await getBalance(message.member)) < 5_000) {
      if (message instanceof Message) {
        message.channel.send({ embeds: [new ErrorEmbed("you must have atleast $5k")] });
        return;
      } else {
        message.followUp({ embeds: [new ErrorEmbed("you must have atleast $5k")] });
        return;
      }
    }

    await addCooldown(cmd.name, message.member, 900);

    let loss: number;
    let steal: number;

    if (bank == "nypsi") {
      const res = await getMaxValues(await getNypsiBankBalance());

      loss = res.loss;
      steal = res.steal;
    } else {
      const res = await getMaxValues(bankWorth.get(bank));

      loss = res.loss;
      steal = res.steal;
    }

    const chance = Math.floor(Math.random() * 100);

    const embed = new CustomEmbed(message.member).setHeader(
      `${message.author.username}'s robbery`,
      message.author.avatarURL()
    );

    if (chance > 65) {
      const minStolen = Math.floor(steal * 0.5);

      const stolen = Math.floor(Math.random() * (steal - minStolen)) + minStolen;

      await Promise.all([
        updateBalance(message.member, (await getBalance(message.member)) + stolen),
        addProgress(message.author.id, "robber", 1),
      ]);

      if (bank == "nypsi") {
        await removeFromNypsiBankBalance(stolen);
      } else {
        bankWorth.set(bank, Math.floor(bankWorth.get(bank) - stolen));
      }

      const id = await createGame({
        userId: message.author.id,
        bet: 0,
        win: true,
        earned: stolen,
        game: "bankrob",
        outcome: `${message.author.username} robbed ${bank}`,
      });

      embed.setDescription(`**success!**\n\n**you stole** $${stolen.toLocaleString()} from **${bank}**`);
      embed.setColor(Constants.EMBED_SUCCESS_COLOR);
      embed.setFooter({ text: `id: ${id}` });

      return embed;
    } else {
      const inventory = await getInventory(message.member);
      let lawyer = false;

      if (inventory.find((i) => i.item == "lawyer") && inventory.find((i) => i.item == "lawyer").amount > 0) {
        lawyer = true;

        await setInventoryItem(message.member, "lawyer", inventory.find((i) => i.item == "lawyer").amount - 1, false);
      }

      const minLoss = Math.floor(loss * 0.4);
      const totalLossed = Math.floor(Math.random() * (loss - minLoss)) + minLoss;

      await updateBalance(message.member, (await getBalance(message.member)) - totalLossed);

      if (bank == "nypsi") {
        await addToNypsiBank(totalLossed * 0.9);
      } else {
        await addToNypsiBank(totalLossed * 0.7);
        bankWorth.set(bank, bankWorth.get(bank) + Math.floor(totalLossed * 0.2));
      }

      embed.setColor(Constants.EMBED_FAIL_COLOR);

      const id = await createGame({
        userId: message.author.id,
        bet: totalLossed,
        win: false,
        game: "bankrob",
        outcome: `${message.author.username} robbed ${bank}`,
      });
      embed.setFooter({ text: `id: ${id}` });

      if (lawyer) {
        embed.setDescription(
          `**you were caught**\n\nthanks to your lawyer, you only lost $**${totalLossed.toLocaleString()}**`
        );
      } else {
        embed.setDescription(`**you were caught**\n\nyou lost $**${totalLossed.toLocaleString()}**`);
      }
    }

    return embed;
  };

  const embed = new CustomEmbed(message.member).setHeader("bank robbery", message.author.avatarURL());

  const options: StringSelectMenuOptionBuilder[] = [];

  const bankNames = Array.from(bankWorths.keys());

  inPlaceSort(bankNames).desc((i) => bankWorths.get(i));

  const prestige = await getPrestige(message.member);

  for (const bankName of bankNames) {
    if (requirements.get(bankName) > prestige) continue;
    if (bankWorths.get(bankName) < defaults.get(bankName) * 0.1) continue;

    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(bankName)
        .setValue(bankName)
        .setDescription(`$${bankWorths.get(bankName).toLocaleString()}`)
    );
  }

  if (options.length == 0) {
    return send({ embeds: [new ErrorEmbed("there are no available banks for you to rob")] });
  }

  if ((await getNypsiBankBalance()) > 500_000 && prestige >= 2) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel("nypsi bank")
        .setValue("nypsi")
        .setDefault(true)
        .setDescription(`$${(await getNypsiBankBalance()).toLocaleString()}`)
    );
    embed.setDescription(await displayBankInfo("nypsi", bankWorths));
  } else {
    options[0].setDefault(true);
    embed.setDescription(await displayBankInfo(options[0].data.value, bankWorths));
  }

  if (options.length == 0) {
    return send({ embeds: [new CustomEmbed(message.member, "there are currently no banks to rob")] });
  }

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  components.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId("bank").setOptions(options)
    )
  );

  if (!(await onCooldown(cmd.name, message.member)))
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("ro").setLabel("rob").setStyle(ButtonStyle.Danger)
      )
    );

  const msg = await send({ embeds: [embed], components });

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const pageManager: any = async () => {
    const res = await msg
      .awaitMessageComponent({ filter, time: 60_000 })
      .then(async (i) => {
        await i.deferUpdate();
        return i;
      })
      .catch(() => {});

    if (!res) {
      msg.edit({ components: [] });
      return;
    }

    if (res.isStringSelectMenu() && res.customId == "bank") {
      embed.setDescription(await displayBankInfo(res.values[0], bankWorths));

      for (const option of options) {
        option.setDefault(false);

        if (option.data.value == res.values[0]) option.setDefault(true);
      }

      components[0] = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId("bank").setOptions(options)
      );

      await res.message.edit({ embeds: [embed], components });
      return pageManager();
    } else if (res.customId == "ro") {
      const selected = options.filter((o) => o.data.default)[0].data.value;

      const newEmbed = await robBank(selected, bankWorths);

      if (!newEmbed) return await res.message.edit({ components: [] });

      await res.message.edit({ embeds: [newEmbed], components: [] });
      return;
    }
  };

  return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
