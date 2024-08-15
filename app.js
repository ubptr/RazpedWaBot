const express = require('express');
const app = express();
const qrcodee = require('qrcode-terminal');
const { Client, Location, Poll, List, Buttons, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const { createServer } = require('node:http');
const server = createServer(app);
const moment = require('moment-timezone');
const colors = require('colors');
const qrcode = require('qrcode');
const axios = require("axios");
const { checkDevice } = require('./middleware/checkDevice.js');
require('dotenv').config();

const config = require('./config/config.json');
console.log("Loading the modules...");

const authDir = './wwebjs_auth'; // Ganti dengan path yang sesuai
const cacheDir = './wwebjs_cache'; // Ganti dengan path yang sesuai

// Fungsi untuk menghapus file dan direktori
function cleanUpSession() {
    // Hapus direktori sesi jika ada
    [authDir, cacheDir].forEach(dir => {
        if (fs.existsSync(dir)) {
            fs.readdirSync(dir).forEach(file => {
                const filePath = path.join(dir, file);
                if (fs.statSync(filePath).isFile()) {
                    fs.unlinkSync(filePath); // Hapus file
                } else if (fs.statSync(filePath).isDirectory()) {
                    fs.rmdirSync(filePath, { recursive: true }); // Hapus direktori
                }
            });
            fs.rmdirSync(dir); // Hapus direktori utama
            console.log(`${dir} cleaned up.`);
        }
    });
}

// Importing modules from a directory
const directoryPath = './modules';
const modules = fs.readdirSync(directoryPath);
const moduleObjects = [];

for (const module of modules) {
    console.log(module);
    const ModuleClass = require(`${directoryPath}/${module}/interface.js`);
    moduleObjects.push(new ModuleClass());  // Assuming no constructor arguments
  }

const io = require('socket.io')(server, {
    cors: {
        origin: "http://localhost:" + config.port,
        methods: ["GET", "POST"],
        transports: ['websocket', 'polling'],
        credentials: true
    },
    allowEIO3: true
});

let state = {
    'count': { 'next_num': null, 'warned': false }
  };

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ],
  },
});

// Initialize the client with error handling
const initializeClient = async () => {
    try {
      console.log('Initializing WhatsApp client...');
      await client.initialize();
      console.log('WhatsApp client initialized successfully.');
    } catch (error) {
      console.error('Error initializing WhatsApp client:', error);
      // Implement a retry mechanism if necessary
      setTimeout(initializeClient, 5000); // Retry initialization after a delay
    }
  };
  
server.listen(config.port, () => {
    console.log('App running on *: ' + config.port);
});

io.on('connection', (socket) => { 
    socket.emit('message', 'Connecting...');
        client.on('qr', async (qr) => {
        // use qrcode_terminal for rendering in terminal
        //   qrcode_terminal.generate(qr, {small: true});
    
          qrcode.toDataURL(qr, (err, url) => {
              socket.emit('qr', url);
              console.log('QR Code Sudah muncul!')
              socket.emit('message', 'QR Code received, scan please!');
          });
        });
      
        client.on('ready', async () => {
            console.clear();
            const consoleText = './config/console.txt';
            socket.emit('ready', 'Whatsapp is ready!');
            socket.emit('message', 'Attached current phone number session: ' + client.info.wid.user);
            
            fs.readFile(consoleText, 'utf-8', (err, data) => {
                if (err) {
                    console.log(`[${moment().tz(config.timezone).format('HH:mm:ss')}] Console Text not found!`.yellow);
                    console.log(`[${moment().tz(config.timezone).format('HH:mm:ss')}] ${config.name} is Already!`.green);
                } else {
                    console.log(data.blue);
                    console.log(`[${moment().tz(config.timezone).format('HH:mm:ss')}] ${config.name} is Already!`.green);
                    console.log(`[${moment().tz(config.timezone).format('HH:mm:ss')}] Nomor Hp: ${client.info.wid.user}!`.green);
                }
            });

            const debugWWebVersion = await client.getWWebVersion();
            socket.emit('message', `WWebVersion  = ${debugWWebVersion}`);
            client.pupPage.on('pageerror', function (err) {
                socket.emit('message', 'Page error:: ' + err.toString());
            });
            client.pupPage.on('error', function (err) {
                socket.emit('message', 'Page error:: ' + err.toString());
            });
        });
    
        client.on('authenticated', () => {
            socket.emit('authenticated', 'Whatsapp is authenticated!');
            socket.emit('message', 'Whatsapp successfuly authenticated!');
        });
    
        client.on('auth_failure', function(session) {
            socket.emit('message', 'Auth failure, restarting...');
            cleanUpSession();
            client.destroy(); // Menghancurkan client
            client.initialize(); // Menginisialisasi kembali client
        });
    
        client.on('disconnected', (reason) => {
            socket.emit('message', 'WhatsApp is disconnected!');
            console.log('WhatsApp is disconnected!');
            cleanUpSession()
            client.destroy()
              .then(() => client.initialize())
              .catch(err => {
                console.error('Error reinitializing client:', err);
                socket.emit('message', 'Error reinitializing client.');
              });
        });
 });
