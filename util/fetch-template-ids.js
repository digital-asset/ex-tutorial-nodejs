// Copyright (c) 2019, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const daml = require('@digitalasset/daml-ledger');
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

function getTemplateIds(archivePayload) {
    const templateNames = [];
    const archive = daml.lf.ArchivePayload.deserializeBinary(archivePayload).getDamlLf1();
    for (const damlModule of archive.getModulesList()) {
        if (damlModule.hasNameDname()) {
            const moduleName = damlModule.getNameDname().getSegmentsList().join('.');
            for (const template of damlModule.getTemplatesList()) {
                const templateName = template.getTyconDname().getSegmentsList().join('.');
                templateNames.push({moduleName: moduleName, entityName: templateName});
            }
        } else if (damlModule.hasNameInternedDname()) {
            const internedDottedNames = archive.getInternedDottedNamesList();
            const internedStrings = archive.getInternedStringsList();
            const i = damlModule.getNameInternedDname();
            const moduleName = internedDottedNames[i].getSegmentsInternedStrList().map(j => internedStrings[j]).join('.');
            for (const template of damlModule.getTemplatesList()) {
                const k = template.getTyconInternedDname();
                const templateName = internedDottedNames[k].getSegmentsInternedStrList().map(l => internedStrings[l]).join('.');
                templateNames.push({moduleName: moduleName, entityName: templateName});
            }
        }
    }
    return templateNames;
}

// This allows to download packages smaller than 50MB (after compression)
// Raise this if your packages is larger than this size
const grpcOptions = {
    'grpc.max_receive_message_length': 50 * 1024 * 1024
};
daml.DamlLedgerClient.connect({ host: host, port: port, grpcOptions: grpcOptions }, (error, client) => {
    if (error) throw error;
    let first = true;
    client.packageClient.listPackages((error, response) => {
        if (error) throw error;
        for (const packageId of response.packageIds) {
            client.packageClient.getPackage(packageId, (error, response) => {
                if (error) throw error;
                const templateNames = getTemplateIds(response.archivePayload);
                for (const {moduleName, entityName} of templateNames) {
                    const name = `${moduleName}:${entityName}`;
                    writer.write(`${first ? '' : ','}"${name}":${JSON.stringify({
                        packageId: packageId,
                        moduleName: moduleName,
                        entityName: entityName
                    })}`);
                    first = false;
                }
            });
        }
    });
});

function printUsageAndExit() {
    console.log('Usage: [-h/--host LEDGER_HOST] [-p/--port LEDGER_PORT] [-o/--out OUT_FILE]');
    console.log('Defaults to [host: localhost, port: 6865, out: stdout]');
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
    return [host || 'localhost', port || 6865, out];
}
