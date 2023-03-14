// Copyright (c) 2019, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { credentials, makeClientConstructor } from '@grpc/grpc-js';
import * as activeContractsService  from "./src/generated/com/daml/ledger/api/v1/active_contracts_service_grpc_pb";
import { GetActiveContractsRequest, GetActiveContractsResponse } from './src/generated/com/daml/ledger/api/v1/active_contracts_service_pb';
import * as commandService  from "./src/generated/com/daml/ledger/api/v1/command_service_grpc_pb";
import { SubmitAndWaitRequest } from './src/generated/com/daml/ledger/api/v1/command_service_pb';
import { Command, Commands, CreateCommand } from './src/generated/com/daml/ledger/api/v1/commands_pb';
import * as transactionService  from "./src/generated/com/daml/ledger/api/v1/transaction_service_grpc_pb";
import { GetTransactionsRequest } from './src/generated/com/daml/ledger/api/v1/transaction_service_pb';

import { Filters, InclusiveFilters, TransactionFilter } from './src/generated/com/daml/ledger/api/v1/transaction_filter_pb';
import { CreatedEvent } from './src/generated/com/daml/ledger/api/v1/event_pb';
import { Identifier, Record, RecordField, Value } from './src/generated/com/daml/ledger/api/v1/value_pb';
import { LedgerOffset } from './src/generated/com/daml/ledger/api/v1/ledger_offset_pb';

import * as templateIds from './template-ids.json';

import { v4 as uuid} from 'uuid';

const PING = templateIds['PingPongGame:Ping'];
const PONG = templateIds['PingPongGame:Pong'];

let [, , sender, receiver, initialNumberOfPingsArg, hostArg, portArg, ] = process.argv;
let initialNumberOfPings = parseInt(initialNumberOfPingsArg) || 1;
let host = hostArg || 'localhost';
let port = parseInt(portArg) || 6865;
let address = `${host}:${port}`;
let channelCredential = credentials.createInsecure();

if (!sender || !receiver) {
    console.log('Missing sender and/or receiver arguments, exiting.');
    process.exit(-1);
}

// console.log(`sender ${sender}`);
// console.log(`receiver ${receiver}`);

const pingIdentifier = new Identifier();
pingIdentifier.setPackageId(PING.packageId);
pingIdentifier.setModuleName(PING.moduleName);
pingIdentifier.setEntityName(PING.entityName);

const pongIdentifier = new Identifier();
pongIdentifier.setPackageId(PONG.packageId);
pongIdentifier.setModuleName(PONG.moduleName);
pongIdentifier.setEntityName(PONG.entityName);



/* Setup transaction filter.
 */
let senderFilter = new Filters();
let inclusiveSenderFilter = new InclusiveFilters();
inclusiveSenderFilter.setTemplateIdsList([pingIdentifier, pingIdentifier]);

senderFilter.setInclusive(inclusiveSenderFilter);
const filtersByParty : {[key:string]:Filters} = {};
filtersByParty[sender] = senderFilter;
let transactionFilter = new TransactionFilter();
let transactionFilterObj = transactionFilter.getFiltersByPartyMap();
// Being explicit about the above conversion even though we only have on Party.
Object.keys(filtersByParty).forEach((party) => {
  transactionFilterObj.set(party, filtersByParty[party])
});

const activeContractsServiceC = makeClientConstructor((activeContractsService as any)['com.daml.ledger.api.v1.ActiveContractsService'], 'ActiveContractsService');
const activeContractsServiceClient =
                                                          // {} = grpcOptions
  new activeContractsServiceC(address, channelCredential, {}) as unknown as activeContractsService.ActiveContractsServiceClient;

const commandServiceC = makeClientConstructor((commandService as any)['com.daml.ledger.api.v1.CommandService'], 'CommandService');
const commandServiceClient =
  new commandServiceC(address, channelCredential, {}) as unknown as commandService.CommandServiceClient;

const transactionServiceC = makeClientConstructor((transactionService as any)['com.daml.ledger.api.v1.TransactionService'], 'TransactionService');
const transactionServiceClient =
  new transactionServiceC(address, channelCredential, {}) as unknown as transactionService.TransactionServiceClient;


type EventCallback = (workflowId:string, events:any[]) => void
type CompleteCallback = (offset : string) => Promise<void>    // Use async

async function processActiveContracts( callback : EventCallback, onComplete : CompleteCallback) {
    /* An important service of the Ledger API is the Active Contract Service
     * https://docs.daml.com/app-dev/services.html#active-contract-service
     * which can be used to bootstrap state as is tells the client's Party
     * what contracts (that meet the required filter) are currently active
     * on the ledger.
     */
    let getActiveContractsRequest = new GetActiveContractsRequest();
    getActiveContractsRequest.setFilter(transactionFilter);

    let responseStream = activeContractsServiceClient.getActiveContracts(getActiveContractsRequest);
    // TODO handle error in stream.
    let workflowId = "";
    let offset = "";
    let events : CreatedEvent[] = [];

    for await (let response of responseStream){
        let r = response as GetActiveContractsResponse;
        if(!workflowId)
          workflowId = r.getWorkflowId();
        offset = r.getOffset();
        // console.log(`r: ${JSON.stringify(r)}`);
        // console.log(`r.getActiveContractsList: ${JSON.stringify(r.getActiveContractsList())}`);
        // events.concat(r.getActiveContractsList());
        for(let e of r.getActiveContractsList()){
          events.push(e)
          console.log(`events -  ${JSON.stringify(events)}}`);
        }
    }
    callback(workflowId, events);

    await onComplete(offset);
}