// Message 
client.on('message', async msg => {
                let chatId = msg.from;
                const isGroups = msg.from.endsWith('@g.us') ? true : false;

                // socket.emit('message', 'MESSAGE RECEIVED' + msg);

                if (msg.body === '!ping') {
                    // Send a new message as a reply to the current one
                    msg.reply('beep boop');
                } else if (msg.body.startsWith('!sendto ')) {
                    // Direct send a new message to specific id
                    let number = msg.body.split(' ')[1];
                    let messageIndex = msg.body.indexOf(number) + number.length;
                    let message = msg.body.slice(messageIndex, msg.body.length);
                    number = number.includes('@c.us') ? number : `${number}@c.us`;
                    let chat = await msg.getChat();
                    chat.sendSeen();
                    client.sendMessage(number, message);

                } else if (msg.body.startsWith('!subject ')) {
                    // Change the group subject
                    let chat = await msg.getChat();
                    if (chat.isGroup) {
                        const isAdmin = chat.participants.find(participant => participant.id._serialized === msg.author && participant.isAdmin);
                        if (isAdmin) {
                            let newSubject = msg.body.slice(9);
                            try {
                                await chat.setSubject(newSubject);
                                msg.reply('Subject Group updated successfully.');
                            } catch (error) {
                                console.error('Error updating Subject:', error);
                                msg.reply('Failed to update the group description.');
                            }
                        } else {
                            msg.reply('You need to be an admin to change the group description.');
                        }
                    } else {
                        msg.reply('This command can only be used in a group!');
                    }
                } else if (msg.body.startsWith('!ech0 ')) {
                    // Replies with the same message
                    msg.reply(msg.body.slice(6));
                } else if (msg.body.startsWith('!preview ')) {
                    const text = msg.body.slice(9);
                    msg.reply(text, null, {
                        linkPreview: true
                    });
                } else if (msg.body.startsWith('!desc ')) {
                    // Get chat and check if it is a group
                    let chat = await msg.getChat();

                    if (chat.isGroup) {
                        // Check if the sender is an admin
                        const isAdmin = chat.participants.find(participant => participant.id._serialized === msg.author && participant.isAdmin);

                        if (isAdmin) {
                            let newDescription = msg.body.slice(6);
                            try {
                                await chat.setDescription(newDescription);
                                msg.reply('Group description updated successfully.');
                            } catch (error) {
                                console.error('Error updating description:', error);
                                msg.reply('Failed to update the group description.');
                            }
                        } else {
                            msg.reply('You need to be an admin to change the group description.');
                        }
                    } else {
                        msg.reply('This command can only be used in a group!');
                    }
                } else if (msg.body.startsWith('!add ')) {
                    const group = await msg.getChat();

        // Check if the chat is a group chat
        if (!group.isGroup) {
            msg.reply('*[❎]* Perintah ini hanya untuk di Group saja');
            console.log('*[❎]* Perintah ini hanya untuk di Group saja');
            return;
        }

        // Get the participant list of the group
        const participants = group.participants;

        // Get the sender of the message
        const senderId = msg.author || msg.from;
        const isAdmin = participants.some(participant =>
            participant.id._serialized === senderId && participant.isAdmin
        );

        if (!isAdmin) {
            msg.reply('*[❎]* Hanya admin yang bisa menggunakan command ini!');
            console.log('*[❎]* Hanya admin yang bisa menggunakan command ini!');
            return;
        }
        const botId = group.client.info.wid._serialized;

        // Check if the bot is an admin in the group
        const isBotAdmin = participants.some(participant =>
            participant.id._serialized === botId && participant.isAdmin
        );

        if (!isBotAdmin) {
            msg.reply('*[❎]* Bot Harus menjadi admin dulu dong biar bisa tambah orang!');
            console.log('*[❎]* Bot Harus menjadi admin dulu dong biar bisa tambah orang!');
            return;
        }

        // Extract the phone number from the message body (assuming format "!add 6285xxxxxxx")
        let number = msg.body.slice(5).trim();

        // Validate and format the number
        if (!number.startsWith('6285')) {
            msg.reply('*[❎]* Nomor yang diundang harus dalam format *628xxxxx*!');
            console.log('*[❎]* Nomor yang diundang harus dalam format *628xxxxx*!');
            return;
        }

        // Check if the number matches the expected format
        const phoneRegex = /^628\d{6,11}$/; // Adjust regex for valid length of phone numbers
        if (!phoneRegex.test(number)) {
            msg.reply('*[❎]* Nomor yang diundang harus dalam format *628xxxxx*!');
            console.log('*[❎]* Nomor yang diundang harus dalam format *628xxxxx*!');
            return;
        }

        // Add participant to the group
        try {
            // The addParticipants method expects an array of numbers
            const result = await group.addParticipants([number + '@c.us'], {
                comment: 'Welcome broh!'
            });
            msg.reply('*[✅]* Successfully!');
            console.log('Successfully added:', result);
        } catch (error) {
            msg.reply('*[❎]* Gagal Brohhh....');
            console.log('*[❎]* Gagal Karena:', error);
        }
        } else if (msg.body === '!leave') {
            // Leave the group
            let chat = await msg.getChat();
            if (chat.isGroup) {
                chat.leave();
            } else {
                msg.reply('This command can only be used in a group!');
            }
        } else if (msg.body.startsWith('!join ')) {
            const inviteCode = msg.body.split(' ')[1];
            try {
                await client.acceptInvite(inviteCode);
                msg.reply('Joined the group!');
            } catch (e) {
                msg.reply('That invite code seems to be invalid.');
            }
        } else if (msg.body === '!groupinfo') {
            let chat = await msg.getChat();
            if (chat.isGroup) {
                try {
                    // Fetch the group photo URL using the client instance
                    const groupPhotoUrl = await client.getProfilePicUrl(chat.id._serialized);

                    if (groupPhotoUrl) {
                        console.log(`Group photo URL: ${groupPhotoUrl}`); // Log the photo URL for debugging

                        // Download the group photo
                        const response = await axios.get(groupPhotoUrl, {
                            responseType: 'arraybuffer'
                        });

                        if (response.status === 200) {
                            const mimeType = response.headers['content-type']; // Determine the MIME type from the response
                            const media = new MessageMedia(mimeType, Buffer.from(response.data, 'binary').toString('base64'), 'group-photo');

                            // Send the media message with a caption
                            await client.sendMessage(msg.from, media, {
                                        caption: `
*Group Details*
Name: ${chat.name}
ID Group: ${chat.id._serialized}
Description: ${chat.description || 'No description available'}
Created At: ${chat.createdAt.toString()}
Participant Count: ${chat.participants.length}
                            `
                        });
                    } else {
                        console.error('Failed to download the group photo.');
                        msg.reply('Failed to retrieve the group photo.');
                    }
                } else {
                    msg.reply(` *
                            Group Details *
                                Name: $ {
                                    chat.name
                                }
                            ID Group: $ {
                                chat.id._serialized
                            }
                            Description: $ {
                                chat.description || 'No description available'
                            }
                            Created At: $ {
                                chat.createdAt.toString()
                            }
                            Participant Count: $ {
                                chat.participants.length
                            }
                            Group Photo: No photo available `);
                }
            } catch (error) {
                console.error('Error fetching group photo:', error);
                msg.reply(` *
                                Group Details *
                                Name: $ {
                                    chat.name
                                }
                            ID Group: $ {
                                chat.id._serialized
                            }
                            Description: $ {
                                chat.description || 'No description available'
                            }
                            Created At: $ {
                                chat.createdAt.toString()
                            }
                            Participant Count: $ {
                                chat.participants.length
                            }
                            Group Photo: Could not retrieve the photo `);
            }
        } else {
            msg.reply('This command can only be used in a group!');
        }
    } else if (msg.body === '!chats') {
        const chats = await client.getChats();
        client.sendMessage(msg.from, `
                            The bot has $ {
                                chats.length
                            }
                            chats open.
                            `);
    } else if (msg.body === '!infoBot') {
        let info = client.info;

        try {
            // Fetch the user's profile picture URL
            const userProfilePicUrl = await client.getProfilePicUrl(info.wid._serialized);

            if (userProfilePicUrl) {
                // Download the user's profile picture
                const response = await axios.get(userProfilePicUrl, { responseType: 'arraybuffer' });

                if (response.status === 200) {
                    const mimeType = response.headers['content-type']; // Determine the MIME type from the response
                    const media = new MessageMedia(mimeType, Buffer.from(response.data, 'binary').toString('base64'), 'profile-pic');

                    // Send the media message with a caption
                    await client.sendMessage(msg.from, media, {
                        caption: `╭━━━━✎⌈
                            $ {
                                config.name
                            }
┃ • Server: www.razped.com
┃ • Version: 1.0.0
┃ • Nama: ${info.pushname}
┃ • Nomor WA: ${info.wid.user}
┃ • Tanggal: ${moment().tz(config.timezone).format('YYYY-MM-DD')}
┃ • Waktu: ${moment().tz(config.timezone).format('HH:mm:ss')}
╰━━━━━━━━━━━━დ`
                    });
                    } else {
                        console.error('Failed to download the profile picture.');
                        msg.reply('Failed to retrieve the profile picture.');
                    }
                    } else {
                        // If there's no profile picture, send text info only
                        msg.reply(`
*Connection Info*
User Name: ${info.pushname}
My Number: ${info.wid.user}
Platform: ${info.platform}
Profile Picture: No photo available
                `);
            }
        } catch (error) {
            console.error('Error fetching profile picture:', error);
            msg.reply(`
*Connection Info*
User Name: ${info.pushname}
My Number: ${info.wid.user}
Platform: ${info.platform}
Profile Picture: Could not retrieve the photo
            `);
        }
    } else if (msg.body === '!mediainfo' && msg.hasMedia) {
        const attachmentData = await msg.downloadMedia();
        msg.reply(` *
            Media info *
                MimeType: $ {
                    attachmentData.mimetype
                }
            Filename: $ {
                attachmentData.filename
            }
            Data(length): $ {
                attachmentData.data.length
            }
            `);
    } else if (msg.body === '!quoteinfo' && msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();

        quotedMsg.reply(`
            ID: $ {
                quotedMsg.id._serialized
            }
            Type: $ {
                quotedMsg.type
            }
            Author: $ {
                quotedMsg.author || quotedMsg.from
            }
            Timestamp: $ {
                quotedMsg.timestamp
            }
            Has Media ? $ {
                quotedMsg.hasMedia
            }
            `);
    } else if (msg.body === '!resendmedia' && msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg.hasMedia) {
            const attachmentData = await quotedMsg.downloadMedia();
            client.sendMessage(msg.from, attachmentData, { caption: 'Here\'s your requested media.' });
        }
        if (quotedMsg.hasMedia && quotedMsg.type === 'audio') {
            const audio = await quotedMsg.downloadMedia();
            await client.sendMessage(msg.from, audio, { sendAudioAsVoice: true });
        }
    } else if (msg.body === '!isviewonce' && msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg.hasMedia) {
            const media = await quotedMsg.downloadMedia();
            await client.sendMessage(msg.from, media, { isViewOnce: true });
        }
    } else if (msg.body === '!location') {
        // only latitude and longitude
        await msg.reply(new Location(37.422, -122.084));
        // location with name only
        await msg.reply(new Location(37.422, -122.084, { name: 'Googleplex' }));
        // location with address only
        await msg.reply(new Location(37.422, -122.084, { address: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA' }));
        // location with name, address and url
        await msg.reply(new Location(37.422, -122.084, { name: 'Googleplex', address: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA', url: 'https://google.com' }));
    } else if (msg.location) {
        msg.reply(msg.location);
    } else if (msg.body.startsWith('!status ')) {
        const newStatus = msg.body.split(' ')[1];
        await client.setStatus(newStatus);
        msg.reply(`
            Status was updated to * $ {
                newStatus
            }*`);
    } else if (msg.body === '!mentionUsers') {
        const chat = await msg.getChat();
        const userNumber = 'XXXXXXXXXX';
        /**
         * To mention one user you can pass user's ID to 'mentions' property as is,
         * without wrapping it in Array, and a user's phone number to the message body:
         */
        await chat.sendMessage(`
            Hi @$ {
                userNumber
            }
            `, {
            mentions: userNumber + '@c.us'
        });
        // To mention a list of users:
        await chat.sendMessage(`
            Hi @$ {
                userNumber
            }, @$ {
                userNumber
            }
            `, {
            mentions: [userNumber + '@c.us', userNumber + '@c.us']
        });
    } else if (msg.body === '!mentionGroups') {
        const chat = await msg.getChat();
        const groupId = 'YYYYYYYYYY@g.us';
        /**
         * Sends clickable group mentions, the same as user mentions.
         * When the mentions are clicked, it opens a chat with the mentioned group.
         * The 'groupMentions.subject' can be custom
         * 
         * @note The user that does not participate in the mentioned group,
         * will not be able to click on that mentioned group, the same if the group does not exist
         *
         * To mention one group:
         */
        await chat.sendMessage(`
            Check the last message here: @$ {
                groupId
            }
            `, {
            groupMentions: { subject: 'GroupSubject', id: groupId }
        });
        // To mention a list of groups:
        await chat.sendMessage(`
            Check the last message in these groups: @$ {
                groupId
            }, @$ {
                groupId
            }
            `, {
            groupMentions: [
                { subject: 'FirstGroup', id: groupId },
                { subject: 'SecondGroup', id: groupId }
            ]
        });
    } else if (msg.body === '!getGroupMentions') {
        // To get group mentions from a message:
        const groupId = 'ZZZZZZZZZZ@g.us';
        const msg = await client.sendMessage(chatId, `
            Check the last message here: @$ {
                groupId
            }
            `, {
            groupMentions: { subject: 'GroupSubject', id: groupId }
        });
        /** {@link groupMentions} is an array of `
            GroupChat ` */
        const groupMentions = await msg.getGroupMentions();
        console.log(groupMentions);
    } else if (msg.body === '!delete') {
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.fromMe) {
                quotedMsg.delete(true);
            } else {
                msg.reply('I can only delete my own messages');
            }
        }
    } else if (msg.body === '!pin') {
        const chat = await msg.getChat();
        await chat.pin();
    } else if (msg.body === '!archive') {
        const chat = await msg.getChat();
        await chat.archive();
    } else if (msg.body === '!mute') {
        const chat = await msg.getChat();
        // mute the chat for 20 seconds
        const unmuteDate = new Date();
        unmuteDate.setSeconds(unmuteDate.getSeconds() + 20);
        await chat.mute(unmuteDate);
    } else if (msg.body === '!typing') {
        const chat = await msg.getChat();
        // simulates typing in the chat
        chat.sendStateTyping();
    } else if (msg.body === '!recording') {
        const chat = await msg.getChat();
        // simulates recording audio in the chat
        chat.sendStateRecording();
    } else if (msg.body === '!clearstate') {
        const chat = await msg.getChat();
        // stops typing or recording in the chat
        chat.clearState();
    } else if (msg.body === '!jumpto') {
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            client.interface.openChatWindowAt(quotedMsg.id._serialized);
        }
    } else if (msg.body === '!buttons') {
        let button = new Buttons('Button body', [{ body: 'bt1' }, { body: 'bt2' }, { body: 'bt3' }], 'title', 'footer');
        client.sendMessage(msg.from, button);
    } else if (msg.body === '!list') {
        let sections = [
            { title: 'sectionTitle', rows: [{ title: 'ListItem1', description: 'desc' }, { title: 'ListItem2' }] }
        ];
        let list = new List('List body', 'btnText', sections, 'Title', 'footer');
        client.sendMessage(msg.from, list);
    } else if (msg.body === '!reaction') {
        msg.react('👍');
    } else if (msg.body === '!sendpoll') {
        /** By default the poll is created as a single choice poll: */
        await msg.reply(new Poll('Winter or Summer?', ['Winter', 'Summer']));
        /** If you want to provide a multiple choice poll, add allowMultipleAnswers as true: */
        await msg.reply(new Poll('Cats or Dogs?', ['Cats', 'Dogs'], { allowMultipleAnswers: true }));
        /**
         * You can provide a custom message secret, it can be used as a poll ID:
         * @note It has to be a unique vector with a length of 32
         */
        await msg.reply(
            new Poll('Cats or Dogs?', ['Cats', 'Dogs'], {
                messageSecret: [
                    1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                ]
            })
        );
    } else if (msg.body === '!edit') {
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.fromMe) {
                quotedMsg.edit(msg.body.replace('!edit', ''));
            } else {
                msg.reply('I can only edit my own messages');
            }
        }
    } else if (msg.body === '!updatelabels') {
        const chat = await msg.getChat();
        await chat.changeLabels([0, 1]);
    } else if (msg.body === '!addlabels') {
        const chat = await msg.getChat();
        let labels = (await chat.getLabels()).map((l) => l.id);
        labels.push('0');
        labels.push('1');
        await chat.changeLabels(labels);
    } else if (msg.body === '!removelabels') {
        const chat = await msg.getChat();
        await chat.changeLabels([]);
    } else if (msg.body === '!approverequest') {
        /**
         * Presented an example for membership request approvals, the same examples are for the request rejections.
         * To approve the membership request from a specific user:
         */
        await client.approveGroupMembershipRequests(msg.from, { requesterIds: 'number@c.us' });
        /** The same for execution on group object (no need to provide the group ID): */
        const group = await msg.getChat();
        await group.approveGroupMembershipRequests({ requesterIds: 'number@c.us' });
        /** To approve several membership requests: */
        const approval = await client.approveGroupMembershipRequests(msg.from, {
            requesterIds: ['number1@c.us', 'number2@c.us']
        });
        /**
         * The example of the {@link approval} output:
         * [
         *   {
         *     requesterId: 'number1@c.us',
         *     message: 'Rejected successfully'
         *   },
         *   {
         *     requesterId: 'number2@c.us',
         *     error: 404,
         *     message: 'ParticipantRequestNotFoundError'
         *   }
         * ]
         *
         */
        console.log(approval);
        /** To approve all the existing membership requests (simply don't provide any user IDs): */
        await client.approveGroupMembershipRequests(msg.from);
        /** To change the sleep value to 300 ms: */
        await client.approveGroupMembershipRequests(msg.from, {
            requesterIds: ['number1@c.us', 'number2@c.us'],
            sleep: 300
        });
        /** To change the sleep value to random value between 100 and 300 ms: */
        await client.approveGroupMembershipRequests(msg.from, {
            requesterIds: ['number1@c.us', 'number2@c.us'],
            sleep: [100, 300]
        });
        /** To explicitly disable the sleep: */
        await client.approveGroupMembershipRequests(msg.from, {
            requesterIds: ['number1@c.us', 'number2@c.us'],
            sleep: null
        });
    } else if (msg.body === '!pinmsg') {
        /**
         * Pins a message in a chat, a method takes a number in seconds for the message to be pinned.
         * WhatsApp default values for duration to pass to the method are:
         * 1. 86400 for 24 hours
         * 2. 604800 for 7 days
         * 3. 2592000 for 30 days
         * You can pass your own value:
         */
        const result = await msg.pin(60); // Will pin a message for 1 minute
        console.log(result); // True if the operation completed successfully, false otherwise
    } else if (msg.body.startsWith('!cekidml ')) {
        // const chatLower = msg.body.toLowerCase(); // Convert message body to lowercase
        const dataChat = msg.body.split(" "); // Split the message by space
    
        if (dataChat.length >= 3) {
            const target = dataChat[1];
            const server = dataChat[2];
            const url = `
            https: //api.razped.com/v1/check-nickname?key=dev-rusp81-abnd7O3-zRCFcGVCDP-p60-eHJK3-dHJK3&id=${target}&zone=${server}&type=mobile-legends`;

                axios.get(url)
                .then(response => {
                        const jsonResultNick = response.data;

                        let text;
                        if (!jsonResultNick.data || !jsonResultNick.data.nickname) {
                            text = '*ID Game tidak ditemukan*';
                        } else {
                            text = `╭━━━━✎ ⌈ *${config.name}* 
┃ => *ID Mobile Legends Ditemukan* 
┃ • ID: *${jsonResultNick.data.id}*
┃ • Server: *${server}*
┃ • Nickname: *${decodeURIComponent(jsonResultNick.data.nickname)}*
╰━━━━━━━━━━━━დ`;
                    }

                    msg.reply(text); // Assuming msg.reply is a function to send a reply
                    })
                    .catch(apiError => {
                        console.error('API Error:', apiError);
                        msg.reply('*Terjadi kesalahan saat memeriksa ID.*');
                    });
                    }
                    else {
                        msg.reply('*Perintah tidak valid atau parameter kurang.*');
                    }
                    } else if (msg.body.startsWith('!cekidff ')) {
                        // const chatLower = msg.body.toLowerCase(); // Convert message body to lowercase
                        const dataChat = msg.body.split(" "); // Split the message by space

                        if (dataChat.length >= 2) {
                            const target = dataChat[1];
                            const url = `https://api.razped.com/v1/check-nickname?key=dev-rusp81-abnd7O3-zRCFcGVCDP-p60-eHJK3-dHJK3&id=${target}&type=free-fire`;

                            axios.get(url)
                                .then(response => {
                                        const jsonResultNick = response.data;

                                        let text;
                                        if (!jsonResultNick.data || !jsonResultNick.data.nickname) {
                                            text = '*ID Game tidak ditemukan*';
                                        } else {
                                            text = `╭━━━━✎ ⌈ *${config.name}* 
┃ => *ID Free Fire Ditemukan* 
┃ • ID: *${jsonResultNick.data.id}*
┃ • Nickname: *${decodeURIComponent(jsonResultNick.data.nickname)}*
╰━━━━━━━━━━━━დ`;
                    }

                    msg.reply(text); // Assuming msg.reply is a function to send a reply
                    })
                    .catch(apiError => {
                        console.error('API Error:', apiError);
                        msg.reply('*Terjadi kesalahan saat memeriksa ID.*');
                    });
                    }
                    else {
                        msg.reply('*Perintah tidak valid atau parameter kurang.*');
                    }
                    } else if ((isGroups && config.groups) || !isGroups) {

        // Image to Sticker (Auto && Caption)
        if ((msg.type == "image" || msg.type == "video" || msg.type == "gif") || (msg._data.caption == `${config.prefix}sticker`)) {
            if (config.log) console.log(`[${'!'.red}] ${msg.from.replace("@c.us", "").yellow} created sticker`);
            client.sendMessage(msg.from, "*[⏳]* Loading..");
            try {
                const media = await msg.downloadMedia();
                client.sendMessage(msg.from, media, {
                    sendMediaAsSticker: true,
                    stickerName: config.name, // Sticker Name = Edit in 'config/config.json'
                    stickerAuthor: config.author // Sticker Author = Edit in 'config/config.json'
                }).then(() => {
                    client.sendMessage(msg.from, "*[✅]* Successfully!");
                });
            } catch {
                client.sendMessage(msg.from, "*[❎]* Failed!");
            }

            // Image to Sticker (With Reply Image)
        } else if (msg.type == "sticker") {
            if (config.log) console.log(`[${'!'.red}] ${msg.from.replace("@c.us", "").yellow} convert sticker into image`);
            client.sendMessage(msg.from, "*[⏳]* Loading..");
            try {
                const media = await msg.downloadMedia();
                client.sendMessage(msg.from, media).then(() => {
                    client.sendMessage(msg.from, "*[✅]* Successfully!");
                });
            } catch {
                client.sendMessage(msg.from, "*[❎]* Failed!");
            }

            // Sticker to Image (With Reply Sticker)
        } else if (msg.body.startsWith(`${config.prefix}change`)) {
            if (config.log) console.log(`[${'!'.red}] ${msg.from.replace("@c.us", "").yellow} change the author name on the sticker`);
            if (msg.body.includes('|')) {
                let name = msg.body.split('|')[0].replace(msg.body.split(' ')[0], '').trim();
                let author = msg.body.split('|')[1].trim();
                const quotedMsg = await msg.getQuotedMessage();
                if (msg.hasQuotedMsg && quotedMsg.hasMedia) {
                    client.sendMessage(msg.from, "*[⏳]* Loading..");
                    try {
                        const media = await quotedMsg.downloadMedia();
                        client.sendMessage(msg.from, media, {
                            sendMediaAsSticker: true,
                            stickerName: name,
                            stickerAuthor: author
                        }).then(() => {
                            client.sendMessage(msg.from, "*[✅]* Successfully!");
                        });
                    } catch {
                        client.sendMessage(msg.from, "*[❎]* Failed!");
                    }
                } else {
                    client.sendMessage(msg.from, "*[❎]* Reply Sticker First!");
                }
            } else {
                client.sendMessage(msg.from, `*[❎]* Run the command :\n*${config.prefix}change <name> | <author>*`);
            }

            // Read chat
        } else {
            client.getChatById(msg.id.remote).then(async (chat) => {
                await chat.sendSeen();
            });
        }
        }
        });
 client.on('message_create', async (msg) => {
    // Fired on all message creations, including your own
    if (msg.fromMe) {
        // do stuff here
    }

    // Unpins a message
    if (msg.fromMe && msg.body.startsWith('!unpin')) {
        const pinnedMsg = await msg.getQuotedMessage();
        if (pinnedMsg) {
            // Will unpin a message
            const result = await pinnedMsg.unpin();
            console.log(result); // True if the operation completed successfully, false otherwise
        }
    }
});

