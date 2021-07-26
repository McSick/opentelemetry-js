/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  collectorTypes,
  CollectorExporterNodeConfigBase,
} from '@opentelemetry/exporter-collector';
import * as path from 'path';

import { ServiceClientType } from './types';
import { CollectorExporterNodeBase } from './CollectorExporterNodeBase';
import type { Type } from 'protobufjs';
import * as protobufjs from 'protobufjs';

let ExportRequestProto: Type | undefined;

export function getExportRequestProto(): Type | undefined {
  return ExportRequestProto;
}

export function onInit<ExportItem, ServiceRequest>(
  collector: CollectorExporterNodeBase<ExportItem, ServiceRequest>,
  _config: CollectorExporterNodeConfigBase
): void {
  const dir = path.resolve(__dirname, '..', 'protos');
  const root = new protobufjs.Root();
  root.resolvePath = function (origin, target) {
    return `${dir}/${target}`;
  };
  if (collector.getServiceClientType() === ServiceClientType.SPANS) {
    void root.load([
      'opentelemetry/proto/common/v1/common.proto',
      'opentelemetry/proto/resource/v1/resource.proto',
      'opentelemetry/proto/trace/v1/trace.proto',
      'opentelemetry/proto/collector/trace/v1/trace_service.proto',
    ]).then(proto => {
      ExportRequestProto = proto?.lookupType('ExportTraceServiceRequest');
    });
    
  } else {
    void root.load([
      'opentelemetry/proto/common/v1/common.proto',
      'opentelemetry/proto/resource/v1/resource.proto',
      'opentelemetry/proto/metrics/v1/metrics.proto',
      'opentelemetry/proto/collector/metrics/v1/metrics_service.proto',
    ]).then(proto => {
      ExportRequestProto = proto?.lookupType('ExportMetricsServiceRequest');
    });
    
  }
}

/**
 * function to send metrics/spans using browser XMLHttpRequest
 *     used when navigator.sendBeacon is not available
 * @param body
 * @param onSuccess
 * @param onError
 */
 export function sendWithXhr(
  body: string | Buffer | Int8Array,
  url: string,
  headers: Record<string, string>,
  onSuccess: () => void,
  onError: (error: collectorTypes.CollectorExporterError) => void
) {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', url);
  //TODO: Abstract this out and set the protobuf header elsewhere
  // probably  @opentelemetry/exporter-collector
  const defaultHeaders = {
    'Content-Type': 'application/x-protobuf'
  };

  Object.entries({
    ...defaultHeaders,
    ...headers,
  }).forEach(([k, v]) => {
    xhr.setRequestHeader(k, v);
  });

  xhr.send(body);

  xhr.onreadystatechange = () => {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      if (xhr.status >= 200 && xhr.status <= 299) {
        //diag.debug('xhr success', body);
        onSuccess();
      } else {
        const error = new collectorTypes.CollectorExporterError(
          `Failed to export with XHR (status: ${xhr.status})`,
          xhr.status
        );

        onError(error);
      }
    }
  };
}

export function send<ExportItem, ServiceRequest>(
  collector: CollectorExporterNodeBase<ExportItem, ServiceRequest>,
  objects: ExportItem[],
  onSuccess: () => void,
  onError: (error: collectorTypes.CollectorExporterError) => void
): void {
  const serviceRequest = collector.convert(objects);

  const message = getExportRequestProto()?.create(serviceRequest);
  if (message) {
    const body = getExportRequestProto()?.encode(message).finish();
    if (body) {
      sendWithXhr(new Int8Array(body), collector.url, collector.headers, onSuccess, onError);
    }
  } else {
    onError(new collectorTypes.CollectorExporterError('No proto'));
  }
}
