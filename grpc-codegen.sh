#!/usr/bin/env bash
# Copyright (c) 2022 Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

set -euxo pipefail

cd "$(dirname "${0}")"

GRPC_VERSION=1.24.3
SDK_VERSION=2.5.5

PROTO_PATH="./proto"
OUT_PATH="./src/generated"
TEST_OUT_PATH="./test/generated"

function clean() {
    (cd "$(dirname "${0}")" && rm -rf "$PROTO_PATH" "$OUT_PATH")
}

trap clean ERR

if [ ! -d "$PROTO_PATH" ]; then
    mkdir -p "$PROTO_PATH" && (
      cd "$PROTO_PATH"
      rm -rf protos-"$SDK_VERSION" \
        && wget https://github.com/digital-asset/daml/releases/download/v"$SDK_VERSION"/protobufs-"$SDK_VERSION".zip -O temp.zip \
        && unzip temp.zip \
        && rm temp.zip \
        && mv protos-"$SDK_VERSION"/com . \
        && rmdir protos-"$SDK_VERSION"
      mkdir -p grpc/health/v1
      curl -s https://raw.githubusercontent.com/grpc/grpc/v"$GRPC_VERSION"/src/proto/grpc/health/v1/health.proto > grpc/health/v1/health.proto
      mkdir -p google/rpc
      curl -s https://raw.githubusercontent.com/grpc/grpc/v"$GRPC_VERSION"/src/proto/grpc/status/status.proto > google/rpc/status.proto
      mkdir -p grpc/reflection/v1alpha
      curl -s https://raw.githubusercontent.com/grpc/grpc/v"$GRPC_VERSION"/src/proto/grpc/reflection/v1alpha/reflection.proto > grpc/reflection/v1alpha/reflection.proto
    )
fi

if [ ! -d "$OUT_PATH" ]; then
    mkdir -p "$OUT_PATH"
    grpc_tools_node_protoc \
      --js_out="import_style=commonjs,binary:${OUT_PATH}" \
      --proto_path="${PROTO_PATH}" \
      --grpc_out="generate_package_definition:${OUT_PATH}" \
      "${PROTO_PATH}"/com/daml/ledger/api/v1/*.proto \
      "${PROTO_PATH}"/com/daml/ledger/api/v1/admin/*.proto \
      "${PROTO_PATH}"/com/daml/ledger/api/v1/testing/*.proto \
      "${PROTO_PATH}"/google/rpc/*.proto \
      "${PROTO_PATH}"/grpc/health/v1/*.proto
    grpc_tools_node_protoc \
      --js_out="import_style=commonjs,binary:${OUT_PATH}" \
      --proto_path="${PROTO_PATH}" \
      --grpc_out="generate_package_definition:${OUT_PATH}" \
      "${PROTO_PATH}"/com/daml/daml_lf_1_14/*.proto
    grpc_tools_node_protoc \
      --plugin=protoc-gen-ts=`which protoc-gen-ts` \
      --proto_path="${PROTO_PATH}" \
      --ts_out="service=grpc-node,mode=grpc-js:${OUT_PATH}"\
      "${PROTO_PATH}"/com/daml/ledger/api/v1/*.proto \
      "${PROTO_PATH}"/com/daml/ledger/api/v1/admin/*.proto \
      "${PROTO_PATH}"/com/daml/ledger/api/v1/testing/*.proto \
      "${PROTO_PATH}"/google/rpc/*.proto \
      "${PROTO_PATH}"/grpc/health/v1/*.proto
    grpc_tools_node_protoc \
      --plugin=protoc-gen-ts=`which protoc-gen-ts` \
      --proto_path="${PROTO_PATH}" \
      --ts_out="service=grpc-node,mode=grpc-js:${OUT_PATH}"\
      "${PROTO_PATH}"/com/daml/daml_lf_1_14/*.proto
fi


#--ts_out="generate_package_definition:${OUT_PATH}" \
#protoc --plugin=protoc-gen-ts_proto=.\node_modules\.bin\protoc-gen-ts_proto.cmd --ts_proto_out=. ./protos/auth.proto --ts_proto_opt=outputServices=grpc-js,env=node,esModuleInterop=true

if [ ! -d "$TEST_OUT_PATH" ]; then
    mkdir -p "$TEST_OUT_PATH"
    grpc_tools_node_protoc \
      --js_out="import_style=commonjs,binary:${TEST_OUT_PATH}" \
      --proto_path="${PROTO_PATH}" \
      --grpc_out="generate_package_definition:${TEST_OUT_PATH}" \
      "${PROTO_PATH}"/grpc/reflection/v1alpha/reflection.proto
    grpc_tools_node_protoc \
      --plugin=protoc-gen-ts=`which protoc-gen-ts` \
      --proto_path="${PROTO_PATH}" \
      --ts_out="generate_package_definition:${TEST_OUT_PATH}" \
      "${PROTO_PATH}"/grpc/reflection/v1alpha/reflection.proto
fi