client.on('message_ciphertext', (msg) => {
    // Receiving new incoming messages that have been encrypted
    // msg.type === 'ciphertext'
    msg.body = 'Waiting for this message. Check your phone.';
    
    // do stuff here
});

client.on('message_revoke_everyone', async (after, before) => {
    // Fired whenever a message is deleted by anyone (including you)
    console.log('Deleted Message:', after); // message after it was deleted.
    
    if (before) {
        console.log('Original Message:', before); // message before it was deleted.
        
        // Extract necessary details from the original message
        const chat = await before.getChat();
        
        // Check the type of message and construct a reply accordingly
        if (before.type === 'chat') {
            // If the message was a text message
            await chat.sendMessage(`Pesan yang dihapus: "${before.body}"`);
        } else if (before.hasMedia) {
            // If the message had media, re-download and send it
            const media = await before.downloadMedia();
            await chat.sendMessage(media, { caption: `Media yang dihapus: ${before.caption || ''}` });
        } else if (before.type === 'vcard') {
            // If the message was a contact card
            await chat.sendMessage(before.body, { type: 'vcard' });
        } else {
            // Handle other types if necessary
            await chat.sendMessage('Sebuah pesan telah dihapus, tetapi tidak dapat diambil.');
        }
    }
});


client.on('message_revoke_me', async (msg) => {
    // Fired whenever a message is only deleted in your own view.
    console.log(msg.body); // message before it was deleted.
});

