# CafeX Live Assist BOT SDK - nodejs, example
The CafeX Live Assist BOT SDK provides a means for an automated chat endpoint (a bot) to escalate a conversation such that the visitor can interact with a CafeX Live Assist (human) agent.

The SDK is designed to be used server-side in a nodejs environment.

This is a basic example application using the [Microsoft Bot Framework (nodejs)](https://docs.microsoft.com/en-us/bot-framework/nodejs/bot-builder-nodejs-overview) that can be run on a local computer to illustrate the use of the SDK.

For new conversations with a visitor, the example bot will echo back anything that it receives as chat input. Then, when a line beginning with the string 'help' (case-insensitive) is received, the conversation will be escalated though CafeX Live Assist to an agent. An agent can then pick up the conversation; thereafter the bot will relay the conversation between the visitor an the agent.

The BOT SDK documentation should be consulted in conjunction with exploration of these examples.

## Running the Bot

A script is defined for running the bot: `npm run bot-liveassist`. Relevant environment variables, both those specified by the SDK and, if any, those of the example bot, should be set before running these commands. Typically, these are:

* `LA_ACCOUNT_ID` - The example as is requires this (note that the SDK has the option of not requiring this to be set if the account id is used in the SDK instance constructor - see the SDK API documentation).
* `BOT_TARGET_SKILL` - this value is optional, however if it is not set then no agent skill will be targeted for chat (which means that any agent in the organisation can pick it up).

For example:

Linux/Mac shell:
````sh
% LA_ACCOUNT_ID=12345678 BOT_TARGET_SKILL=my-skill npm run bot-liveassist
````
Windows cmd:
````sh
% set "LA_ACCOUNT_ID=12345678" & set "BOT_TARGET_SKILL=my-skill" & npm run bot-liveassist
````

Running these will cause the bot to listen on port 3978 (a different port can be specified via the environment variable 'port' or 'PORT').

The bot can be exercised using the [Microsoft Bot Framework Emulator](https://docs.microsoft.com/en-us/bot-framework/debug-bots-emulator), setting the endpoint URL to `http://localhost:3978/api/messages`.