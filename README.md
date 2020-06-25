# DAML Ledger API Node.js Bindings Tutorial

## Table of contents

1.  [Introduction](#introduction)
2.  [Prerequisites](#prerequisites)
3.  [Create the project](#create-the-project)
4.  [Compile the DAML Code](#compile-the-daml-code)
5.  [Run the sandbox](#run-the-sandbox)
6.  [Run the skeleton app](#run-the-skeleton-app)
7.  [Understand the skelelon](#understand-the-skeleton)
8.  [Retrieve the package identifiers](#retrieve-the-package-identifiers)
9.  [Understand the `PingPong` module](#understand-the-pingpong-module)
10. [Pass the parties as parameters](#pass-the-parties-as-parameters)
11. [Create a contract](#create-a-contract)
12. [Read the transactions](#read-the-transactions)
13. [Exercise a choice](#exercise-a-choice)
14. [Read the active contracts](#read-the-active-contracts)

## Introduction

This tutorial guides you through a series of steps to write a simple application using the [Node.js bindings](https://github.com/digital-asset/daml-js/) for [DAML](https://daml.com/).

The purpose is to learn the basics of how to use them.

The task is to build an application able to send and receive "ping" messages.

The focus is not on the complexity of the model, but rather on how to use the bindings to interact with the ledger.

[Back to the table of contents](#table-of-contents)

## Prerequisites

Make sure you have the DAML SDK installed and that the version matches the one in this project's `daml.yaml`.

[Back to the table of contents](#table-of-contents)

## Create the project

There is a skeleton application called `ex-tutorial-nodejs` that you can get from the [GitHub](https://github.com/digital-asset/ex-tutorial-nodejs).

To set it up, clone the repo, making sure to checkout the tag corresponding to the Node.js bindings version you are using:

    git clone git@github.com:digital-asset/ex-tutorial-nodejs.git
    cd ex-tutorial-nodejs

The repo includes `daml/PingPong.daml`, which is the source for a DAML module with two templates: `Ping` and `Pong`. The app uses these.

[Back to the table of contents](#table-of-contents)

## Compile the DAML code

Before getting started, move to the project root directory and build the DAML code with

    daml build

[Back to the table of contents](#table-of-contents)

## Run the sandbox

Use the sandbox to run and test your application:

1. open a new shell (the running sandbox will keep it busy), and
2. start the sandbox by running

       daml sandbox .daml/dist/ex-tutorial-nodejs-0.10.0.dar

[Back to the table of contents](#table-of-contents)

## Run the skeleton app

You are now set to write your own application. The template includes a skeleton app that connects to a running ledger and quits.

1. Install the dependencies for your package (including the bindings):

       npm install

2. Start the application:

       npm start

3. Verify the output is correct

       hello from <LEDGER_ID>

[Back to the table of contents](#table-of-contents)

## Understand the skeleton

The code for the script you just ran is `index.js`.

Let's go through the skeleton part by part to understand what's going on:

    const ledger = require('@digitalasset/daml-ledger');

    const daml = ledger.daml;

    const uuidv4 = require('uuid/v4');

The first line loads the bindings and allows you to refer to them through the `ledger` object.

The second line creates a shorthand for the `daml` object in the `daml-ledger` library, that can be used to express DAML values in your code concisely.

The third line introduces a dependency that is going to be later used to generate unique identifiers; no need to worry about it now.

    let [, , host, port] = process.argv;

    host = host || 'localhost';
    port = port || 6865;

These lines read the command-line arguments and provide some sensible defaults.

Now to the juicy part:

    ledger.DamlLedgerClient.connect({ host: host, port: port }, (error, client) => {
        if (error) throw error;
        console.log('hello from', client.ledgerId);
    });

Here the application connects to the ledger with the `DamlLedgerClient.connect` method.

It accepts two arguments: 

- an object with the connection options
- a callback to be invoked when the connection either fails or succeeds

The connection options require you to pass the `host` and `port` of the ledger instance you are connecting to.

The callback follows the common pattern in Node.js of being invoked with two arguments: the first is an error in case of failure while the latter is the response in case of success.

In this case in particular, the response in case of success is a `client` object that can be used to communicate with the ledger.

The skeleton application just prints the greeting message with the ledger identifier and quits.

[Back to the table of contents](#table-of-contents)

## Retrieve the package identifiers

Now that the sandbox is running, the `PingPong.daml` file has been compiled and the module loaded onto the ledger.

In order for you to refer to the templates therein you need its package identifier.

This template includes a script that connects to a running ledger instance and downloads the package identifiers for the templates.

Run it now:

    npm run fetch-template-ids

If the program ran successfully, the project root now contains the `template-ids.json` file.

It's time to write some code to verify that you're good to go. Open the `index.js` file and edit it.

First of all, right after the first `require` statement, add a new one to load the `template-ids.json` file that has just been created.

    const ledger = require('@digitalasset/daml-ledger');
    const templateIds = require('./template-ids.json');

Right beneath that line, initialize two constants to hold the `Ping` and `Pong` template identifiers:

    const PING = templateIds['PingPong:Ping'];
    const PONG = templateIds['PingPong:Pong'];

Finally print the template identifiers:

    ledger.DamlLedgerClient.connect({ host: host, port: port }, (error, client) => {
        if (error) throw error;
        console.log('hello from', client.ledgerId);
        console.log('Ping', PING);
        console.log('Pong', PONG);
    });

Run the application again (`npm start`) to see an output like the following:

    hello from sandbox-3957952d-f475-4d2f-be89-245a0799d2c0
    Ping { packageId:
       '33f8c3ee29d1e358e1c5b321eab7158af0220a6b956f69528da89c3eeb06d736',
      moduleName: 'PingPong',
      entityName: 'Ping' }
    Pong { packageId:
       '33f8c3ee29d1e358e1c5b321eab7158af0220a6b956f69528da89c3eeb06d736',
      moduleName: 'PingPong',
      entityName: 'Pong' }

[Back to the table of contents](#table-of-contents)

## Understand the `PingPong` module

Before moving on to the implementation of the application, have a look at `daml/PingPong.daml` to understand the module the app uses.

`Ping` and `Pong` are almost identical. Looking at them in detail:

- both have a `sender` signatory and a `receiver` observer
- the receiver of a `Ping` can exercise the `ReplyPong` choice, creating a `Pong` contract with swapped `sender` and `receiver`
- symmetrically, the receiver of a `Pong` contract can exercise the `ReplyPing` choice, creating a `Ping` contract with swapped parties

Note that the contracts carry a counter: when the counter reaches 3, no new contract is created and the exchange stops.

[Back to the table of contents](#table-of-contents)

## Pass the parties as parameters

Everything's now ready to start working. Edit the `index.js` file.

Each contract has a sender and a receiver, so your application needs to establish it.

Read those from the command line by editing the part where the arguments are read as follows:

    let [, , sender, receiver, host, port] = process.argv;
    host = host || 'localhost';
    port = port || 6865;
    if (!sender || !receiver) {
        console.log('Missing sender and/or receiver arguments, exiting.');
        process.exit(-1);
    }

Try to run it without arguments (or with just one) to see the error popping up.

Try to run it with both arguments to see the application working just as it did before, as follows:

    npm start Alice Bob

[Back to the table of contents](#table-of-contents)

## Create a contract

To kickstart the exchange between two parties you have to first make one party *"send"* the initial ping to the other.

To do this you need to create a `Ping` contract.

This requires you to submit a command to the ledger. For this, use the `CommandService`.

The `client` object returned by the `DamlLedgerClient.connect` method contains a reference to all services exposed by the ledger, including the `CommandService`.

First of all, the following is the `request` for the `CommandService`. Have a look at it:

    const request = {
        commands: {
            applicationId: 'PingPongApp',
            workflowId: `Ping-${sender}`,
            commandId: uuidv4(),
            party: sender,
            list: [{
                commandType: 'create',
                templateId: PING,
                arguments: {
                    fields: {
                        sender: daml.party(sender),
                        receiver: daml.party(receiver),
                        count: daml.int64(0)
                    }
                }
            }]
        }
    };

This object represents the submission of a set of commands to be applied atomically. Let's see what each bit of it means:

- `applicationId`: the name of your application
- `workflowId`: an (optional) identifier you can use to group together commands pertaining to one of your workflows
- `commandId`: a unique identifier for the set of submitted commands
- `party`: who's submitting the command

Finally, `list` contains all the commands to be applied. In this case, it submits a `create` command.

Have a look at the only command:

- `templateId`: the identifier of the template of the contract you wish to create (`Ping`)
- `arguments`: an object containing the `fields` necessary to create the contract

The keys of the `fields` object are the template parameter names as they appear on `daml/PingPong.daml`, while the values are an object indicating the type of the parameter and its actual value.

The request can now be passed to the `CommandService` as follows:

    client.commandClient.submitAndWait(request, (error, _) => {
        if (error) throw error;
        console.log(`Created Ping contract from ${sender} to ${receiver}.`);
    });

This is already a sizeable chunk of code that performs a clearly defined task. Within the body of the `connect` callback, wrap the code from this section in a function called `createFirstPing` and call it.

The code should now look like the following:

    ledger.DamlLedgerClient.connect({ host: host, port: port }, (error, client) => {
        if (error) throw error;

        createFirstPing();

        function createFirstPing() {
            const request = {
                commands: {
                    applicationId: 'PingPongApp',
                    workflowId: `Ping-${sender}`,
                    commandId: uuidv4(),
                    party: sender,
                    list: [{
                        commandType: 'create',
                        templateId: PING,
                        arguments: {
                            fields: {
                                sender: daml.party(sender),
                                receiver: daml.party(receiver),
                                count: daml.int64(0)
                            }
                        }
                    }]
                }
            };
            client.commandClient.submitAndWait(request, (error, _) => {
                if (error) throw error;
                console.log(`Created Ping contract from ${sender} to ${receiver}.`);
            });
        }

    });

Time to test your application. Run it like this:

    npm start Alice Bob

You should see the following output:

    Created Ping contract from Alice to Bob.

Your application now successfully creates a `Ping` contract on the ledger, congratulations!

[Back to the table of contents](#table-of-contents)

## Read the transactions

Now that the application can create a contract to send a *ping*, it must also be able to listen to *pongs* on the ledger so that it can react to those.

The `TransactionService` exposes the functionality to read transactions from the ledger via the `getTransactions` method.

This method takes the following request:

    const filtersByParty = {};
    filtersByParty[sender] = { inclusive: { templateIds: [PING, PONG] } };
    const request = {
        begin: { boundary: ledger.LedgerOffsetBoundaryValue.BEGIN },
        filter: { filtersByParty: filtersByParty }
    };

Have a look at the request:

- `begin`: the offset at which you'll start reading transactions from the ledger. In this case you want to listen starting from the first one (represented by the constant `daml.LedgerOffsetBoundaryValue.BEGIN`)
- `end`: the optional offset at which you want the reads to end -- if absent (as in this case) the application keeps listening to incoming transactions
- `filter`: represents which contracts you want the ledger to show you: in this case you are asking for the transactions visible to `sender` containing contracts whose `templateId` matches either `PING` or `PONG`.

---

### Note

#### Why subscribing from the beginning and not simply _tailing_ the transactions?

Purely for educational purposes: in the end, the application will _tail_ the transaction stream. For now, the app subscribes from the beginning to make sure it can read the events it causes, so that you can more easily observe the contract creation.

---

When the `getTransactions` method is invoked with this request the application listens to all transactions coming to the ledger.

The output of this method is a Node.js stream. As such, you can register callbacks on the `'data'` and `'error'` events.

The following code prints the incoming transaction and quits in case of `'error'`.

    const transactions = client.transactionClient.getTransactions(request);
    console.log(`${sender} starts reading transactions.`);
    transactions.on('data', response => {
        for (const transaction of response.transactions) {
            console.log('Transaction read:', transaction.transactionId);
        }
    });
    transactions.on('error', error => {
        console.error(`${sender} encountered an error while processing transactions!`);
        console.error(error);
        process.exit(-1);
    });

---

### Note

If your request specified an `end`, it would most probably make sense to register an `'end'` event callback on the stream as well.

---

Again, this code represents a sizeable chunk of code with a clearly defined purpose.

Wrap this code in a new function called `listenForTransactions`, place it within the `connect` callback and call `listenForTransactions` right before you call `createFirstPing`.

When you are done, your code should look like the following:

    ledger.DamlLedgerClient.connect({ host: host, port: port }, (error, client) => {
        if (error) throw error;

        listenForTransactions();
        createFirstPing();

        function createFirstPing() {
            const request = {
                commands: {
                    applicationId: 'PingPongApp',
                    workflowId: `Ping-${sender}`,
                    commandId: uuidv4(),
                    party: sender,
                    list: [{
                        commandType: 'create',
                        templateId: PING,
                        arguments: {
                            fields: {
                                sender: daml.party(sender),
                                receiver: daml.party(receiver),
                                count: daml.int64(0)
                            }
                        }
                    }]
                }
            };
            client.commandClient.submitAndWait(request, (error, _) => {
                if (error) throw error;
                console.log(`Created Ping contract from ${sender} to ${receiver}.`);
            });
        }

        function listenForTransactions() {
            console.log(`${sender} starts reading transactions.`);
            const filtersByParty = {};
            filtersByParty[sender] = { inclusive: { templateIds: [PING, PONG] } };
            const request = {
                begin: { offsetType: 'boundary', boundary: ledger.LedgerOffsetBoundaryValue.BEGIN },
                filter: { filtersByParty: filtersByParty }
            };
            const transactions = client.transactionClient.getTransactions(request);
            transactions.on('data', response => {
                for (const transaction of response.transactions) {
                    console.log('Transaction read:', transaction.transactionId);
                }
            });
            transactions.on('error', error => {
                console.error(`${sender} encountered an error while processing transactions!`);
                console.error(error);
                process.exit(-1);
            });
        }

    });

Your application now should:

1. start listening to pings and pongs visible to the sender
2. create the first ping
3. receive the ping it created and print its transaction identifer

If you now run

    npm start Alice Bob

You should see an output like the following:

    Alice starts reading transactions.
    Created Ping contract from Alice to Bob.
    Transaction read: 0
    Transaction read: 1

Note that the exact number of transactions read depends on whether you have already ran the application and created contracts more then once.

Your application is now able to create contracts and listen to transactions on the ledger. Very good!

You can now hit CTRL-C to quit the application.

---

### Note

#### Start from a clean slate

It's not a requirement for this tutorial, but if you want to reset the sandbox to its initial state, do the following:

1. Go to the console where the sandbox is running
2. Hit CTRL+C to stop it
3. Run it again as you did before

       daml sandbox .daml/dist/ex-tutorial-nodejs-0.10.0.dar

---


[Back to the table of contents](#table-of-contents)

## Exercise a choice

The last piece of functionality you need consists of reacting to pings and pongs that you read from the ledger, represented by the creation of contracts.

For this, use again the `submitAndWait` method.

In particular, make your program exercise a choice: `ReplyPing` when you receive a `Pong` and vice versa.

You need to react to events in transactions as they are received in the `listenForTransactions` function.

The `transaction` object whose `transactionId` you printed so far contains an array of `event` objects, each representing an `archived` or `created` event on a contract.

What you want to do is loop through the events in the transaction and extract the `receiver` and `count` fields from `created` events.

You then want to decide which reply to give (either `ReplyPing` or `ReplyPong`) based on the contract that has been read.

For each created event, you want to send a command that reacts to it, specifying that you want to either exercise the `ReplyPing` choice of a `Pong` contract or vice versa.

The following snippet of code does precisely this.

    const reactions = [];
    for (const event of events) {
        const { receiver: { party: receiver }, count: { int64: count } } = event.arguments.fields;
        if (receiver === sender) {
            const templateId = event.templateId;
            const contractId = event.contractId;
            const reaction = templateId.moduleName === PING.moduleName && templateId.entityName === PING.entityName ? 'ReplyPong' : 'ReplyPing';
            console.log(`${sender} (workflow ${workflowId}): ${reaction} at count ${count}`);
            reactions.push({
                commandType: 'exercise',
                templateId: templateId,
                contractId: contractId,
                choice: reaction,
                argument: daml.record({})
            });
        }
    }

You can now use the `submitAndWait` command to send the `reactions` to the ledger.

    if (reactions.length > 0) {
        const request = {
            commands: {
                applicationId: 'PingPongApp',
                workflowId: workflowId,
                commandId: uuidv4(),
                party: sender,
                list: reactions
            }
        }
        client.commandClient.submitAndWait(request, error => {
            if (error) throw error;
        });
    }

Wrap this code into a new function `react` that takes a `workflowId` and an `events` array with the `created` events. Then edit the `listenForTransactions` function to:

- accept one parameter called `callback`
- instead of printing the transaction identifier, for each transaction
    - push the `created` events to an array
    - pass that array to the `callback` (along with the workflow identifier)

Finally, pass the `react` function as a parameter to the only call of `listenForTransactions`.

The application is now ready to be tested with two instances running at once: it can now _tail_ the transaction stream instead of subscribing to it from the beginning by replacing the occurrences of `ledger.LedgerOffsetBoundaryValue.BEGIN` with `ledger.LedgerOffsetBoundaryValue.END`.

Review the code before running the application. Your code should now look like the following:

    ledger.DamlLedgerClient.connect({ host: host, port: port }, (error, client) => {
        if (error) throw error;

        listenForTransactions(react);
        createFirstPing();

        function createFirstPing() {
            const request = {
                commands: {
                    applicationId: 'PingPongApp',
                    workflowId: `Ping-${sender}`,
                    commandId: uuidv4(),
                    party: sender,
                    list: [{
                        commandType: 'create',
                        templateId: PING,
                        arguments: {
                            fields: {
                                sender: daml.party(sender),
                                receiver: daml.party(receiver),
                                count: daml.int64(0)
                            }
                        }
                    }]
                }
            };
            client.commandClient.submitAndWait(request, (error, _) => {
                if (error) throw error;
                console.log(`Created Ping contract from ${sender} to ${receiver}.`);
            });
        }

        function listenForTransactions(callback) {
            console.log(`${sender} starts reading transactions.`);
            const filtersByParty = {};
            filtersByParty[sender] = { inclusive: { templateIds: [PING, PONG] } };
            const request = {
                begin: { offsetType: 'boundary', boundary: ledger.LedgerOffsetBoundaryValue.END },
                filter: { filtersByParty: filtersByParty }
            };
            const transactions = client.transactionClient.getTransactions(request);
            transactions.on('data', response => {
                for (const transaction of response.transactions) {
                    const events = [];
                    for (const event of transaction.events) {
                        if (event.eventType === 'created') {
                            events.push(event);
                        }
                    }
                    if (events.length > 0) {
                        callback(transaction.workflowId, events);
                    }
                }
            });
            transactions.on('error', error => {
                console.error(`${sender} encountered an error while processing transactions!`);
                console.error(error);
                process.exit(-1);
            });
        }

        function react(workflowId, events) {
            const reactions = [];
            for (const event of events) {
                const { receiver: { party: receiver }, count: { int64: count } } = event.arguments.fields;
                if (receiver === sender) {
                    const templateId = event.templateId;
                    const contractId = event.contractId;
                    const reaction = templateId.moduleName === PING.moduleName && templateId.entityName === PING.entityName ? 'ReplyPong' : 'ReplyPing';
                    console.log(`${sender} (workflow ${workflowId}): ${reaction} at count ${count}`);
                    reactions.push({
                        commandType: 'exercise',
                        templateId: templateId,
                        contractId: contractId,
                        choice: reaction,
                        argument: daml.record({})
                    });
                }
            }
            if (reactions.length > 0) {
                const request = {
                    commands: {
                        applicationId: 'PingPongApp',
                        workflowId: workflowId,
                        commandId: uuidv4(),
                        party: sender,
                        list: reactions
                    }
                }
                client.commandClient.submitAndWait(request, error => {
                    if (error) throw error;
                });
            }
        }

    });

To test your code you need to run two different commands in two different terminals.

First, run:

    npm start Alice Bob

After starting this, the application creates a ping contract on the ledger and waits for replies.

    Alice starts reading transactions.
    Created Ping contract from Alice to Bob.

Keep this command running, open a new shell and run the following command:

    npm start Bob Alice

You should now see the exchange happening on both terminals.

`npm start Alice Bob`

    Alice starts reading transactions.
    Created Ping contract from Alice to Bob.
    Alice (workflow Ping-Bob): Pong at count 0
    Alice (workflow Ping-Bob): Pong at count 2

`npm start Bob Alice`

    Bob starts reading transactions.
    Created Ping contract from Bob to Alice.
    Bob (workflow Ping-Bob): Ping at count 1
    Bob (workflow Ping-Bob): Ping at count 3

You can now close both applications.

Your application is now able to complete the full exchange. Very well done!

[Back to the table of contents](#table-of-contents)

## Read the active contracts

You may have noticed that the program has a flaw: by subscribing to transactions from the end of the ledger the application is going to see transactions only after that, missing contracts created earlier.

You can see the error as only the workflow initiated by Alice is executed, due to the fact that the process that does so starts earlier.

You could address this problem by listening for transactions from the beginning, but you'd have to take care of handling contracts that could already have been processed by your application.

To handle this use case the API has a service which returns the set of active contracts on the ledger and the absolute office from which start to listen for live transactions.

In this new example the application first processes the current active contracts. Since that process is asynchronous the rest of the program should be passed in as a callback. 

    function processActiveContracts(transactionFilter, callback, onComplete) {
        const request = { filter: transactionFilter };
        const activeContracts = client.activeContractsClient.getActiveContracts(request);
        let offset = undefined;
        activeContracts.on('data', response => {
            if (response.activeContracts) {
                const events = [];
                for (const activeContract of response.activeContracts) {
                    events.push(activeContract);
                }

                if (events.length > 0) {
                    callback(response.workflowId, events);
                }
            }          
           
            if (response.offset) {
                offset = response.offset;
            }
        });    

        activeContracts.on('error', error => {
            console.error(`${sender} encountered an error while processing active contracts!`);
            console.error(error);
            process.exit(-1);
        });    

        activeContracts.on('end', () => onComplete(offset));
    }


Note that the transaction filter was factored out as it can be shared. The final code would look like this:

    const ledger = require('@digitalasset/daml-ledger');
    const templateIds = require('./template-ids.json');

    const PING = templateIds['PingPong:Ping'];
    const PONG = templateIds['PingPong:Pong'];

    const daml = ledger.daml;

    const uuidv4 = require('uuid/v4');

    let [, , sender, receiver, host, port] = process.argv;
    host = host || 'localhost';
    port = port || 6865;
    if (!sender || !receiver) {
        console.log('Missing sender and/or receiver arguments, exiting.');
        process.exit(-1);
    }

    ledger.DamlLedgerClient.connect({ host: host, port: port }, (error, client) => {
        if (error) throw error;

        const filtersByParty = {};
        filtersByParty[sender] = { inclusive: { templateIds: [PING, PONG] } };
        const transactionFilter = { filtersByParty: filtersByParty };

        processActiveContracts(transactionFilter, react, offset => {
            listenForTransactions(offset, transactionFilter, react);
            createFirstPing();
        });

        function createFirstPing() {
            const request = {
                commands: {
                    applicationId: 'PingPongApp',
                    workflowId: `Ping-${sender}`,
                    commandId: uuidv4(),
                    party: sender,
                    list: [{
                        commandType: 'create',
                        templateId: PING,
                        arguments: {
                            fields: {
                                sender: daml.party(sender),
                                receiver: daml.party(receiver),
                                count: daml.int64(0)
                            }
                        }
                    }]
                }
            };
            client.commandClient.submitAndWait(request, (error, _) => {
                if (error) throw error;
                console.log(`Created Ping contract from ${sender} to ${receiver}.`);
            });
        }

        function listenForTransactions(offset, transactionFilter, callback) {
            console.log(`${sender} starts reading transactions from offset: ${offset}.`);
            const request = {
                begin: { offsetType: 'boundary', boundary: ledger.LedgerOffsetBoundaryValue.END },
                filter: transactionFilter
            };
            const transactions = client.transactionClient.getTransactions(request);
            transactions.on('data', response => {
                for (const transaction of response.transactions) {
                    const events = [];
                    for (const event of transaction.events) {
                        if (event.eventType === 'created') {
                            events.push(event);
                        }
                    }
                    if (events.length > 0) {
                        callback(transaction.workflowId, events);
                    }
                }
            });
            transactions.on('error', error => {
                console.error(`${sender} encountered an error while processing transactions!`);
                console.error(error);
                process.exit(-1);
            });
        }

        function processActiveContracts(transactionFilter, callback, onComplete) {
            console.log(`processing active contracts for ${sender}`);
            const request = { filter: transactionFilter };
            const activeContracts = client.activeContractsClient.getActiveContracts(request);
            let offset = undefined;
            activeContracts.on('data', response => {
                if (response.activeContracts) {
                    const events = [];
                    for (const activeContract of response.activeContracts) {
                        events.push(activeContract);
                    }
                    if (events.length > 0) {
                        callback(response.workflowId, events);
                    }
                }

                if (response.offset) {
                    offset = response.offset;
                }
            });

            activeContracts.on('error', error => {
                console.error(`${sender} encountered an error while processing active contracts!`);
                console.error(error);
                process.exit(-1);
            });

            activeContracts.on('end', () => onComplete(offset));
        }

        function react(workflowId, events) {
            const reactions = [];
            for (const event of events) {
                const { receiver: { party: receiver }, count: { int64: count } } = event.arguments.fields;
                if (receiver === sender) {
                    const templateId = event.templateId;
                    const contractId = event.contractId;
                    const reaction = templateId.moduleName === PING.moduleName && templateId.entityName === PING.entityName ? 'ReplyPong' : 'ReplyPing';
                    console.log(`${sender} (workflow ${workflowId}): ${reaction} at count ${count}`);
                    reactions.push({
                        commandType: 'exercise',
                        templateId: templateId,
                        contractId: contractId,
                        choice: reaction,
                        argument: { valueType: 'record', fields: {} }
                    });
                }
            }
            if (reactions.length > 0) {
                const request = {
                    commands: {
                        applicationId: 'PingPongApp',
                        workflowId: workflowId,
                        commandId: uuidv4(),
                        party: sender,
                        list: reactions
                    }
                }
                client.commandClient.submitAndWait(request, error => {
                    if (error) throw error;
                });
            }
        }

    });

Before running the application, start with a clean ledger to avoid receiving unprocessed contracts from previous examples:

1. go to the shell where you are running the sandbox
2. hit CTRL+C to shut it down and wait for your shell prompt
3. restart the sandbox

       daml sandbox .daml/dist/ex-tutorial-nodejs-0.10.0.dar

Then run:

    npm start Alice Bob

and finally run in another shell:

    npm start Bob Alice

You should see the following outputs respectively:

    processing active contracts for Alice
    Alice starts reading transactions from offset: 0.
    Created Ping contract from Alice to Bob.
    Alice (workflow Ping-Bob): Pong at count 0
    Alice (workflow Ping-Alice): Ping at count 1
    Alice (workflow Ping-Bob): Pong at count 2
    Alice (workflow Ping-Alice): Ping at count 3

---

    processing active contracts for Bob
    Bob (workflow Ping-Alice): Pong at count 0
    Bob starts reading transactions from offset: 1.
    Created Ping contract from Bob to Alice.
    Bob (workflow Ping-Bob): Ping at count 1
    Bob (workflow Ping-Alice): Pong at count 2
    Bob (workflow Ping-Bob): Ping at count 3

Alice joining an empty ledger has no active contracts to process. Bob however, who joins later, will see Alice's `Ping` contract and process it. Afterwards he will continue listening to transactions from offset 1.

[Back to the table of contents](#table-of-contents)