client.on('message_ack', (msg, ack) => {
    /*
        == ACK VALUES ==
        ACK_ERROR: -1
        ACK_PENDING: 0
        ACK_SERVER: 1
        ACK_DEVICE: 2
        ACK_READ: 3
        ACK_PLAYED: 4
    */

    if (ack == 3) {
        // The message was read
    }
});

client.on('group_join', async (notification) => {
    console.log('join', notification);

    try {
        const chat = await notification.getChat();

        // Fetch image from a URL
        const response = await axios.get('https://www.razped.com/library/media/logos/Icon-razped-76.png', {
            responseType: 'arraybuffer'
        });
        const media = new MessageMedia('image/jpeg', Buffer.from(response.data).toString('base64'));

        // Send the image with a caption
        await chat.sendMessage(media, {
            caption: 'Selamat datang di grup! 🎉\nHarap baca aturan grup.'
        });

        console.log('Welcome image and message sent.');
    } catch (error) {
        console.error('Failed to send welcome image:', error);
    }
});

client.on('group_leave', (notification) => {
    // User has left or been kicked from the group.
    console.log('leave', notification);
    notification.reply('User left.');
});

client.on('group_update', (notification) => {
    // Group picture, subject or description has been updated.
    console.log('update', notification);
});

client.on('change_state', state => {
    console.log('CHANGE STATE', state);
});

