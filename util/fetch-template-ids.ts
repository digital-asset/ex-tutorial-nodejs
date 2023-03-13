// Copyright (c) 2019, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { credentials, makeClientConstructor } from '@grpc/grpc-js';
import * as packageService  from "../src/generated/com/daml/ledger/api/v1/package_service_grpc_pb";
import { GetPackageRequest, ListPackagesRequest } from '../src/generated/com/daml/ledger/api/v1/package_service_pb';
import { ArchivePayload } from '../src/generated/com/daml/daml_lf_1_14/daml_lf_pb';


import fs from 'fs';
import { Writable } from 'stream';


const {host, port, out} = readOptions();
const address = `${host}:${port}`;
const channelCredential = credentials.createInsecure();

const writer : Writable = out ? fs.createWriteStream(out) : process.stdout;
writer.write('{');
var closed = false;
process.on('beforeExit', () => {
    if (!closed) {
        writer.write('}\n');
        closed = true;
    }
});

// This allows to download packages smaller than 50MB (after compression)
// Raise this if your packages is larger than this size
const grpcOptions = {
    'grpc.max_receive_message_length': 50 * 1024 * 1024
};

const packageServiceC = makeClientConstructor((packageService as any)['com.daml.ledger.api.v1.PackageService'], 'PackageService');
const packageServiceClient =
    new packageServiceC(address, channelCredential, grpcOptions) as unknown as packageService.PackageServiceClient;

packageServiceClient.listPackages(new ListPackagesRequest(), (error, response) => {
    if (error) throw error;
    if (!response) throw "Undefined response";
    let first = true;
    for (const packageId of response.getPackageIdsList()) {
        let getPackageRequest = new GetPackageRequest();
        getPackageRequest.setPackageId(packageId);
        packageServiceClient.getPackage(getPackageRequest, (error, response) => {
            if (error) throw error;
            if (!response) throw "Undefined response";
            const templateNames = getTemplateIds(response.getArchivePayload_asU8());
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
    }});


function getTemplateIds(archivePayload : Uint8Array) {
    const templateNames = [];
    const archive = ArchivePayload.deserializeBinary(archivePayload).getDamlLf1();
    if (!archive) throw "No Archive";
    for (const damlModule of archive.getModulesList()) {
        if (damlModule.hasNameDname()) {
            const moduleName = damlModule.getNameDname()?.getSegmentsList().join('.');
            for (const template of damlModule.getTemplatesList()) {
                const templateName = template.getTyconDname()?.getSegmentsList().join('.');
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

function printUsageAndExit() {
    console.log('Usage: [-h/--host LEDGER_HOST] [-p/--port LEDGER_PORT] [-o/--out OUT_FILE]');
    console.log('Defaults to [host: localhost, port: 6865, out: stdout]');
    process.exit(-1);
}

function readOptions() {
    var host = undefined;
    var port = undefined;
    var out = undefined;
    for (let i = 2; i < process.argv.length; i += 2) {    // Since run from ts-node
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
            port = parseInt(argument);
        } else if (option === '-o' || option === '--out') {
            if (out !== undefined || argument === undefined) {
                printUsageAndExit();
            }
            out = argument;
        } else {
            printUsageAndExit();
        }
    }
    return {host:host || 'localhost', port:port || 6865, out};
}
