/**
 * Cafex Chat module.
 * @module liveassist
 */
require('dotenv').config();

const http = require('http');
const https = require('https');
const querystring = require('querystring');
const urlUtil = require('url');
const VError = require('verror').VError;
const winston = require('winston');
const util = require('util');
const fs = require('fs');

const configuredConversationDomain = process.env.LA_CONVERSATION_DOMAIN;
const configuredAccountId = process.env.LA_ACCOUNT_ID;
const configuredAppKey = process.env.LA_APP_KEY || '721c180b09eb463d9f3191c41762bb68';

const configuredContextDataHost = process.env.LA_CTX_DATA_HOST;
const configuredContextDataPath = process.env.LA_CTX_DATA_PATH || '/context-service/context';

winston.level = process.env.LA_LOG_LEVEL || 'warn';

const PHASE = {
  INITIAL: 0,
  REQUESTED: 1,
  INFO_OBTAINED: 2,
  END_DELIVERED: 3,
};

// _stateSchema = {
//   'type': 'object',
//   'properties': {
//     'phase': {
//       'type': PHASE
//     },
//     'accountId': {
//       'type': 'string'
//     },
//     'conversationDomain': {
//       'type': 'string'
//     },
//     'chatNextLink': {
//       'type': 'string'
//     },
//     'info': {
//       'type': 'object'
//     },
//     'chatLinks': {
//       'type': 'object'
//     },
//     'bufferedData': {
//       'type': 'object',
//       'properties' : {
//         'events': {
//           'type': 'array',
//           'items': {
//              'type': 'object'
//           },
//         },
//         'info': {
//           'type': 'object',
//           'properties' : {
//           },
//         },
//         'isFresh': {
//           'type': 'boolean',
//         }
//       },
//     },
//   },
//   'required': ['phase']
// };

function cleanChatState(chat) {
  chat[_state].phase = PHASE.INITIAL;
  delete chat[_state].chatNextLink;
  delete chat[_state].info;
  delete chat[_state].chatLinks;
  chat[_state].bufferedData = {
    events: [],
    info: {},
    isFresh: false,
  };
}

function hasEndEvent(upstreamEvents) {
  let answer = false;
  upstreamEvents.forEach((ev) => {
    if (ev.type === 'state' && ev.state === 'ended') answer = true;
  });
  return answer;
}

function newInitialState(accountId) {
  return {
    phase: PHASE.INITIAL,
    accountId: accountId,
    conversationDomain: configuredConversationDomain,
    bufferedData: {
      events: [],
      info: {},
      isFresh: false,
    },
  };
}

function postContextData(accountId, contextDataSpec, successCb, errorCb) {
  let contextData = contextDataSpec.contextData;
  let contextDataCertificate = contextDataSpec.contextDataCertificate;
  winston.debug('saveContextData: accountId=%s, contextData=%s, contextDataCertificate=%s, contextDataHost=%s', accountId, contextData, contextDataCertificate, contextDataSpec.contextDataHost);
  if (!contextDataSpec.contextDataHost) winston.debug('saveContextData: no supplied context data host, configured context data host is %s', configuredContextDataHost);
  let contextDataHost = contextDataSpec.contextDataHost || configuredContextDataHost;
  if (!contextDataHost) return errorCb(new VError('context data host is neither set nor configured'));

  const body = JSON.stringify({
    accountId: accountId,
    contextData: contextData
  });
  const url = urlUtil.parse(urlUtil.format('//' + contextDataHost + configuredContextDataPath), false, true);
  let ca;
  let rejectUnauthorized = true;
  if (contextDataCertificate) {
    if (contextDataCertificate === 'accept') {
      rejectUnauthorized = false;
    } else {
      try {
        ca = fs.readFileSync(contextDataCertificate);
      } catch (e) {
        ca = contextDataCertificate;
      }
    }
  }
  const postEventOptions = {
    method: 'post',
    hostname: url.hostname,
    port: url.port,
    path: url.path,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    },
    rejectUnauthorized: rejectUnauthorized,
    ca: ca,
  };
  const req = https.request(postEventOptions, (res) => {
    const statusCode = res.statusCode;
    if (statusCode !== 201) {
      res.resume();
      return errorCb(new VError(`Error posting context data: ${statusCode}, ${res.statusMessage}`));
    }
    return successCb();
  });
  req.setTimeout(5000, () => {
    winston.error('postContextData: timeout on request, aborting');
    req.abort();
  });
  req.on('error', err => {
    return errorCb(new VError(err, 'Error posting context data'));
  });
  req.write(body);
  req.end();
}