// Change to false if you don't want to reject incoming calls
let rejectCalls = true;

client.on('call', async (call) => {
    console.log('Call received, rejecting. GOTO Line 261 to disable', call);
    if (rejectCalls) await call.reject();
    await client.sendMessage(call.from, `[${call.fromMe ? 'Outgoing' : 'Incoming'}] Phone call from ${call.from}, type ${call.isGroup ? 'group' : ''} ${call.isVideo ? 'video' : 'audio'} call. ${rejectCalls ? 'This call was automatically rejected by the script.' : ''}`);
});


client.on('contact_changed', async (message, oldId, newId, isContact) => {
    /** The time the event occurred. */
    const eventTime = (new Date(message.timestamp * 1000)).toLocaleString();

    console.log(
        `The contact ${oldId.slice(0, -5)}` +
        `${!isContact ? ' that participates in group ' +
            `${(await client.getChatById(message.to ?? message.from)).name} ` : ' '}` +
        `changed their phone number\nat ${eventTime}.\n` +
        `Their new phone number is ${newId.slice(0, -5)}.\n`);

    /**
     * Information about the @param {message}:
     * 
     * 1. If a notification was emitted due to a group participant changing their phone number:
     * @param {message.author} is a participant's id before the change.
     * @param {message.recipients[0]} is a participant's id after the change (a new one).
     * 
     * 1.1 If the contact who changed their number WAS in the current user's contact list at the time of the change:
     * @param {message.to} is a group chat id the event was emitted in.
     * @param {message.from} is a current user's id that got an notification message in the group.
     * Also the @param {message.fromMe} is TRUE.
     * 
     * 1.2 Otherwise:
     * @param {message.from} is a group chat id the event was emitted in.
     * @param {message.to} is @type {undefined}.
     * Also @param {message.fromMe} is FALSE.
     * 
     * 2. If a notification was emitted due to a contact changing their phone number:
     * @param {message.templateParams} is an array of two user's ids:
     * the old (before the change) and a new one, stored in alphabetical order.
     * @param {message.from} is a current user's id that has a chat with a user,
     * whos phone number was changed.
     * @param {message.to} is a user's id (after the change), the current user has a chat with.
     */
});

