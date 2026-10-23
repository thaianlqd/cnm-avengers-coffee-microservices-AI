import http = require('node:http');
import https = require('node:https');
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { performance } from 'node:perf_hooks';

export type BrowseContext = { route: string; started: number };
type Recorder = (stage: string, value: number, route: string) => void;
const routes = new Set(['categories', 'products', 'branches', 'news']);

/** Node 20-compatible opt-in observation. Never replaces agents or consumes bodies. */
export function installUpstreamDiagnostics(
  enabled: boolean,
  context: () => BrowseContext | undefined,
  record: Recorder,
  now = () => performance.now(),
): () => void {
  if (!enabled) return () => {};
  let active = true;
  const restorers: Array<() => void> = [];
  const assignedSockets = new WeakSet<Socket>();
  for (const transport of [http, https]) {
    const original = transport.request;
    const wrapped = function (this: unknown, ...args: any[]): ClientRequest {
      const span = active && context();
      if (!span || !routes.has(span.route)) return Reflect.apply(original, this, args);
      // Begin before native request construction, including time in the Agent queue.
      const started = now();
      let request: ClientRequest;
      try { request = Reflect.apply(original, this, args); }
      catch (error) { record('upstream_error', 1, span.route); throw error; }
      if (request.method !== 'GET') return request;
      const emit = (stage: string, value: number) => record(stage, value, span.route);
      emit('gateway_dispatch', started - span.started);
      const agent = (request as ClientRequest & { agent?: http.Agent }).agent;
      if (agent) {
        const count = (entries: Record<string, readonly unknown[] | undefined>) =>
          Object.values(entries).reduce((total, list) => total + (list?.length || 0), 0);
        emit('agent_queue_depth', count(agent.requests));
        emit('agent_active_sockets', count(agent.sockets));
        emit('agent_idle_sockets', count(agent.freeSockets));
      }
      const cleanup: Array<() => void> = [];
      let finishedAt: number | undefined;
      let completed = false;
      let socketWaitMs: number | undefined;
      let dnsMs = 0;
      let connectMs = 0;
      const listen = (target: any, event: string, handler: (...values: any[]) => void) => {
        target.once(event, handler);
        cleanup.push(() => target.removeListener(event, handler));
      };
      listen(request, 'socket', (socket: Socket & { encrypted?: boolean }) => {
        const assigned = now();
        socketWaitMs = assigned - started; emit('socket_wait', socketWaitMs);
        const reused = request.reusedSocket || assignedSockets.has(socket);
        assignedSockets.add(socket);
        emit(reused ? 'socket_reused' : 'socket_new', 1);
        if (reused) return; // Never attach connect/lookup listeners to an idle reused socket.
        if (!socket.connecting) { emit('socket_preconnected', 1); return; }
        let lookedUpAt: number | undefined;
        let connectedAt: number | undefined;
        listen(socket, 'lookup', (error: unknown) => {
          lookedUpAt = now();
          // Observed assignment-to-lookup callback, including resolver callback delay.
          // This is not isolated DNS-server execution time. IP targets have no lookup sample.
          dnsMs = lookedUpAt - assigned; emit('dns_lookup', dnsMs);
          if (error) emit('dns_error', 1);
        });
        listen(socket, 'connect', () => {
          connectedAt = now();
          connectMs = connectedAt - (lookedUpAt ?? assigned); emit('tcp_connect', connectMs);
          if (!socket.encrypted) emit('upstream_connect', connectedAt - started);
        });
        if (socket.encrypted) listen(socket, 'secureConnect', () => {
          const secured = now();
          if (connectedAt !== undefined) { connectMs += secured - connectedAt; emit('tls_connect', secured - connectedAt); }
          emit('upstream_connect', secured - started);
        });
      });
      listen(request, 'finish', () => { finishedAt = now(); });
      listen(request, 'response', (response: IncomingMessage) => {
        const headersAt = now();
        emit('upstream_ttfb', headersAt - started);
        if (finishedAt !== undefined) emit('upstream_response_wait', headersAt - finishedAt);
        if (headersAt - started >= 1500) {
          // Attribute slow headers using segments of THIS request, without logging it.
          const segments: Array<[string, number]> = [['socket_wait', socketWaitMs ?? 0], ['dns', dnsMs], ['connect', connectMs], ['response_wait', finishedAt === undefined ? 0 : headersAt - finishedAt]];
          const dominant = segments.reduce((largest, item) => item[1] > largest[1] ? item : largest);
          emit('slow_' + (dominant[1] > 0 ? dominant[0] : 'unattributed'), 1);
        }
        // No data/readable listener, resume(), retry, mutation or buffering.
        listen(response, 'end', () => { completed = true; emit('upstream_total', now() - started); });
      });
      listen(request, 'error', () => emit('upstream_error', 1));
      listen(request, 'abort', () => emit('upstream_abort', 1));
      request.once('close', () => {
        if (!completed) emit('upstream_failed_total', now() - started);
        for (const remove of cleanup) remove();
      });
      return request;
    } as typeof http.request & typeof https.request;
    transport.request = wrapped;
    restorers.push(() => { if (transport.request === wrapped) transport.request = original as typeof wrapped; });
  }
  return () => { active = false; for (const restore of restorers) restore(); };
}
