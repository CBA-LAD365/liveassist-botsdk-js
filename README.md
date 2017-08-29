# CaféX Live Assist BOT SDK - nodejs
The CaféX Live Assist SDK provides a means for an automated chat endpoint (a bot) to escalate a conversation such that the visitor can interact with a (human) agent in CaféX Live Assist.

The SDK is designed to be used server-side in a nodejs environment.

Once a bot has determined that it wants to put the visitor in touch with an agent, the SDK is employed and a call made to request a chat. Subsequent operation involves polling the SDK for data relating to the conversation. Thereafter the bot behaves as a relay between the visitor and the agent.

## Install

````JavaScript
npm install @cafex/liveassist-botsdk-js
````

## Usage

Please see the [Quickstart Guide](https://www.liveassistfor365.com/en/support/knowledge-base/chat-bots/bot-escalation-sdk-js-quickstart/) for instructions on how to start using the SDK. The [Live Assist Knowledge Base](https://www.liveassistfor365.com/en/support/knowledge-base/chat-bots/) provides further information and more advanced uses of the SDK.