client.on('group_admin_changed', (notification) => {
    if (notification.type === 'promote') {
        /** 
          * Emitted when a current user is promoted to an admin.
          * {@link notification.author} is a user who performs the action of promoting/demoting the current user.
          */
        client.sendMessage(`You were promoted by ${notification.author}`);
        console.log(`You were promoted by ${notification.author}`);
    } else if (notification.type === 'demote')
        /** Emitted when a current user is demoted to a regular user. */
        console.log(`You were demoted by ${notification.author}`);
        client.sendMessage(`You were demoted by ${notification.author}`);
});

client.on('group_membership_request', async (notification) => {
    /**
     * The example of the {@link notification} output:
     * {
     *     id: {
     *         fromMe: false,
     *         remote: 'groupId@g.us',
     *         id: '123123123132132132',
     *         participant: 'number@c.us',
     *         _serialized: 'false_groupId@g.us_123123123132132132_number@c.us'
     *     },
     *     body: '',
     *     type: 'created_membership_requests',
     *     timestamp: 1694456538,
     *     chatId: 'groupId@g.us',
     *     author: 'number@c.us',
     *     recipientIds: []
     * }
     *
     */
    console.log(notification);
    /** You can approve or reject the newly appeared membership request: */
    await client.approveGroupMembershipRequestss(notification.chatId, notification.author);
    await client.rejectGroupMembershipRequests(notification.chatId, notification.author);
});

