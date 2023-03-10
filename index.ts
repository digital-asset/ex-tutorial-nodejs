// Copyright (c) 2019, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import * as ledger from '@digitalasset/daml-ledger';

const daml = ledger.daml;

const uuidv4 = require('uuid/v4');

const [, , host, port] = process.argv;

ledger.DamlLedgerClient.connect({ host: host || 'localhost', port: parseInt(port) || 6865 }, (error, client) => {
    if (error) throw error;
    if (client)
      console.log('hello from', client.ledgerId);
});
