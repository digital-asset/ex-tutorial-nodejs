// Copyright (c) 2019, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { daml as Daml             // To prefix useful functions
        , CreatedEvent
        , DamlLedgerClient        // Root client for interacting with API.
        , Filters                 // For specifying transcation/contract filters
        , LedgerClient
        , TransactionFilter } from '@digitalasset/daml-ledger';
import * as templateIds from './template-ids.json';

import { v4 as uuid} from 'uuid';

const PING = templateIds['PingPongGame:Ping'];
const PONG = templateIds['PingPongGame:Pong'];

let [, , sender, receiver, initialNumberOfPingsArg, hostArg, portArg, ] = process.argv;
let initialNumberOfPings = parseInt(initialNumberOfPingsArg) || 1;
let host = hostArg || 'localhost';
let port = parseInt(portArg) || 6865;
if (!sender || !receiver) {
    console.log('Missing sender and/or receiver arguments, exiting.');
    process.exit(-1);
}

/* This call establish a gRPC based connection to the Daml Ledger and passes to
 * a callback an error on failure and a LedgerClient on success.
 */
DamlLedgerClient.connect({ host, port}, (error, client) => {
    if (error) throw error;
    if (client) {

        // Setup filters for just the PING and PONG contracts seen by the sender.
        const filtersByParty : Record<string, Filters> = {} ;
        filtersByParty[sender] = { inclusive: { templateIds: [PING, PONG] } };
        const transactionFilter = { filtersByParty: filtersByParty };

        // Register a callback to Pong a Ping and Ping a Pong.
        const eventCallback = (workflowId:string, events:CreatedEvent[]) =>
                react(client, workflowId, events)

        // In the beginning look at all currently active contracts on the ledger
        // and react to them with the above call back.
        processActiveContracts(client, transactionFilter, eventCallback,
            // And then afterwards
            (offset : string) => {
                // Listen to all new transactions.
                listenForTransactions(client, offset, transactionFilter,
                    // React to them in the same way.
                    eventCallback);
                // But also create a set of new pings for the receiver.
                for(let p = 0; p < initialNumberOfPings; p++)
                    createPing(client);
        });
    };
});

type EventCallback = (workflowId:string, events:CreatedEvent[]) => void
type CompleteCallback = (offset : string) => void

function processActiveContracts(client : LedgerClient,
                                transactionFilter : TransactionFilter,
                                callback : EventCallback,
                                onComplete : CompleteCallback) {
    const request = { filter: transactionFilter };
    let offset : string|undefined;
    /* An important service of the Ledger API is the Active Contract Service
     * https://docs.daml.com/app-dev/services.html#active-contract-service
     * which can be used to bootstrap state as is tells the client's Party
     * what contracts (that meet the required filter) are currently active
     * on the ledger.
     */
    const activeContracts = client.activeContractsClient.getActiveContracts(request);
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

        // The ledger is a sequence of transactions that are ordered by an offset.
        // We want to store the latest offset so that we can subscribe to future
        // transactions after this offset.
        if (response.offset) {
            offset = response.offset;
        }
    });

    activeContracts.on('error', error => {
        console.error(`${sender} encountered an error while processing active contracts!`);
        console.error(error);
        process.exit(-1);
    });

    activeContracts.on('end', () => {
        if (offset)
            onComplete(offset)
        else
            console.error(`No offset returned to ${sender} by ACS.`);

    });
}

// To create commands against the ledger we need to construct commands.
function createPing (client : LedgerClient) {
    const request = {
        // A set of commands to be applied atomically
        commands: {
            applicationId: 'PingPongGameApp',   //  the name of your application
            workflowId: `Ping-${sender}`,    // an (optional) identifier you can
                                             // use to group commands pertaining
                                                     // to one of your workflows
            commandId: uuid(),           // a unique identifier for the commands
            party: sender,                      // who is submitting the command
            list: [{                      // Each request is made up of commands
                commandType: 'create' as const,

                templateId: PING,       // the identifier of the template of the
                                            // contract you wish to create Ping.
                arguments: {                  // an object containing the fields
                                             // necessary to create the contract
                    fields: {
                        sender: Daml.party(sender),
                        receiver: Daml.party(receiver),
                        count: Daml.int64(0)
                    }
                }
            }]
      }
    };

    /* The Ledger Client has a CommandClient that wraps the Command Service
     * https://docs.daml.com/app-dev/services.html#command-service
     * It issues commands against the ledger and waits for a response
     */
    client.commandClient.submitAndWait(request, (error, response) => {
        if (error) throw error;
        console.log(`Created Ping contract from ${sender} to ${receiver}: ${response}.`);
    });
}

// The ledger changes as new transactions are added to it.
// Here we subscribe to those changes.
function listenForTransactions(client : LedgerClient,
                                offset : string,
                                transactionFilter : TransactionFilter,
                                callback : EventCallback) {
    console.log(`${sender} starts reading transactions from offset: ${offset}.`);
    const request = {
        begin: { offsetType: 'absolute' as const,        // Listen at a specific
                 absolute: offset                    // offset to avoid history.
               },
        filter: transactionFilter                // Only for specific templates.
    };

    const transactions = client.transactionClient.getTransactions(request);
    transactions.on('data', response => {
        for (const transaction of response.transactions) {
            if(!callback) {
                console.log('Transaction read:', transaction.transactionId);
            } else {
                const events = [];
                // Accumulate what new things were created on the ledger as
                // part of this transaction.
                for (const event of transaction.events) {
                    if (event.eventType === 'created') {
                      events.push(event);
                    }
                }
                if (events.length > 0) {
                    // And the react to them via this callback.
                    callback(transaction.workflowId, events);
                }
            }
        }
    });
    transactions.on('error', error => {
        console.error(`${sender} encountered an error while processing transactions!`);
        console.error(error);
        process.exit(-1);
    });
};

// We will react to our create events.
function react(client : LedgerClient, workflowId : string, events : CreatedEvent[]) {
    const reactions = [];
    for (const event of events) {
        // We are explicitly deconstructing by pattern matching the Ping and Pong templates payload.
        const { receiver: { party: receiver }, count: { int64: count } } = event.arguments.fields as any;
        // Is the event to us? Ie, are we the receiver and can respond?
        if (receiver === sender) {
            const templateId = event.templateId;
            const contractId = event.contractId;
            const reaction = templateId.moduleName === PING.moduleName &&
                              templateId.entityName === PING.entityName ? 'ReplyPong' : 'ReplyPing';
            console.log(`${sender} (workflow ${workflowId}): ${reaction} at count ${count}`);
            // Add an exercise command to react with the choice to transition
            // to the opposite state.
            reactions.push({
                commandType: 'exercise' as const,
                templateId: templateId,
                contractId: contractId,
                choice: reaction,
                argument: Daml.record({})
            });
        }
    }
    if (reactions.length > 0) {
        const request = {
            commands: {
                applicationId: 'PingPongGameApp',
                workflowId: workflowId,
                commandId: uuid(),
                party: sender,
                list: reactions
            }
        }
        // Use the same CommandClient client to send this
        client.commandClient.submitAndWait(request, (error, _) => {
            if (error) throw error;
        });
    }
}