client.on('message_reaction', async (reaction) => {
    console.log('REACTION RECEIVED', reaction);
});

client.on('vote_update', (vote) => {
    /** The vote that was affected: */
    console.log(vote);
});

client.on('message', msg => {


  if (msg.body == '!help') {
    let helpstring = `*`+ config.name + `*\n\n`
    moduleObjects.forEach(obj => {
      for (i = 0; i < obj.command.length; i++) {
        helpstring += `*${obj.command[i]}:* ${obj.description[i]}\n\n`
      }
    })
    msg.reply(helpstring);
  }

  for (const obj of moduleObjects) {
    for (const cmd of obj.command) {
      if (msg.body.includes(cmd)) {
        obj.operate(client, msg, state)
          .catch(error => {
            console.log(error);
            msg.reply("_Could not process your request :/_")
          })
        break;
      }
    }
  }
});

client.initialize();





async function sendMediaFromUrl(number, mediaUrl, caption = '') {
    try {
        // Fetch media from the URL
        const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
        const mimetype = response.headers['content-type'];
        const data = response.data.toString('base64');

        // Create a new MessageMedia object
        const media = new MessageMedia(mimetype, data);

        // Send the media message to the specified number
        await client.sendMessage(number, media, { caption });
        console.log('Media message sent successfully.');
    } catch (err) {
        console.error('Failed to send media message:', err);
    }
}

