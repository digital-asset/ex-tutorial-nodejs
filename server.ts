// Copyright (c) 2019, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { credentials, makeClientConstructor } from '@grpc/grpc-js';
import * as activeContractsService  from "./src/generated/com/daml/ledger/api/v1/active_contracts_service_grpc_pb";
import { GetActiveContractsRequest, GetActiveContractsResponse } from './src/generated/com/daml/ledger/api/v1/active_contracts_service_pb';

import { Filters, InclusiveFilters, TransactionFilter } from './src/generated/com/daml/ledger/api/v1/transaction_filter_pb';
import { Identifier } from './src/generated/com/daml/ledger/api/v1/value_pb';

import * as templateIds from './template-ids.json';

import { v4 as uuid} from 'uuid';
import { CreatedEvent } from './src/generated/com/daml/ledger/api/v1/event_pb';

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

/* Setup transaction filter.
 */
let senderFilter = new Filters();
let inclusiveSenderFilter = new InclusiveFilters();
inclusiveSenderFilter.setTemplateIdsList([PING, PONG].map(value => {
  const identifier =new Identifier();
  identifier.setPackageId(value.packageId);
  identifier.setModuleName(value.moduleName);
  identifier.setEntityName(value.entityName);
  return identifier;
}));

senderFilter.setInclusive(inclusiveSenderFilter);
const filtersByParty : Record<string, Filters> = {} ;
filtersByParty[sender] = senderFilter;
let transactionFilter = new TransactionFilter();
let transactionFilterObj = transactionFilter.getFiltersByPartyMap();
// Being explicit about the above conversion even though we only have on Party.
Object.keys(filtersByParty).forEach((party) => {
   // console.log(`Setting ${party} to filter ${JSON.stringify(filtersByParty[party])}`);
  transactionFilterObj.set(party, filtersByParty[party])
});

// console.log("transactionFilterObj:", JSON.stringify(transactionFilterObj));
// console.log("transactionFilter:", JSON.stringify(transactionFilter));

type EventCallback = (workflowId:string, events:any[]) => void
type CompleteCallback = (offset : string) => void

async function processActiveContracts( callback : EventCallback, onComplete : CompleteCallback) {
    /* An important service of the Ledger API is the Active Contract Service
     * https://docs.daml.com/app-dev/services.html#active-contract-service
     * which can be used to bootstrap state as is tells the client's Party
     * what contracts (that meet the required filter) are currently active
     * on the ledger.
     */
    const activeContractsServiceC = makeClientConstructor((activeContractsService as any)['com.daml.ledger.api.v1.ActiveContractsService'], 'LedgerIdentityService');

    const activeContractsServiceClient =
                                                          // {} = grpcOptions
      new activeContractsServiceC(address, channelCredential, {}) as unknown as activeContractsService.ActiveContractsServiceClient;

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
    console.log(`events ${JSON.stringify(events)}}`);

    callback(workflowId, events);

    onComplete(offset);
}

(async () => {
  try {
    let res = processActiveContracts( (_workflowId, events) => {
      for(let event of events){
        console.log(`event: ${event}`);
      }},
      (offset) => console.log(`offset: ${offset}`)
    );
    console.log(`${res}`);
    } catch (e) {
      console.error(`error: ${e}`);
    }}) ();

// // To create commands against the ledger we need to construct commands.
// function createPing (client : LedgerClient) {
//     const request = {
//         // A set of commands to be applied atomically
//         commands: {
//             applicationId: 'PingPongGameApp',   //  the name of your application
//             workflowId: `Ping-${sender}`,    // an (optional) identifier you can
//                                              // use to group commands pertaining
//                                                      // to one of your workflows
//             commandId: uuid(),           // a unique identifier for the commands
//             party: sender,                      // who is submitting the command
//             list: [{                      // Each request is made up of commands
//                 commandType: 'create' as const,

//                 templateId: PING,       // the identifier of the template of the
//                                             // contract you wish to create Ping.
//                 arguments: {                  // an object containing the fields
//                                              // necessary to create the contract
//                     fields: {
//                         sender: Daml.party(sender),
//                         receiver: Daml.party(receiver),
//                         count: Daml.int64(0)
//                     }
//                 }
//             }]
//       }
//     };

//     /* The Ledger Client has a CommandClient that wraps the Command Service
//      * https://docs.daml.com/app-dev/services.html#command-service
//      * It issues commands against the ledger and waits for a response
//      */
//     client.commandClient.submitAndWait(request, (error, response) => {
//         if (error) throw error;
//         console.log(`Created Ping contract from ${sender} to ${receiver}: ${response}.`);
//     });
// }

// // The ledger changes as new transactions are added to it.
// // Here we subscribe to those changes.
// function listenForTransactions(client : LedgerClient,
//                                 offset : string,
//                                 transactionFilter : TransactionFilter,
//                                 callback : EventCallback) {
//     console.log(`${sender} starts reading transactions from offset: ${offset}.`);
//     const request = {
//         begin: { offsetType: 'absolute' as const,        // Listen at a specific
//                  absolute: offset                    // offset to avoid history.
//                },
//         filter: transactionFilter                // Only for specific templates.
//     };

//     const transactions = client.transactionClient.getTransactions(request);
//     transactions.on('data', response => {
//         for (const transaction of response.transactions) {
//             if(!callback) {
//                 console.log('Transaction read:', transaction.transactionId);
//             } else {
//                 const events = [];
//                 // Accumulate what new things were created on the ledger as
//                 // part of this transaction.
//                 for (const event of transaction.events) {
//                     if (event.eventType === 'created') {
//                       events.push(event);
//                     }
//                 }
//                 if (events.length > 0) {
//                     // And the react to them via this callback.
//                     callback(transaction.workflowId, events);
//                 }
//             }
//         }
//     });
//     transactions.on('error', error => {
//         console.error(`${sender} encountered an error while processing transactions!`);
//         console.error(error);
//         process.exit(-1);
//     });
// };

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

