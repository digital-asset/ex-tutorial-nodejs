// Copyright (c) 2019, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const da = require('@da/daml-ledger').data;

const uuidv4 = require('uuid/v4');

let [, , host, port] = process.argv;
host = host || 'localhost';
port = port || 7600;

da.DamlLedgerClient.connect({ host: host, port: port }, (error, client) => {
    if (error) throw error;
    console.log('hello from', client.ledgerId);
});