function postEvent(events_link, eventJson, successCb, errorCb) {
  const url = urlUtil.parse(events_link, true);
  url.query.v = 1;
  url.query.appKey = configuredAppKey;
  url.search = '?' + querystring.stringify(url.query);
  const postEventOptions = {
    method: 'post',
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(eventJson)
    }
  };
  const req = https.request(postEventOptions, (res) => {
    const statusCode = res.statusCode;
    if (statusCode !== 201) {
      res.resume();
      return errorCb(new VError(`Error posting event: ${statusCode}, ${res.statusMessage}`));
    }
    return successCb();
  });
  req.on('error', err => {
    return errorCb(new VError(err, 'Error posting event'));
  });
  req.write(eventJson);
  req.end();
}

function processEvents(downstreamEvents) {
  let ended = false;
  const upstreamEvents = [];

  function handleEvent(ev) {
    switch (ev['@type']) {
      case 'state':
        const state = ev.state;
        if (state === 'ended') ended = true;
        upstreamEvents.push({
          type: 'state',
          time: ev.time,
          state: state
        });
        break;
      case 'line':
        winston.silly('%s : %s : %s : %s', ev.time, ev.source, ev.systemMessageId, ev.text);
        if (ev.source !== 'system' || ev.systemMessageId !== 0) {
          upstreamEvents.push({
            type: 'line',
            time: ev.time,
            text: ev.text + "",
            source: ev.source
          });
        }
        break;
      default:
        winston.warn('Unhandled ev type ' + ev['@type']);
        break;
    }
  }

  if (downstreamEvents.event) {
    if (Array.isArray(downstreamEvents.event)) {
      downstreamEvents.event.forEach((event) => handleEvent(event));
    } else {
      handleEvent(downstreamEvents.event);
    }
  }

  return {
    isChatEnded: ended,
    events: upstreamEvents
  };
}

function processTranscriptLines(transcriptLines) {
  function addLine(line, toAnswer) {
    if (typeof line !== 'string') throw new VError('line should be a string');
    toAnswer.push(line);
  }
  if (!transcriptLines) return;
  let lines = transcriptLines.lines;
  if (!lines || !Array.isArray(lines)) throw new VError('unexpected transcript lines format');
  if (lines.length === 0) return;
  let answer = [];
  lines.forEach((line) => addLine(line, answer));
  return {
    line: answer
  };
}

function requestDomain(accountId, callback) {
  winston.debug('requestDomain');
  const req = http.get(`http://api.liveperson.net/api/account/${accountId}/service/conversationVep/baseURI.json?version=1.0`, (res) => {
    const statusCode = res.statusCode;
    if (statusCode !== 200) {
      res.resume();
      return callback(new VError('Error retrieving conversation domain: ' + res.statusCode + ', ' + res.statusMessage));
    }

    let body = [];
    res.on('error', err => {
      return callback(new VError(err, 'Error retrieving conversation domain'));
    });
    res.on('data', data => {
      body.push(data);
    });
    res.on('end', () => {
      body = Buffer.concat(body).toString();
      const jsonBody = JSON.parse(body);
      return callback(null, jsonBody.baseURI);
    });
  });
  req.on('error', err => {
    return callback(new VError(err, 'Error retrieving chat info'));
  });
}

function setState(chat, state) {
  chat[_state] = state;
}

function qual(urlStr) {
  const url = urlUtil.parse(urlStr, true);
  url.pathname += '.json';
  url.query.v = 1;
  url.query.appKey = configuredAppKey;
  delete url.search;
  return urlUtil.format(url);
}

