// Copyright (c) 2019, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const ledger = require('@da/daml-ledger').data;
const da = require('@da/daml-ledger').da;
const fs = require('fs');

const [host, port, out] = readOptions();
const writer = out ? fs.createWriteStream(out) : process.stdout;

writer.write('{');
let closed = false;
process.on('beforeExit', () => {
    if (!closed) {
        writer.write('}\n');
        closed = true;
    }
});

ledger.DamlLedgerClient.connect({ host: host, port: port }, (error, client) => {
    if (error) throw error;
    let first = true;
    client.packageClient.listPackages((error, response) => {
        if (error) throw error;
        for (const packageId of response.packageIds) {
            client.packageClient.getPackage(packageId, (error, response) => {
                if (error) throw error;
                const payload = da.daml_lf.ArchivePayload.deserializeBinary(response.archivePayload);
                for (const damlModule of payload.getDamlLf1().getModulesList()) {
                    const moduleName = damlModule.getName().getSegmentsList().join('.');
                    for (const template of damlModule.getTemplatesList()) {
                        const templateName = template.getTycon();
                        const name = [moduleName, templateName].join('.');
                        writer.write(`${first ? '' : ','}"${name}":${JSON.stringify({
                            packageId: packageId,
                            name: name
                        })}`);
                        first = false;
                    }
                }
            });
        }
    });
});

function printUsageAndExit() {
    console.log('Usage: [-h/--host LEDGER_HOST] [-p/--port LEDGER_PORT] [-o/--out OUT_FILE]');
    console.log('Defaults to [host: localhost, port: 7600, out: stdout]');
    process.exit(-1);
}

function readOptions() {
    let host = undefined;
    let port = undefined;
    let out = undefined;
    for (let i = 2; i < process.argv.length; i += 2) {
        const option = process.argv[i];
        const argument = process.argv[i + 1];
        if (option === '-h' || option === '--host') {
            if (host !== undefined || argument === undefined) {
                printUsageAndExit();
            }
            host = argument;
        } else if (option === '-p' || option === '--port') {
            if (port !== undefined || argument === undefined) {
                printUsageAndExit();
            }
            port = argument;
        } else if (option === '-o' || option === '--out') {
            if (out !== undefined || argument === undefined) {
                printUsageAndExit();
            }
            out = argument;
        } else {
            printUsageAndExit();
        }
    }
    return [host || 'localhost', port || 7600, out];
}