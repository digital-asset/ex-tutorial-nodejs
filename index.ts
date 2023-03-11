// Copyright (c) 2019, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import * as ledger from "@digitalasset/daml-ledger";

let [, , hostArg, portArg] = process.argv;

let host = hostArg || 'localhost';
let port = parseInt(portArg) || 6865;

ledger.DamlLedgerClient.connect({ host, port}, (error, client) => {
    if (error) throw error;
    if (client)
      console.log('hello from', client.ledgerId);
});
