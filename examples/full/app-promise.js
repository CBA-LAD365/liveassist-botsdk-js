#!/usr/bin/env node

// This variant uses the promise style async interface.

var builder = require('botbuilder');
const contextData = require('./lib/contextData.js');
var restify = require('restify');
const liveAssist = require('@cafex/liveassist-botsdk-js');

//=========================================================
// Bot Setup
//=========================================================

const pollPeriodMilliseconds = 500;
const targetSkill = process.env.BOT_TARGET_SKILL;
// const targetAgent = '3b2fa840-b025-e711-80fc-f0921c1952dc';

const MODE = {
  BOT: 0,
  ESC_INITIATING: 1,
  ESC_INITIATED: 2,
  ESC_WAITING: 3,
  ESC_CHATTING: 4,
  ENDED: 5
};

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function() {
  console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
var connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

//=========================================================
// Bots Dialogs
//=========================================================

let conversations = new Map();

function serialize(chatData) {
  const answer = JSON.stringify(chatData);
  // console.log(`Serializing to    : %s`, answer);
  return answer;
}

function deserialize(data) {
  // console.log(`Deserializing from: %s`, data);
  return JSON.parse(data);
}

function getChatData(id) {
  let data = conversations.get(id);
  if (data) return deserialize(data);
}

function setChatData(id, chatData) {
  conversations.set(id, serialize(chatData));
}

function removeChatData(id) {
  conversations.delete(id);
}

function getOrInitChatData(session) {
  let id = session.message.address.conversation.id;
  let chatData = getChatData(id);
  if (!chatData) {
    chatData = {
      id: id,
      visitorAddress: session.message.address,
      visitorName: session.message.address.user.name,
      mode: MODE.BOT,
      transcript: liveAssist.newTranscript(),
    };
    setChatData(id, chatData);
  }
  return chatData;
}

function getChatDataOrError(id) {
  let chatData = getChatData(id);
  if (!chatData) {
    throw 'can\'t find';
  }
  return chatData;
}

function sendProactiveMessage(address, text) {
  var msg = new builder.Message().address(address);
  msg.text(text);
  bot.send(msg);
}

function addTranscriptLine(chatData, timestamp, isBot, line) {
  liveAssist.addTranscriptLine(chatData.transcript, {
    timestamp: timestamp,
    isBot: isBot,
    srcName: isBot ? 'bot' : 'visitor',
    line: line,
  });
}

bot.dialog('/', [
  (session, args, next) => {
    let chatData = getOrInitChatData(session);
    let escalatedChat;
    if (chatData.laChatState) escalatedChat = new liveAssist.Chat(chatData.laChatState);
    switch (chatData.mode) {
      case MODE.BOT:
        if (/^help/i.test(session.message.text)) {
          session.beginDialog('/checkAvailability');
        } else {
          let visitorText = session.message.text;
          addTranscriptLine(chatData, new Date(), false, visitorText);
          let botText = 'You said: "' + visitorText + '"';
          session.send(botText, session.message.text);
          addTranscriptLine(chatData, new Date(), true, botText);
          setChatData(chatData.id, chatData);
        }
        break;
      case MODE.ESC_INITIATED:
        if (/^stop/i.test(session.message.text)) {
          escalatedChat.endChat()
            .then(() => {
              session.send('Ok I\'ve stopped contacting an agent');
              chatData.laChatState = escalatedChat.getState();
              chatData.mode = MODE.BOT;
              setChatData(chatData.id, chatData);
            })
            .catch(() => {
              session.endConversation('A problem has occurred, starting over');
              removeChatData(chatData.id);
            });
        } else {
          session.send('Please wait, I\'m trying to connect you to an agent');
        }
        break;
      case MODE.ESC_WAITING:
        if (/^stop/i.test(session.message.text)) {
          escalatedChat.endChat()
            .then(() => {
              session.send('Ok I\'ve stopped waiting for an agent');
              chatData.laChatState = escalatedChat.getState();
              chatData.mode = MODE.BOT;
              setChatData(chatData.id, chatData);
            })
            .catch(() => {
              session.endConversation('A problem has occurred, starting over');
              removeChatData(chatData.id);
            });
        } else {
          session.send('Please wait, waiting for an agent');
        }
        break;
      case MODE.ESC_CHATTING:
        if (/^stop/i.test(session.message.text)) {
          escalatedChat.endChat()
            .then(() => {
              chatData.laChatState = escalatedChat.getState();
              chatData.mode = MODE.BOT;
              setChatData(chatData.id, chatData);
            })
            .catch(() => {
              session.endConversation('A problem has occurred, starting over');
              removeChatData(chatData.id);
            });
        } else {
          escalatedChat.addLine(session.message.text)
            .catch(() => session.send('A problem has occurred sending that'))
            .then(() => {
              chatData.laChatState = escalatedChat.getState();
              setChatData(chatData.id, chatData);
            });
        }
        break;
      default:
    }
  }
]);

bot.dialog('/checkAvailability', [
  (session, args, next) => {
    let chatData = getChatDataOrError(session.message.address.conversation.id);
    let escalatedChat;
    if (chatData.laChatState) {
      escalatedChat = new liveAssist.Chat(chatData.laChatState);
    } else {
      escalatedChat = new liveAssist.Chat();
    }
    const condition = {
      skill: targetSkill
    };
    escalatedChat.getAvailability(condition)
      .then((result) => {
        chatData.laChatState = escalatedChat.getState();
        setChatData(chatData.id, chatData);
        if (!result.availability) {
          session.send('Sorry, there are no agents available for you to chat to');
          session.endDialog();
        } else {
          session.beginDialog('/escalateQuery');
        }
      })
      .catch((err) => {
        chatData.laChatState = escalatedChat.getState();
        setChatData(chatData.id, chatData);
        console.error('Unable to get availability: %s', err);
        session.send('Sorry, I can\'t see if there are any agents available for you to chat to');
        session.endDialog();
      });
  }
]);

bot.dialog('/escalateQuery', [
  (session, args, next) => {
    builder.Prompts.confirm(session, 'Agents are available to help, would you like to chat to one?');
  }, (session, args, next) => {
    let userWantsToEscalate = args.response;
    if (userWantsToEscalate) {
      session.send('Ok, please wait while I connect you to an agent');
      escalate(session);
    } else {
      session.send('Ok');
    }
    session.endDialog();
  }
]);

bot.dialog('/endit', [(session, args, next) => {
  session.endConversation('Agent interaction has ended');
  removeChatData(session.message.address.conversation.id);
}]);

bot.dialog('/agentTyping', [(session, args, next) => {
  session.sendTyping();
  session.endDialog();
}]);

function escalate(session) {
  let chatData = getChatDataOrError(session.message.address.conversation.id);
  let escalatedChat = new liveAssist.Chat(chatData.laChatState);

  let spec = {
    skill: targetSkill,
    transcript: chatData.transcript,
    visitorName: chatData.visitorName,
  };
  // The following line enables sending of context data (according to the relevant environment variable).
  // Note however, that the real context data server (as configured by LA_CTX_DATA_HOST) will probably require
  // a correctly signed and correctly formatted JWT.
  if (process.env.BOT_CTX_DATA && process.env.BOT_CTX_DATA === 'true') spec.getContextDataSpec = contextData.createContextDataSpec;

  escalatedChat.requestChat(spec)
    .then((suc) => {
      chatData.laChatState = escalatedChat.getState();
      setChatData(chatData.id, chatData);
      if (suc && suc.warnings) {
        console.warn('Chat has succeeded, but with warnings:');
        suc.warnings.forEach((w) => console.warn('  %s', w.msg));
      }
      chatData.mode = MODE.ESC_INITIATED;
      pollChat(chatData.id);
    })
    .catch((err) => {
      chatData.laChatState = escalatedChat.getState();
      setChatData(chatData.id, chatData);
      console.error('Failed to start chat - %s', err);
      session.send('Sorry, failed to contact an agent');
      chatData.mode = MODE.BOT;
    });
}

function processEvents(events, chatData, agentName) {
  let endRead = false;
  events.forEach((event) => {
    switch (event.type) {
      case 'state':
        switch (event.state) {
          case 'waiting':
            chatData.mode = MODE.ESC_WAITING;
            break;
          case 'chatting':
            chatData.mode = MODE.ESC_CHATTING;
            break;
          case 'ended':
            endRead = true;
            bot.beginDialog(chatData.visitorAddress, '*:/endit', chatData);
            break;
          default:
            break;
        }
        break;
      case 'line':
        if (event.source !== 'visitor') {
          let msg = event.text;
          if (event.source === 'agent') {
            msg = agentName + ': ' + msg;
          }
          sendProactiveMessage(chatData.visitorAddress, msg);
        }
        break;
      default:
        break;
    }
  });
  return endRead;
}

function reportIfAgentIsTyping(isAgentTyping, chatData) {
  const visitorAddress = chatData.visitorAddress;
  if (visitorAddress && isAgentTyping) {
    bot.beginDialog(chatData.visitorAddress, '*:/agentTyping', chatData);
  }
}

function pollChat(id) {
  let chatData = getChatDataOrError(id);
  let escalatedChat = new liveAssist.Chat(chatData.laChatState);

  let endRead = false;
  escalatedChat.poll()
    .then((result) => {
      chatData.laChatState = escalatedChat.getState();
      endRead = processEvents(result.events, chatData, result.info.agentName);
      if (!endRead) reportIfAgentIsTyping(result.info.isAgentTyping, chatData);
    })
    .catch((err) => {
      chatData.laChatState = escalatedChat.getState();
      console.error('Error during poll: %s', err.message);
    })
    .then(() => {
      setChatData(chatData.id, chatData);
      if (!endRead) setTimeout(() => pollChat(id), pollPeriodMilliseconds);
    });
}
