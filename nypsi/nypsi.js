/*jshint esversion: 6 */
const Discord = require("discord.js");
const { RichEmbed } = require("discord.js");
const client = new Discord.Client();
const { prefix, token } = require("./config.json");
const fs = require("fs");
const { list } = require("./optout.json");
const ascii = require("figlet");

var commands = new Discord.Collection();
var aliases = new Discord.Collection();

const commandFiles = fs.readdirSync("./commands/").filter(file => file.endsWith(".js"));

console.log(" -- commands -- \n");
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);

    let enabled = true;

    if (!command.name || !command.description || !command.run) {
        enabled = false;
    }

    if (enabled) {
        commands.set(command.name, command);
        console.log(command.name + " ✅");
    } else {
        console.log(command.name + " ❌");
    }
}
console.log("\n -- commands -- ");

client.once("ready", () => {
    client.user.setPresence({
        status: "dnd",
        game: {
            name: "tekoh.wtf | $help",
            type: "PLAYING"
        }
    });

    aliases.set("ig", "instagram");
    aliases.set("av", "avatar");
    aliases.set("whois", "user");
    aliases.set("who", "user");
    aliases.set("serverinfo", "server");
    aliases.set("ws", "wholesome");
    aliases.set("rick", "rickroll");
    aliases.set("dice", "roll");
    aliases.set("git", "github");
    aliases.set("q", "question");

    console.log("\n\n\n\n\n\n\n\n- - -\n");
    console.log("logged in as " + client.user.tag + "\n\n");

    ascii("n y p s i", function(err, data) {
        if (!err) {
            console.log(data + "\n\n- - -\n\n");
        }
    });
});


client.on("message", message => {
    const { banned } = require("./banned.json");

    if (!message.guild) return;
    if (!message.content.startsWith(prefix)) return;

    if (banned.includes(message.member.user.id)) {
        message.delete().catch();
        return message.channel.send("❌\nyou are banned from this bot").then(m => m.delete(2500));
    }

    const args = message.content.substring(prefix.length).split(" ");
    const cmd = args[0].toLowerCase();

    if (cmd == "help") {
        logCommand(message, args);
        return helpCmd(message);
    }

    if (aliases.get(cmd)) {
        logCommand(message, args);
        return runCommand(aliases.get(cmd), message, args);
    }

    if (commands.get(cmd)) {
        logCommand(message, args);
        return runCommand(cmd, message, args);
    }
    
});

function logCommand(message, args) {
    args.shift();

    const date = new Date();
    let hours = date.getHours().toString();
    let minutes = date.getMinutes().toString();
    let seconds = date.getSeconds().toString();

    if (hours.length == 1) {
        hours = "0" + hours;
    } 

    if (minutes.length == 1) {
        minutes = "0" + minutes;
    } 

    if (seconds.length == 1) {
        seconds = "0" + seconds;
    }

    let timestamp = hours + ":" + minutes + ":" + seconds;

    console.log("[" + timestamp + "] " + message.member.user.tag + " ran command '" + message.content.split(" ")[0] + "'" + " with args: '" + args.join(" ") + "'");
}

function runCommand(cmd, message, args) {
    commands.get(cmd).run(message, args);
}

function getCmdName(cmd) {
    return commands.get(cmd).name;
}

function getCmdDesc(cmd) {
    return commands.get(cmd).description;
}

function helpCmd(message) {

    if (!message.guild.me.hasPermission("EMBED_LINKS")) {
        return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
    }

    let cmdMenu = "";

    for (let cmd of commands.keys()) {
        cmdMenu = (cmdMenu + "$**" + getCmdName(cmd) + "** " + getCmdDesc(cmd) + "\n");
    }

    let color;

    if (message.member.displayHexColor == "#000000") {
        color = "#FC4040";
    } else {
        color = message.member.displayHexColor;
    }

    const embed = new RichEmbed()
        .setTitle("help")
        .setColor(color)
        
        .addField("commands", cmdMenu)

        .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
        .setTimestamp();

    if (!list.includes(message.member.user.id)) {
        return message.member.send(embed).then( () => {
            message.react("✅");
        }).catch( () => {
            message.channel.send(embed).catch(() => {
                return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
            });
        });
    }

    message.channel.send(embed).catch(() => {
        return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
    });
}

client.login(token);