(async () => {
    try {
        let eventsCallback = (workflowId:string, events:CreatedEvent[]) => {
            for(let event of events){
              console.log(`w ${workflowId} -> event: ${event}`);
            }};
        let res = processActiveContracts( eventsCallback,
                    async (offset) => {
                          console.log(`offset: ${offset}`)
                          for(let p = 0; p < initialNumberOfPings; p++)
                              createPing();
                          await listenForTransactions( offset, eventsCallback);
                      });
        console.log(`${res}`);
    } catch (e) {
        console.error(`error: ${e}`);
    }}) ();

// To create commands against the ledger we need to construct commands.
function createPing () {

    let createCommand = new CreateCommand();
    createCommand.setTemplateId(pingIdentifier);

    let senderField = new RecordField();
    senderField.setLabel('sender');
    let senderValue = new Value();
    senderValue.setParty(sender);
    senderField.setValue(senderValue);

    let receiverField = new RecordField();
    receiverField.setLabel('receiver');
    let receiverValue = new Value();
    receiverValue.setParty(receiver);
    receiverField.setValue(receiverValue);

    let countField = new RecordField();
    countField.setLabel('count');
    let countValue = new Value();
    countValue.setInt64('0');
    countField.setValue(countValue);

    let pingCreatePayloadRecordList = [senderField, receiverField, countField];

    let pingCreatePayloadRecord = new Record();
    pingCreatePayloadRecord.setFieldsList(pingCreatePayloadRecordList);
    createCommand.setCreateArguments(pingCreatePayloadRecord);

    let command = new Command();
    command.setCreate(createCommand);

    let commands = new Commands();
    commands.setApplicationId('PingPongGameApp');   //  the name of your application
    commands.setWorkflowId(`Ping-${sender}`);    // an (optional) identifier you can
                                                 // use to group commands pertaining
                                                         // to one of your workflows
    commands.setCommandId(uuid());           // a unique identifier for the commands
    commands.setParty(sender);
    commands.setCommandsList([command]);

    const submitAndWaitRequest = new SubmitAndWaitRequest();
    submitAndWaitRequest.setCommands(commands);
    commandServiceClient.submitAndWait(submitAndWaitRequest, (error, response) => {
        if (error) throw error;
        console.log(`Created Ping contract from ${sender} to ${receiver}.`);
    })
}

// The ledger changes as new transactions are added to it.
// Here we subscribe to those changes.
async function listenForTransactions( offset : string, callback : EventCallback) {
    console.log(`${sender} starts reading transactions from offset: ${offset}.`);

    let getTransactionsRequest = new GetTransactionsRequest();
    let ledgerOffset = new LedgerOffset();
    ledgerOffset.setAbsolute(offset);
    getTransactionsRequest.setFilter(transactionFilter);
    getTransactionsRequest.setBegin(ledgerOffset);
    let transactionStream = transactionServiceClient.getTransactions(getTransactionsRequest);

    for await (let transactionResponse of transactionStream){
        for (let transaction of transactionResponse.getTransactionsList()){
            if(!callback) {
                console.log('Transaction read:', transaction.getTransactionId());
            } else {
                const events = [];
                // Accumulate what new things were created on the ledger as
                // part of this transaction.
                for (const event of transaction.getEventsList()) {
                    if (event.hasCreated()) {
                        events.push(event.getCreated());
                    }
                }
                if (events.length > 0) {
                    // And the react to them via this callback.
                    callback(transaction.getWorkflowId(), events);
                }
            }
        }
    }
}

// // We will react to our create events.
// function react(client : LedgerClient, workflowId : string, events : CreatedEvent[]) {
//     const reactions = [];
//     for (const event of events) {
//         // We are explicitly deconstructing by pattern matching the Ping and Pong templates payload.
//         const { receiver: { party: receiver }, count: { int64: count } } = event.arguments.fields as any;
//         // Is the event to us? Ie, are we the receiver and can respond?
//         if (receiver === sender) {
//             const templateId = event.templateId;
//             const contractId = event.contractId;
//             const reaction = templateId.moduleName === PING.moduleName &&
//                               templateId.entityName === PING.entityName ? 'ReplyPong' : 'ReplyPing';
//             console.log(`${sender} (workflow ${workflowId}): ${reaction} at count ${count}`);
//             // Add an exercise command to react with the choice to transition
//             // to the opposite state.
//             reactions.push({
//                 commandType: 'exercise' as const,
//                 templateId: templateId,
//                 contractId: contractId,
//                 choice: reaction,
//                 argument: Daml.record({})
//             });
//         }
//     }
//     if (reactions.length > 0) {
//         const request = {
//             commands: {
//                 applicationId: 'PingPongGameApp',
//                 workflowId: workflowId,
//                 commandId: uuid(),
//                 party: sender,
//                 list: reactions
//             }
//         }
//         // Use the same CommandClient client to send this
//         client.commandClient.submitAndWait(request, (error, _) => {
//             if (error) throw error;
//         });
//     }
// }

// /* Main loop */
// // Setup filters for just the PING and PONG contracts seen by the sender.
// // Register a callback to Pong a Ping and Ping a Pong.
// const eventCallback = (workflowId:string, events:CreatedEvent[]) =>
//         react(workflowId, events)

// // In the beginning look at all currently active contracts on the ledger
// // and react to them with the above call back.
// processActiveContracts(client, transactionFilter, eventCallback,
//     // And then afterwards
//     (offset : string) => {
//         // Listen to all new transactions.
//         listenForTransactions(client, offset, transactionFilter,
//             // React to them in the same way.
//             eventCallback);
//         // But also create a set of new pings for the receiver.
//         for(let p = 0; p < initialNumberOfPings; p++)
//             createPing(client);
// });