async function addParticipants(groupId, numbers) {
    try {
        const chat = await client.getChatById(groupId);

        // Check if chat is a group
        if (!chat.isGroup) {
            throw new Error('The specified chat is not a group.');
        }

        // Add participants
        await chat.addParticipants(numbers);
        console.log('Participants added successfully.');
    } catch (error) {
        console.error('Error adding participants:', error);
        throw error;
    }
}


app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.render('index');
});
app.get('/tes', (req, res) => {
    res.render('tes');
});
  
app.post('/api/send-media', checkDevice, async (req, res) => {
    
    const { number, mediaUrl, caption = '' } = req.query; // Use query parameters
     // Validasi input
     if (!number || !mediaUrl|| !caption) {
        return res.status(400).send({ status: false, message: "Missing required parameters: number, mediaUrl and caption." });
    }

    const phoneRegex = /^628\d{6,11}(@c\.us|@g\.us)$/; 
    if (!phoneRegex.test(number)) {
        return res.status(400).send({ status: false, message: "Nomor harus berawalan 628xxxxx dan diakhiri dengan @c.us atau @g.us." });
    }

    try {
      await sendMediaFromUrl(number, mediaUrl, caption);
      res.status(200).send({ status: true, message: "Media Message sent successfully", data: {number: number, caption: caption, mediaUrl: mediaUrl}});
    } catch (err) {
        console.error(`Failed to send media message for instance`, err);
        res.status(500).send({ status: false, message: "Failed to send media message.", error: err.toString() });
    }
});

app.post('/api/send-text', checkDevice, async (req, res) => {
    const { number, message } = req.query;
    
    // Validasi input
    if (!number || !message) {
        return res.status(400).send({ status: false, message: "Missing required parameters: number and message." });
    }

    const phoneRegex = /(@c\.us|@g\.us)$/; 
    if (!phoneRegex.test(number)) {
        return res.status(400).send({ status: false, message: "Nomor harus diakhiri dengan @c.us atau @g.us." });
    }

    if (number.endsWith('@g.us')) {
        // Handle group message
        try {
            // Implement logic to send message to a group
            await client.sendMessage(number, message);
            return res.status(200).send({ status: true, message: "Group message sent successfully", data: { number: number, message: message } });
        } catch (err) {
            console.error('Failed to send group message:', err);
            return res.status(500).send({ status: false, message: "Failed to send group message.", error: err.toString() });
        }
    } else if (number.endsWith('@c.us')) {
        const phoneRegex = /^628\d{6,11}/;
        if (!phoneRegex.test(number)) {
            return res.status(400).send({ status: false, message: "Nomor harus berawalan 628xxxxx" });
        }
        // Handle individual contact message
        try {
            // Implement logic to send message to an individual contact
            await client.sendMessage(number, message);
            return res.status(200).send({ status: true, message: "Contact message sent successfully", data: { number: number, message: message } });
        } catch (err) {
            console.error('Failed to send contact message:', err);
            return res.status(500).send({ status: false, message: "Failed to send contact message.", error: err.toString() });
        }
    }

    try {
        await client.sendMessage(number, message);
        // res.send({ success: true, message: "Message sent successfully." });
        res.status(200).send({ status: true, message: "Message sent successfully", data: {number: number, message: message}});
    } catch (err) {
        console.error('Failed to send message:', err);
        res.status(500).send({ status: false, message: "Failed to send message.", error: err.toString() });
    }
});

app.get('/api/add-member', async (req, res) => {
    const { groupId, number, caption } = req.query;

    if (!groupId || !number) {
        return res.status(400).send({ success: false, message: "Missing required parameters: groupId and number." });
    }

    console.log('Adding participants:', groupId, number);

    if (caption && caption.trim() !== '') {
        try {
            // Send caption to the group
            await client.sendMessage(groupId, caption);
        } catch (err) {
            console.error('Failed to send message:', err);
            return res.status(500).send({ success: false, message: "Failed to send caption.", error: err.toString() });
        }
    }

    const numbers = [number]; // Convert to array format

    try {
        await addParticipants(groupId, numbers);
        res.send({ success: true, message: "Added Successfully" });
    } catch (err) {
        console.error('Failed to add participants:', err);
        res.status(500).send({ success: false, message: "Failed to add participants.", error: err.toString() });
    }
});
