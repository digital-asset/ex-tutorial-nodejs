// Copyright (c) 2019, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const ledger = require('@digitalasset/daml-ledger');
const uuidv4 = require('uuid/v4');
const templateIds = require('./template-ids.json');

const PING = templateIds['PingPong:Ping'];
const PONG = templateIds['PingPong:Pong'];
const FAIL = templateIds['PingPong:Fail'];

const daml = ledger.daml;

let [, , sender, receiver, host, port] = process.argv;
host = host || 'localhost';
port = port || 6865;
if (!sender || !receiver) {
    console.log('Missing sender and/or receiver arguments, exiting.');
    process.exit(-1);
}

async function fail () {
    const ledger = require('@digitalasset/daml-ledger');
    const daml = ledger.daml;
    const templateIds = require('./template-ids.json');
    const FAIL = templateIds['PingPong:Fail'];

    const client = await ledger.DamlLedgerClient.connect({host: 'localhost', port: 6865});

    try {
        await client.commandClient.submitAndWait({
            commands: {
                applicationId: 'foo',
                commandId: uuidv4(),
                party: 'Alice',
                list: [
                    {
                        commandType: 'createAndExercise',
                        templateId: FAIL,
                        choice: 'DoFail',
                        choiceArgument: daml.record({funds: daml.int64(100), transfer: daml.int64(110)}),
                        createArguments: {fields:{owner: daml.party('Alice')}}
                    }
                ]
            }
        });
    } catch (error) {
        console.log(error);
    }
}

async function main() {

    async function processEvents(workflowId, events) {
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
            await client.commandClient.submitAndWait({
                commands: {
                    applicationId: 'PingPongApp',
                    workflowId: workflowId,
                    commandId: uuidv4(),
                    party: sender,
                    list: reactions
                }
            });
        }
    }

    async function processActiveContracts() {
        console.log(`processing active contracts for ${sender}`);
        const request = { filter: transactionFilter };
        const activeContracts = client.activeContractsClient.getActiveContracts(request);
        let offset = undefined;
        try {
            for await (const response of activeContracts) {
                if (response.activeContracts) {
                    const events = [];
                    for (const activeContract of response.activeContracts) {
                        events.push(activeContract);
                    }
                    if (events.length > 0) {
                        await processEvents(response.workflowId, events);
                    }
                }

                if (response.offset) {
                    offset = response.offset;
                }
            }
        } catch (error) {
            console.error(`${sender} encountered an error while processing active contracts!`);
            console.error(error);
            process.exit(-1);
        }
        return offset;
    }

    async function listenForTransactions(offset) {
        console.log(`${sender} starts reading transactions from offset: ${offset}.`);
        const request = {
            begin: { offsetType: 'boundary', boundary: ledger.LedgerOffsetBoundaryValue.END },
            filter: transactionFilter
        };
        const transactions = client.transactionClient.getTransactions(request);
        try {
            for await (const response of transactions) {
                for (const transaction of response.transactions) {
                    const events = [];
                    for (const event of transaction.events) {
                        if (event.eventType === 'created') {
                            events.push(event);
                        }
                    }
                    if (events.length > 0) {
                        await processEvents(transaction.workflowId, events);
                    }
                }
            }
        } catch (error) {
            console.error(`${sender} encountered an error while processing transactions!`);
            console.error(error);
            process.exit(-1);
        }
    }

    async function createFirstPing() {
        await client.commandClient.submitAndWait({
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
        });
        console.log(`Created Ping contract from ${sender} to ${receiver}.`);
    }

    const client = await ledger.DamlLedgerClient.connect({host: host, port: port});

    const filtersByParty = {};
    filtersByParty[sender] = { inclusive: { templateIds: [PING, PONG] } };
    const transactionFilter = { filtersByParty: filtersByParty };

    const offset = await processActiveContracts();
    await createFirstPing();
    await listenForTransactions(offset);
}

main();
