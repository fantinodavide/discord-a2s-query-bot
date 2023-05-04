import fs from 'fs';
import gamedig from 'gamedig';
import { Client, GatewayIntentBits, Collection, Events, PermissionsBitField, SlashCommandBuilder, Colors, ComponentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import * as dotenv from 'dotenv';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
dotenv.config()

const token = process.env.DISCORD_TOKEN;

async function main() {
    const supportedGames = gamedig.getInstance().queryRunner.gameResolver.games.filter((g, i) => g.pretty == 'Squad' /*|| i < 24*/).sort((a, b) => a.pretty == 'Squad' ? -Infinity : a.pretty - b.pretty).map(c => ({ name: c.pretty, value: c.keys[ 0 ] }));
    // console.log(supportedGames)

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.DirectMessages
        ],
    })
    await client.login(token);
    const permissions = [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ViewChannel
    ];
    const permissionInt = permissions.reduce((p, c) => p + c, 0n);
    const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=${permissionInt}&scope=bot`;

    console.log(`Logged in as: "${client.user.username}#${client.user.discriminator}" (<@${client.user.id}>)\nInvite: ${inviteLink}\n`);
    // client.commands = new Collection();
    // client.commands.set('query', runQuery)
    client.slashCommands = new Collection();
    client.slashCommands.set('query', 'query');

    const commands = [
        new SlashCommandBuilder()
            .setName('query')
            .setDescription('Queries a Steam Game Server')
            .addStringOption(option =>
                option
                    .setName('ip')
                    .setRequired(true)
                    .setDescription('IP of the gameserver')
            )
            .addNumberOption(option =>
                option
                    .setName('port')
                    .setRequired(true)
                    .setDescription('Port of the gameserver')
            )
            .addStringOption(option =>
                option
                    .setName('game')
                    .setRequired(true)
                    .setDescription('Game of the server')
                    .setChoices(...supportedGames)
            )
            .addBooleanOption(option =>
                option
                    .setName('show_players')
                    .setRequired(false)
                    .setDescription('Include player list')
            )
    ]

    client.application.commands.create(...commands)

    client.on('interactionCreate', async interaction => {
        if (interaction.isCommand()) {
            await interaction.deferReply();
            const command = client.slashCommands.get(interaction.commandName);
            const args = interaction.options.data;
            console.log(args);
            try {
                await runQuery(args, interaction);
            } catch (error) {
                await sendErrorMessage(interaction, error)
            }
        } else if (interaction.isButton()) {
            const intId = interaction.customId.split('-');
            const command = intId[ 0 ];
            const args = [
                { name: 'ip', type: 3, value: intId[ 1 ] },
                { name: 'port', type: 10, value: intId[ 2 ] },
                { name: 'game', type: 3, value: intId[ 3 ] },
                { name: 'show_players', type: 3, value: intId[ 4 ].match(/true/) ? true : false }
            ]
            const updateMode = command == 'queryUpdate';
            if (!updateMode) await interaction.deferReply();
            // const args = interaction.options.data;
            try {
                await runQuery(args, interaction, updateMode);
            } catch (error) {
                await sendErrorMessage(error)
            }
        }
    });
}

async function runQuery(args, interaction, update = false) {
    const queryData = {
        type: args.find(a => a.name == 'game').value || 'squad',
        host: args.find(a => a.name == 'ip').value,
        port: args.find(a => a.name == 'port').value,
        maxAttempts: 3,
    }

    let showPlayers = args.find(a => a.name == 'show_players')?.value
    if (showPlayers == undefined) showPlayers = false;

    console.log({ ...queryData, show_players: showPlayers });

    const res = await gamedig.query(queryData).catch(async r => {
        await sendErrorMessage(interaction, r)
    })
    if (!res) return;

    // console.log(interaction.message, interaction.message.edit)

    // await interaction.update();
    const message = {
        embeds: [
            {
                title: res.name,
                color: Colors.Green,
                thumbnail: { url: `https://squadmaps.com/img/maps/full_size/${res.map}.jpg` },
                fields: [
                    {
                        name: 'Map',
                        value: `\`\`\`${res.map}\`\`\``,
                        inline: true
                    },
                    {
                        name: 'Players',
                        value: `\`\`\`${res.raw.rules.PlayerCount_i}(+${+res.raw.rules.PublicQueue_i + +res.raw.rules.ReservedQueue_i}) / ${res.raw.rules.NUMPUBCONN}(+${res.raw.rules.NUMPRIVCONN})\`\`\``,
                        inline: true
                    },
                    {
                        name: 'Ping',
                        value: `\`\`\`${res.ping} ms\`\`\``,
                        inline: true
                    },
                    {
                        name: 'License ID',
                        value: `\`\`\`${res.raw.rules.LicenseId_i}\`\`\``,
                        inline: true
                    },
                    {
                        name: 'Game Version',
                        value: `\`\`\`${res.raw.rules.GameVersion_s}\`\`\``,
                        inline: true
                    },
                    showPlayers ? {
                        name: 'Players',
                        value: `\`\`\`\n${res.players.map(p => p.name).join('\n')}\n\`\`\``,
                        inline: false
                    } : null
                ].filter(f => f != null)
            }
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`queryUpdate-${queryData.host}-${queryData.port}-${queryData.type}-${showPlayers}`)
                        .setLabel(`Update`)
                        .setStyle(ButtonStyle.Primary)
                )
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`query-${queryData.host}-${queryData.port}-${queryData.type}-${showPlayers}`)
                        .setLabel(`Resend`)
                        .setStyle(ButtonStyle.Secondary)
                )
        ]
    }

    return discordSendUpdateMessage(interaction, update, message)
}

async function sendErrorMessage(interaction, error) {
    const data = {
        embeds: [ {
            title: 'Query failed',
            color: Colors.Red,
            description: `\`\`\`${error}\`\`\``
        } ]
    }
    await discordSendUpdateMessage(interaction, false, data)
}

async function discordSendUpdateMessage(interaction, update, messageContent) {
    console.log("interac", messageContent)
    if (interaction.message) messageContent.components = interaction.message.components;
    if (update) interaction.update(messageContent)
    else interaction.editReply(messageContent);
}

main();