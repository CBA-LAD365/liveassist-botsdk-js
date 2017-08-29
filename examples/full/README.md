# CafeX Live Assist BOT SDK - nodejs, example
The CafeX Live Assist BOT SDK provides a means for an automated chat endpoint (a bot) to escalate a conversation such that the visitor can interact with a CafeX Live Assist (human) agent.

The SDK is designed to be used server-side in a nodejs environment.

This is an example application using the [Microsoft Bot Framework (nodejs)](https://docs.microsoft.com/en-us/bot-framework/nodejs/bot-builder-nodejs-overview) that can be run on a local computer to illustrate the use of the SDK. Two versions of the bot are provided; one using the callback style and another using the promise style.

For new conversations with a visitor, the example bot will echo back anything that it receives as chat input. Then, when a line beginning with the string 'help' (case-insensitive) is received, the bot will, after confirming that agents are available, ask the visitor if they wish to be referred to agent. On answering yes, the conversation will be escalated though CafeX Live Assist to an agent. An agent can then pick up the conversation; thereafter the bot will relay the conversation between the visitor an the agent.

The BOT SDK documentation should be consulted in conjunction with exploration of these examples.

## Running the Bots

Scripts are defined for running the bots: `npm run bot-liveassist-callback` and `npm run bot-liveassist-promise`. Relevant environment variables, both those specified by the SDK and, if any, those of the example bot, should be set before running these commands. Typically, these are:

* `LA_ACCOUNT_ID` - The example as is requires this (note that the SDK has the option of not requiring this to be set if the account id is used in the SDK instance constructor - see the SDK API documentation).
* `BOT_TARGET_SKILL` - this value is optional, however if it is not set then no agent skill will be targeted for chat (which means that any agent in the organisation can pick it up). Beware though that if it is provided then that skill must have been registered/created within that organisation or an error will occur.

For example:

Linux/Mac shell:
````sh
% LA_ACCOUNT_ID=12345678 BOT_TARGET_SKILL=my-skill npm run bot-liveassist-callback
````
Windows cmd:
````sh
% set "LA_ACCOUNT_ID=12345678" & set "BOT_TARGET_SKILL=my-skill" & npm run bot-liveassist-callback
````

Running these will cause the bot to listen on port 3978 (a different port can be specified via the environment variable 'port' or 'PORT'). Functionally, there is no difference between the two versions; however, in terms of implementation, one uses the callback style of the SDK while the other uses the promise style.

The bot can be exercised using the [Microsoft Bot Framework Emulator](https://docs.microsoft.com/en-us/bot-framework/debug-bots-emulator), setting the endpoint URL to `http://localhost:3978/api/messages`.

## Context Data

The example use of context data must be enabled by configuration. This is because that functionality relies on having a CafeX Live Assist Context Data server. For security, this server will require account holder configuration of keys for verification/decryption of submitted data. However, the example includes a dummy Context Data Server that will decode and verify a signed JWT posted to it, and then print out it's contents. This illustrates the flow of context data information (from the example bot, through the SDK and onto the Context Server), and provides an example of how the data may be signed in a JWT.

Take the following steps to enable the dummy Context Server functionality. Please note (particularly Windows users) that the example requires an openssl installation on the operating system on which you are running (a Windows installer can be found [here](http://gnuwin32.sourceforge.net/packages/openssl.htm)).

With the bot NOT running:

* In a terminal window, run the dummy Context Server using the command `npm run contextServer`. This will cause the dummy server to listen on a default port (see the output); set the environment variable `PORT` before running to use another port (eg Bash: `PORT=7654 npm run contextServer`, Windows `set "PORT=7654" & npm run contextServer`). This will:
    * Generate security items, in particular a certificate, for the dummy server (in a `keys/srv` subdirectory).
    * Generate security items, in particular a private/public key pair, for the bot to sign a JWT (in a `keys/jwt` subdirectory).
* In another terminal window, run the bot (eg the callback version) using the command `LA_ACCOUNT_ID=12345678 BOT_TARGET_SKILL=my-skill BOT_CTX_DATA=true LA_CTX_DATA_HOST=localhost:4017 npm run bot-liveassist-callback` (or on Windows `set "LA_ACCOUNT_ID=12345678" & set "BOT_TARGET_SKILL=my-skill" & set "BOT_CTX_DATA=true" & set "LA_CTX_DATA_HOST=localhost:4017" & npm run bot-liveassist-callback`). Here:
    * The environment variable `BOT_CTX_DATA` (being set true) enables the context data handling of the example bot (ie it sets a `getContextDataSpec` callback property at chat request time).
    * The environment variable `LA_CTX_DATA_HOST` is an SDK defined configuration item that specifies the host/port of the CafeX Live Assist Context Data server to use. In this case we specify the dummy server that's running on the local machine (on port 4017, however this should be set to whatever port the dummy server was set to run).

Following this setup, requesting a chat will cause output to appear in the terminal from which the dummy server is running.

Some notes:

* Bot:
    * The context data handling for the bot is implemented in the module `lib/contextData.js`.
    * The data is signed using a key read from a PEM format file. This file is specified by the environment variable `BOT_CTX_SGN_KEY_PEM` which defaults, if not set, to the private key generated for the bot signing.
    * The Context Data Server certificate, used to validate the server, is specified using the `contextDataCertificate` property of the specification passed back to the SDK from the bot. The value is set by the environment variable `BOT_CTX_SRV_CERT` which defaults, if not set, to the certificate generated for the dummy server. **NOTE** This value is only required in the dummy server scenario, as its certificate is self-signed.
    * By setting the above environment variables to values other than their defaults, the example bot can be configured to use a Context Data Server other than the dummy server (together with the SDK defined configuration item `LA_CTX_DATA_HOST`). For example, to target your real context service (which you have configured with keys - see [Live Assist Context Service](http://www.liveassistfor365.com/en/support/knowledge-base/chat-bots/context-service/)):
        * `BOT_CTX_DATA=true`
        * `BOT_CTX_SGN_KEY_PEM="-----BEGIN PRIVATE KEY-----\n ...."` the private key corresponding to the public key configured with the service
        * `BOT_CTX_SRV_CERT=''` do regular certificate verification
        * `LA_CTX_DATA_HOST=host` where host is the host of the Context Service URL defined for you
* Dummy Context Data Server:
    * The dummy server is implemented in the module `lib/dummyContextServer.js`.
    * The HTTPS server created within the dummy server, uses the certificate and private key generated for the dummy server.
    * A HTTP server is also created which listens on a default port (see the output); set the environment variable `HTTPPORT` before running to use another port.
    * The data is verified using the public key generated for the bot.

For a real bot using the CafeX BOT SDK and the real CafeX Live Assist Context Data server, keys must be configured properly through the Live Assist account. The keys/certificates generated here are for the purpose of the dummy server and the example bot, and should never be used otherwise.

## Configuration
* `BOT_TARGET_SKILL` (optional) - a string to target an agent with a specific skill (if omitted, no skill restriction is made). Note that if an unknown skill is provided, an error will result. See the BOT SDK docs.
* `BOT_CTX_DATA` (optional) - a boolean to enable/disable context data posting. If omitted or anything other than true, context data posting will be disabled.
* `BOT_CTX_SGN_KEY_PEM` (optional) - specifies the key, in PEM format, used to sign the context data JWT. If this value resolves to a readable file, its contents are read and taken as the key, otherwise the value is taken as is (newlines in the PEM format should be replaced by the string '\n'). See above for more details.
* `BOT_CTX_SRV_CERT` (optional) - specifies the context data server certificate, in PEM format. If this value resolves to a readable file, its contents are read and taken as the certificate, otherwise the value is taken as is (newlines in the PEM format should be replaced by the string '\n'). If the value is the empty string (''), a certificate will not be used (ie the certificate provided by the server will have to be verifiable using system defined authorities). If the value is 'accept', the SDK will be asked to accept the certificate without verification. See above for more details.

## Azure deployment guide

The prime objective of the example is to illustrate the use of the SDK. That it does so through the use of the Microsoft Bot Framework is not a requirement of the SDK. Furthermore, the functionality provided by the SDK can be seen by running the example locally as described above. However, the example can be deployed to Azure, and this sections provides some guidance.

### Pre-requisites

* An Azure account with which you're able to create webapps
* A bot registration (https://dev.botframework.com/bots)
    * create a bot, generate an app id and password (-> appId, appPwd)
* The azure CLI 2.0: https://docs.microsoft.com/en-gb/cli/azure/install-azure-cli
* A local git installation (https://git-scm.com/downloads)

### Steps

The following steps assume none of the resources are available, if some resources (resource group, service plan) are available, skip the creation of them and use those available (a complete list of Azure CLI commands can be found here: https://docs.microsoft.com/en-gb/cli/azure/).

1. `az login` - Log into azure with your account credentials
1. `az group create --name myResourceGroup --location someLocation` -  Create a resource group (or skip and use one that is available to you)
1. `az configure --defaults group=myResourceGroup location=someLocation` - Configure your CLI to use defaults for fields (otherwise you'll have to keep typing them in as parameters)
1. `az appservice plan create --name myPlan --sku F1` - Create a service plan, F1 is a basic plan (or skip and use one that is available to you)
1. `az webapp create --name myBotDemo --plan myPlan` - Create the bot application, giving your chosen name (and the plan you are using)
1. `az configure --defaults web=myBotDemo` - Again, configure your CLI to use defaults for the app name
1. `az webapp browse` - Test the app created, a window should appear in your default browser, close it
1. \## Obtain the source for this example project, downloading it to some directory, eg example-bot
1. `cd example-bot` - Change to that directory
1. `git init` - Initialise a local git repo
1. `git add -A` - Add all files in the project for commit (.gitignore contents excluded)
1. `git commit -m "Initial Commit"` - Commit them
1. `az webapp config appsettings set --settings LA_ACCOUNT_ID=abcd` - Set up environment variables for configuring the bot/SDK, this set for the SDK ...
1. `az webapp config appsettings set --settings MICROSOFT_APP_ID=appId MICROSOFT_APP_PASSWORD=appPwd` - ... and this set for your bot (its app id/password - the MS bot framework requires these). At this point the optional `BOT_TARGET_SKILL` could be set. Note that the 'port/PORT' variable will be set by azure, don't try to set it yourself.
1. `az webapp deployment user set --user-name myName --password myPassword` - Define a deployment user, choose any (syntactically legitimate) pair
1. `az webapp deployment source config-local-git` - Request the git endpoint that can be used as an upstream remote (to push to)
1. `git remote add azure https://myName@myBotDemo....git` - Use the url returned from the previous step to set the remote repo called 'azure'
1. `git push azure master` - Push the source code to azure. This will trigger deployment where the dependencies (as defined in package.json) are installed, and the node process to be executed.

To test the bot, go to the bot framework page (above), enter the URL for the bot (Messaging endpoint), the app id and password, and test with the various channels.

### Miscellaneous
The above has the example running without attempting to store context data. If this is really required, then it can be achieved be setting the appropriate environment variables (using `az webapp config appsettings set --settings`) to values described in section `Context Data`. The context data server will then need to be available to Azure. For the dummy context server running locally, it's URL would need to be made publicly available. This can be achieved using tunneling software such as [ngrok](https://ngrok.com/) targeting the HTTP server (not the HTTPS server) of the dummy context data server. The config would then be

 *  BOT_CTX_DATA: true
 *  LA_CTX_DATA_HOST: The host returned by ngrok for HTTPS (eg abcd1234.ngrok.io)
 *  BOT_CTX_SGN_KEY_PEM: A string representing the key as found in the file `keys/jwt/prv.pem` (with newlines replaced by '\n')
 *  BOT_CTX_SRV_CRT: '' (the empty string - ngrok has signed certificates)