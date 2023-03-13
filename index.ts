// Copyright (c) 2019, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { credentials, makeClientConstructor } from '@grpc/grpc-js';
import * as ledgerIdentityService  from "./src/generated/com/daml/ledger/api/v1/ledger_identity_service_grpc_pb";
import { GetLedgerIdentityRequest } from './src/generated/com/daml/ledger/api/v1/ledger_identity_service_pb';


let [, , hostArg, portArg] = process.argv;

let host = hostArg || 'localhost';
let port = parseInt(portArg) || 6865;

const address = `${host}:${port}`;
const channelCredential = credentials.createInsecure();

// credentials.createSsl( options.rootCerts, options.privateKey, options.certChain)

// This does not work:
// const ledgerIdentityServiceClient = new ledgerIdentityService.LedgerIdentityServiceClient(address, channelCredential, {});
const ledgerIdentityServiceC = makeClientConstructor((ledgerIdentityService as any)['com.daml.ledger.api.v1.LedgerIdentityService'], 'LedgerIdentityService');

const ledgerIdentityServiceClient =
                                                      // {} = grpcOptions
  new ledgerIdentityServiceC(address, channelCredential, {}) as unknown as ledgerIdentityService.LedgerIdentityServiceClient;

ledgerIdentityServiceClient.getLedgerIdentity(new GetLedgerIdentityRequest(),
  (error, ledgerIdentityResponse) => {
    if (error) throw error;
    if (ledgerIdentityResponse)
      console.log(ledgerIdentityResponse.getLedgerId());
  });
