import fs from 'fs';
import gamedig from 'gamedig';
import { Client, GatewayIntentBits, Collection, Events, PermissionsBitField, SlashCommandBuilder, Colors } from 'discord.js';
import * as dotenv from 'dotenv';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
dotenv.config()

const token = 'MTEwMzcwNTE0OTkxMTg3OTgxMg.GDmlzf.X3zYpzJMRFTISA3RvXGhwGLHlbLzEgisciNKRk';

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
                    .setDescription('port of the gameserver')
            )
            .addStringOption(option =>
                option
                    .setName('game')
                    .setRequired(false)
                    .setDescription('IP of the gameserver')
                    .setChoices(...supportedGames)
            )
    ]

    for (let t of [ 1, 2, 3 ])
        client.application.commands.create(...commands)

    client.on('interactionCreate', async interaction => {
        if (interaction.isCommand()) {
            const command = client.slashCommands.get(interaction.commandName);
            const args = interaction.options.data;
            console.log(args);
            const queryData = {
                type: args.find(a => a.name == 'game').value || 'squad',
                host: args.find(a => a.name == 'ip').value,
                port: args.find(a => a.name == 'port').value
            }
            console.log(queryData);
            const res = await gamedig.query(queryData)
            // interaction.reply({ content: 'ciao', ephemeral: true })
            interaction.reply({
                embeds: [
                    {
                        title: res.name,
                        color: Colors.Green,
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
                                value: `\`\`\`${res.ping}\`\`\``,
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
                            {
                                name: 'Players',
                                value: `\`\`\`${res.players.map(p => p.name).join('\n')}\`\`\``,
                                inline: false
                            }
                        ]
                    }
                ]
            });
        }
    });
}

async function runQuery(evt) {
    console.log(evt);
}

main();