import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"

const cmd = new Command("support", "join the nypsi support server", Categories.INFO)

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    return message.channel.send({ content: "discord.gg/hJTDNST" })
}

cmd.setRun(run)

module.exports = cmd