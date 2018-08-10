# CaféX Live Assist BOT SDK - nodejs
The CaféX Live Assist SDK provides a means for an automated chat endpoint (a bot) to escalate a conversation such that the visitor can interact with a (human) agent in CaféX Live Assist.

The SDK is designed to be used server-side in a nodejs environment.

Once a bot has determined that it wants to put the visitor in touch with an agent, the SDK is employed and a call made to request a chat. Subsequent operation involves polling the SDK for data relating to the conversation. Thereafter the bot behaves as a relay between the visitor and the agent.

## Install

````JavaScript
npm install @cafex/liveassist-botsdk-js
````

## Usage

Please see the [Quickstart Guide](https://support.liveassistfor365.com/hc/en-us/articles/360006117614) for instructions
on how to start using the SDK in an Azure Web App Bot. The
[Live Assist Knowledge Base](https://support.liveassistfor365.com/hc/en-us/sections/360001277654) provides further
information and more advanced uses of the SDK.