const getAvailability = Symbol('getAvailability');
const requestChat = Symbol('requestChat');
const retrieveChat = Symbol('retrieveChat');
const setVisitorName = Symbol('setVisitorName');
const _state = Symbol('_state');

const Chat = (function() {
  /**
   * @constructor 
   */
  function Chat(stateData) {
    if (stateData === undefined) {
      winston.debug('New Chat with no state, configured account is %s', configuredAccountId);
      if (configuredAccountId === undefined) throw new VError('An account id is neither provided nor configured');
      setState(this, newInitialState(configuredAccountId));
    } else if (typeof stateData === 'object') {
      winston.debug('New Chat with state');
      let unparsedState = stateData.unparsedState;
      if (unparsedState === undefined) throw new VError('Unable to use state data, corrupted');
      const state = JSON.parse(unparsedState);
      winston.silly('New Chat with state=%s', util.inspect(state));
      setState(this, state);
    } else {
      winston.debug('New Chat with account id %s', stateData);
      setState(this, newInitialState(stateData));
    }
  }

  Chat.prototype[getAvailability] = function(options, successCb, errorCb) {
    let thisChat = this;

    let queries = querystring.parse(`v=1&appKey=${configuredAppKey}`);
    if (options && options.skill) queries.skill = options.skill;
    let queryStr = querystring.stringify(queries);
    let path = `/api/account/${thisChat[_state].accountId}/chat/availability.json?${queryStr}`;

    const requestOptions = {
      hostname: thisChat[_state].conversationDomain,
      path: path,
      headers: {
        'Accept': 'application/json'
      }
    };
    winston.silly('Getting availability %s', requestOptions);
    const req = https.get(requestOptions, (res) => {
      const statusCode = res.statusCode;
      if (statusCode !== 200) {
        res.resume();
        return errorCb(new VError('Error getting chat availability: ' + res.statusCode + ', ' + res.statusMessage));
      }

      let body = [];
      res.on('error', err => {
        return errorCb(new VError(err, 'Error getting chat availability'));
      });
      res.on('data', data => {
        body.push(data);
      });
      res.on('end', () => {
        body = Buffer.concat(body).toString();
        const jsonBody = JSON.parse(body);
        return successCb(jsonBody);
      });
    });
    req.on('error', err => {
      return errorCb(new VError(err, 'Error getting chat availability'));
    });
  };

  Chat.prototype[requestChat] = function(requestChatSpec, successCb, errorCb) {
    let thisChat = this;

    // Reset the state here to remove old chat data, rather than attempting to baulk
    // on an existing chat which might have not ended. Maintaining and acting on an
    // ended state could end up messy.
    cleanChatState(thisChat);

    let processedTranscript;
    try {
      processedTranscript = processTranscriptLines(requestChatSpec.transcript);
    } catch (e) {
      return errorCb(new VError('Error processing transcript lines', e));
    }
    const chatRequestData = {
      request: {
        skill: requestChatSpec.skill,
        agent: requestChatSpec.agent,
        preChatLines: processedTranscript,
      }
    };
    winston.debug('[requestChat], chatRequestData=%s', util.inspect(chatRequestData, {
      depth: null
    }));

    const body = JSON.stringify(chatRequestData);

    const chatRequestOptions = {
      method: 'post',
      hostname: thisChat[_state].conversationDomain,
      path: `/api/account/${thisChat[_state].accountId}/chat/request.json?v=1&appKey=${configuredAppKey}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(chatRequestOptions, (res) => {
      const statusCode = res.statusCode;
      if (statusCode !== 201) {
        res.resume();
        return errorCb(new VError('Error requesting chat: ' + res.statusCode + ', ' + res.statusMessage));
      }
      thisChat[_state].phase = PHASE.REQUESTED;
      thisChat[_state].chatNextLink = res.headers.location;
      return successCb();
    });
    req.on('error', err => {
      return errorCb(new VError(err, 'Error requesting chat'));
    });
    req.write(body);
    req.end();
  };

  Chat.prototype[retrieveChat] = function(successCb, errorCb) {
    let thisChat = this;

    const retrieveChatInfoOptions = qual(thisChat[_state].chatNextLink);
    winston.silly('Polling using options=%s', retrieveChatInfoOptions);
    const req = https.get(retrieveChatInfoOptions, (res) => {
      const statusCode = res.statusCode;
      if (statusCode !== 200) {
        res.resume();
        return errorCb(new VError('Error retrieving chat info : ' + res.statusCode + ', ' + res.statusMessage));
      }

      let body = [];
      res.on('error', err => {
        return errorCb(new VError(err, 'Error retrieving chat info'));
      });
      res.on('data', data => {
        body.push(data);
      });
      res.on('end', () => {
        body = Buffer.concat(body).toString();
        const jsonBody = JSON.parse(body);
        const downstreamEvents = jsonBody.chat.events;
        const upstreamEvents = processEvents(downstreamEvents);
        thisChat[_state].phase = PHASE.INFO_OBTAINED;
        thisChat[_state].chatNextLink = jsonBody.chat.link[3]['@href'];
        thisChat[_state].info = jsonBody.chat.info;
        thisChat[_state].chatLinks = {
          visitorNameLink: jsonBody.chat.info.link[1]['@href'],
          events_link: jsonBody.chat.link[1]['@href'],
          transcript_request_link: jsonBody.chat.link[4]['@href'],
          transcript_with_subject_request_link: jsonBody.chat.link[5]['@href'],
          exit_survey_link: jsonBody.chat.link[6]['@href'],
          custom_variables_link: jsonBody.chat.link[7]['@href'],
          nextEventPoll: downstreamEvents.link[1]['@href']
        };
        thisChat[_state].bufferedData.events = thisChat[_state].bufferedData.events.concat(upstreamEvents.events);
        thisChat[_state].bufferedData.info = {
          agentName: thisChat[_state].info.agentName ? thisChat[_state].info.agentName : 'unknown',
          isAgentTyping: thisChat[_state].info.agentTyping === 'typing',
          chatTimeout: thisChat[_state].info.chatTimeout,
          lastUpdate: thisChat[_state].info.lastUpdate,
          startTime: thisChat[_state].info.startTime,
        };
        thisChat[_state].bufferedData.isFresh = true;
        return successCb(upstreamEvents.events);
      });
    });
    req.on('error', err => {
      return errorCb(new VError(err, 'Error retrieving chat info'));
    });
  };

  Chat.prototype[setVisitorName] = function(visitorName, successCb, errorCb) {
    let thisChat = this;

    const visitorNameData = {
      visitorName: visitorName,
    };

    const body = JSON.stringify(visitorNameData);

    const url = urlUtil.parse(thisChat[_state].chatLinks.visitorNameLink, true);

    const requestOptions = {
      method: 'post',
      hostname: url.hostname,
      path: url.pathname + `.json?v=1&appKey=${configuredAppKey}`,
      headers: {
        'X-HTTP-Method-Override': 'PUT',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    };
    winston.silly('Setting visitorName to be %s using %s', visitorName, requestOptions);
    const req = https.request(requestOptions, (res) => {
      const statusCode = res.statusCode;
      if (statusCode !== 200) {
        res.resume();
        return errorCb(new VError('Error setting visitor name: ' + res.statusCode + ', ' + res.statusMessage));
      }
      return successCb();
    });
    req.on('error', err => {
      return errorCb(new VError(err, 'Error setting visitor name'));
    });
    req.write(body);
    req.end();
  };

  Chat.prototype.addLine = function(line, callback) {
    let thisChat = this;
    const phase = thisChat[_state].phase;
    const chatLinks = thisChat[_state].chatLinks;
    if (phase === PHASE.END_DELIVERED || !chatLinks) return callback(new VError('A chat is not in progress'));

    let eventJson = JSON.stringify({
      event: {
        '@type': 'line',
        text: line
      }
    });
    let eventsLink = thisChat[_state].chatLinks.events_link;
    if (callback) {
      postEvent(eventsLink, eventJson, (arg) => callback(null, arg), callback);
    } else {
      return new Promise((resolve, reject) => postEvent(eventsLink, eventJson, resolve, reject));
    }
  };

  Chat.prototype.endChat = function(callback) {
    let thisChat = this;
    const phase = thisChat[_state].phase;
    const chatLinks = thisChat[_state].chatLinks;
    if (phase === PHASE.END_DELIVERED || !chatLinks) return callback(new VError('A chat is not in progress'));

    let eventJson = JSON.stringify({
      event: {
        '@type': 'state',
        state: 'ended'
      }
    });
    let eventsLink = thisChat[_state].chatLinks.events_link;
    if (callback) {
      postEvent(eventsLink, eventJson, (arg) => callback(null, arg), callback);
    } else {
      return new Promise((resolve, reject) => postEvent(eventsLink, eventJson, resolve, reject));
    }
  };

  Chat.prototype.getAvailability = function(options, callback) {
    winston.debug('Get availability, state=%s', util.inspect(this[_state]));
    let thisChat = this;

    function doGetAvailability(successCb, errorCb) {
      thisChat[getAvailability](options, successCb, errorCb);
    }

    if (!options || typeof options !== 'object') throw new VError('Expecting object (options) as first argument');

    if (callback) {
      if (!thisChat[_state].conversationDomain) {
        requestDomain(thisChat[_state].accountId, (err, domain) => {
          if (err) return callback(err);
          thisChat[_state].conversationDomain = domain;
          doGetAvailability(availability => callback(null, availability), callback);
        });
      } else {
        doGetAvailability(availability => callback(null, availability), callback);
      }
    } else {
      return new Promise((resolve, reject) => {
        if (!thisChat[_state].conversationDomain) {
          requestDomain(thisChat[_state].accountId, (err, domain) => {
            if (err) return reject(err);
            thisChat[_state].conversationDomain = domain;
            doGetAvailability(resolve, reject);
          });
        } else {
          doGetAvailability(resolve, reject);
        }
      });
    }
  };

  Chat.prototype.getState = function() {
    return {
      unparsedState: JSON.stringify(this[_state]),
    };
  };

  Chat.prototype.poll = function(callback) {
    let thisChat = this;
    // winston.debug('Poll chat, state=%s', util.inspect(thisChat[_state]));
    const phase = thisChat[_state].phase;
    if (phase === PHASE.END_DELIVERED) return callback(new VError('A chat is not in progress'));

    function bufferedDataToConsume() {
      return thisChat[_state].bufferedData.isFresh;
    }

    function consumeBufferedData() {
      const answer = {};
      answer.events = thisChat[_state].bufferedData.events.splice(0);
      answer.info = thisChat[_state].bufferedData.info;
      thisChat[_state].bufferedData.isFresh = false;
      if (hasEndEvent(answer.events)) thisChat[_state].phase = PHASE.END_DELIVERED;
      return answer;
    }

    // If there is unconsumed data, pass it back, otherwise get some more. Either way remove
    // (consume) it afterwards. Unconsumed data will happen if a retrieval of data is done
    // after the chat has been initiated. This would normally only happen on the first poll.
    if (callback) {
      if (bufferedDataToConsume()) {
        callback(null, consumeBufferedData());
      } else {
        if (!thisChat[_state].chatNextLink) return callback(new VError('A chat is not in progress'));
        thisChat[retrieveChat](() => callback(null, consumeBufferedData()), callback);
      }
    } else {
      return new Promise((resolve, reject) => {
        if (bufferedDataToConsume()) {
          resolve(consumeBufferedData());
        } else if (!thisChat[_state].chatNextLink) {
          resolve(new VError('A chat is not in progress'));
        } else {
          thisChat[retrieveChat](() => resolve(consumeBufferedData()), reject);
        }
      });
    }
  };

  Chat.prototype.requestChat = function(requestChatSpec, callback) {
    winston.debug('Request chat, state=%s', util.inspect(this[_state]));
    let thisChat = this;

    function doPostContextData(contextDataSpec, successCb, errorCb) {
      postContextData(thisChat[_state].accountId, contextDataSpec, successCb, errorCb);
    }

    function doRetrieveThenPostContextData(successCb, errorCb) {
      if (!requestChatSpec.getContextDataSpec || typeof requestChatSpec.getContextDataSpec !== 'function') return successCb();

      let contextId = thisChat[_state].info.rtSessionId + '';
      try {
        requestChatSpec.getContextDataSpec(contextId, (err, contextDataSpec) => {
          if (err) return errorCb(new VError('Error returned from client getContextData', err));
          if (contextDataSpec.contextData) {
            doPostContextData(contextDataSpec, successCb, errorCb);
          } else {
            successCb();
          }
        });
      } catch (e) {
        errorCb(new VError('Error thrown from client getContextData', e));
      }
    }

    function doSetVisitorName(successCb, errorCb) {
      if (!requestChatSpec.visitorName) return doRetrieveThenPostContextData(successCb, errorCb);
      // The following for a stab at continuing with warnings in the event of visitor setting failure
      // thisChat[setVisitorName](requestChatSpec.visitorName, () => doRetrieveThenPostContextData(successCb, errorCb), (err) => doRetrieveThenPostContextData((arg) => successCb(merge(arg, err)), errorCb));
      thisChat[setVisitorName](requestChatSpec.visitorName, () => doRetrieveThenPostContextData(successCb, errorCb), errorCb);
    }

    function doRetrieveChat(successCb, errorCb) {
      thisChat[retrieveChat](() => doSetVisitorName(successCb, errorCb), errorCb);
    }

    function doRequestChat(successCb, errorCb) {
      function endChat(err) {
        thisChat.endChat(() => {});
        cleanChatState(thisChat);
        errorCb(err);
      }
      thisChat[requestChat](requestChatSpec, () => doRetrieveChat(successCb, endChat), errorCb);
    }

    // Programmer error, throw
    if (!requestChatSpec || typeof requestChatSpec !== 'object') throw new VError('Expecting object (request chat spec) as first argument');

    if (callback) {
      if (!thisChat[_state].conversationDomain) {
        requestDomain(thisChat[_state].accountId, (err, domain) => {
          if (err) return callback(err);
          thisChat[_state].conversationDomain = domain;
          doRequestChat((arg) => callback(null, arg), callback);
        });
      } else {
        doRequestChat((arg) => callback(null, arg), callback);
      }
    } else {
      return new Promise((resolve, reject) => {
        if (!thisChat[_state].conversationDomain) {
          requestDomain(thisChat[_state].accountId, (err, domain) => {
            if (err) return reject(err);
            thisChat[_state].conversationDomain = domain;
            doRequestChat(resolve, reject);
          });
        } else {
          doRequestChat(resolve, reject);
        }
      });
    }
  };

  return Chat;
})();

function newTranscript() {
  return {
    lines: []
  };
}

function addTranscriptLine(lines, transcriptLine) {
  let timestamp = transcriptLine.timestamp;
  let isBot = (transcriptLine.isBot && transcriptLine.isBot === true) ? '+' : '';
  let srcName = transcriptLine.srcName;
  let line = transcriptLine.line;

  if (!timestamp) throw new VError('timestamp should be a Date');
  let time;
  try {
    time = timestamp.toISOString();
  } catch (e) {
    throw new VError('timestamp should be a Date');
  }
  if (!srcName || typeof srcName !== 'string') throw new VError('srcName should be a string');
  if (!line || typeof line !== 'string') throw new VError('line should be a string');

  lines.lines.push(time + ' ' + isBot + srcName + ': ' + line);
}

/**
 * @classdesc Encapsulates facilities for initiating a chat with an agent.
 */
exports.Chat = Chat;
exports.newTranscript = newTranscript;
exports.addTranscriptLine = addTranscriptLine;