const fs = require('fs');
const WebSocket = require('ws');
const axios = require('axios');

const configData = fs.readFileSync('./config.json', 'utf-8');
const config = JSON.parse(configData);

let ws;
let interval = 0;
let reconnectTimeout;
let serverDict = [];
let channelDict = [{}];

function connect() {
    ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

    ws.on('open', function open() {
        console.log('Connected to Discord Gateway');
        console.log('Made by _0x1337_')
        cacheIds();
        sendPayload();
        clearInterval(reconnectTimeout);
    });

    ws.on('message', function incoming(data) {
        let payload = JSON.parse(data);
        const { t, event, op, d} = payload;

        switch (op) {
            case 10:
                const { heartbeat_interval } = d;
                interval = heartbeat(heartbeat_interval);
                break;
            case 11: 
                break;
            case 7: 
                console.log("Received Reconnect instruction. Reconnecting...");
                clearInterval(interval);
                connect();
                break;
            case 9:
                console.log("Invalid session. Reconnecting...");
                clearInterval(interval);
                connect();
                break;
        }

        switch(t) {
            case 'MESSAGE_CREATE':
                handleMessageCreate(d);
                break;
            case 'MESSAGE_DELETE':
                handleMessageDelete(d);
                break;
            case 'MESSAGE_UPDATE':
                handleMessageUpdate(d);
                break;
        }
    });

    ws.on('close', function() {
        console.log('Connection closed. Attempting to reconnect...');
        clearInterval(interval);
        clearInterval(reconnectTimeout);
    });

    ws.on('error', function(error) {
        console.error('WebSocket error:', error);
        clearInterval(interval);
        ws.close();
    });
}

function sendPayload() {
    const payload = {
        op: 2,
        d: {
            token: config.token,
            intents: 131071,
            properties: {
                $os: "linux",
                $browser: "chrome",
                $device: "chrome"
            }
        }
    };
    ws.send(JSON.stringify(payload));
}

function heartbeat(ms) {
    return setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: null }));
    }, ms);
}

async function cacheIds() {
    for(let i = 0; i < config.servers.length; i++) {
        let serverId = config.servers[i].id;
        let channelArray = config.servers[i].channels;
    
        const response = await axios.get(`https://discord.com/api/v10/guilds/${serverId}`, {
            headers: {
                Authorization: `${config.token}`
            }
        })
        .then((res) => {
            serverDict.push({id: serverId, name: res.data.name});
        }).catch((error) => {
            console.log(error);
        });

        for(let j = 0; j < channelArray.length; j++) {
            const response = await axios.get(`https://discord.com/api/v10/channels/${channelArray[j]}`, {
                headers: {
                    Authorization: `${config.token}`
                }
            })
            .then((res) => {
                channelDict.push({id: channelArray[j], name: res.data.name});
            }).catch((error) => {
                console.log(error);
            });
        }
    }
    console.log("cached server and channel IDs");
}


//DATA PROCESSING

function handleMessageCreate(data) {
    if(config.servers.some(obj => obj.id === data.guild_id)) {
        matchedObject = config.servers.find(obj => obj.id === data.guild_id);
        if(matchedObject.channels.find(channel => channel === data.channel_id)) {
            
            serverName = serverDict.find(obj => obj.id === data.guild_id).name;
            channelName = channelDict.find(obj => obj.id === data.channel_id).name;

            console.log(`[${serverName}] -> #${channelName} | ${data.author.global_name} (${data.author.username}): ${data.content}`)

            for (let i = 0; i < data.attachments.length; i++) {
                console.log(`   --> Attachment (${data.attachments[i].content_type}): ${data.attachments[i].url}`)
            }
            
        }
    }

    if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data');
    }

    const filePath = `./data/${serverName} - ${channelName}.json`;

    const messageData = {
        id: data.id,
        author: {
            global_name: data.author.global_name,
            username: data.author.username,
            id: data.author.id,
        },
        timestamp: data.timestamp,
        content: data.content,
        attachments: data.attachments.map(attachment => ({
            content_type: attachment.content_type,
            url: attachment.url
        })),
        channel_id: data.channel_id,
        guild_id: data.guild_id
    };

    const messageJson = JSON.stringify(messageData) + '\n';

    fs.appendFile(filePath, messageJson, function (err) {
        if (err) throw err;
    });

}


function handleMessageDelete(data) {
    //get server name and channel name
    if(config.servers.some(obj => obj.id === data.guild_id)) {
        matchedObject = config.servers.find(obj => obj.id === data.guild_id);
        if(matchedObject.channels.find(channel => channel === data.channel_id)) {
            
            serverName = serverDict.find(obj => obj.id === data.guild_id).name;
            channelName = channelDict.find(obj => obj.id === data.channel_id).name;

            const filePath = `./data/${serverName} - ${channelName}.json`;

            if (!fs.existsSync(filePath)) {
                return;
            }

            const fileData = fs.readFileSync(filePath, 'utf-8');
            const lines = fileData.split('\n');
            let line = lines.find(line => line.includes(data.id));
            if (!line) {
                return;
            }

            let messageData = JSON.parse(line);
            messageData.deleted = true;
            
            const messageJson = JSON.stringify(messageData);
            fs.writeFileSync(filePath, fileData.replace(line, messageJson));

            if (messageData.updated) {
                newestMessage = messageData.updated[messageData.updated.length -1];
                console.log(`[${serverName}] -> #${channelName} | Message deleted: ${messageData.author.global_name} (${messageData.author.username}) ${newestMessage}`)
            } else {
                console.log(`[${serverName}] -> #${channelName} | Message deleted: ${messageData.author.global_name} (${messageData.author.username}) ${messageData.content}`)
            }

        }
    }
}

function handleMessageUpdate(data) {
    if(config.servers.some(obj => obj.id === data.guild_id)) {
        matchedObject = config.servers.find(obj => obj.id === data.guild_id);
        if(matchedObject.channels.find(channel => channel === data.channel_id)) {
            
            serverName = serverDict.find(obj => obj.id === data.guild_id).name;
            channelName = channelDict.find(obj => obj.id === data.channel_id).name;

            const filePath = `./data/${serverName} - ${channelName}.json`;

            if (!fs.existsSync(filePath)) {
                return;
            }

            const fileData = fs.readFileSync(filePath, 'utf-8');
            const lines = fileData.split('\n');
            let line = lines.find(line => line.includes(data.id));
            if (!line) {
                return;
            }

            let messageData = JSON.parse(line);
                        
            if (!messageData.updated) {
                messageData.updated = [];
                console.log(`[${serverName}] -> #${channelName} | Message updated: ${messageData.author.global_name} (${messageData.author.username}) ${messageData.content} --> ${data.content}`)
            } else {
                newestMessage = messageData.updated[messageData.updated.length - 1];
                console.log(`[${serverName}] -> #${channelName} | Message updated: ${messageData.author.global_name} (${messageData.author.username}) ${newestMessage} --> ${data.content}`)
            
            }
            messageData.updated.push(data.content);
            
            const messageJson = JSON.stringify(messageData);
            fs.writeFileSync(filePath, fileData.replace(line, messageJson));
        }
    }
} 

connect();
