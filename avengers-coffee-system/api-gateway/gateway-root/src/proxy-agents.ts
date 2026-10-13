import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import type { Socket } from 'node:net';

/** Opt-in transport experiment. No request retries or business timeout changes. */
export class ProxyAgents {
  private readonly agents = new Map<string, HttpAgent>();
  constructor(private readonly env: NodeJS.ProcessEnv, private readonly now = () => Date.now()) {}

  forTarget(target: string): HttpAgent | undefined {
    if (this.env.GATEWAY_PROXY_KEEP_ALIVE !== 'true') return undefined;
    const url = new URL(target);
    let agent = this.agents.get(url.origin);
    if (agent) return agent;
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported proxy transport');
    const options = { keepAlive: true, maxSockets: 128, maxTotalSockets: 128,
      maxFreeSockets: 16, scheduling: 'lifo' as const };
    agent = url.protocol === 'https:' ? new HttpsAgent(options) : new HttpAgent(options);
    const keepSocketAlive = agent.keepSocketAlive.bind(agent);
    const firstFree = new WeakMap<Socket, number>();
    // Kubernetes balances connections, not requests. Retire pooled connections
    // after 30s when a completed response returns them to the idle pool, allowing
    // new Ready endpoints to receive traffic. This is not per-request balancing.
    // Never destroy an in-flight response or shorten the existing proxy timeout.
    agent.keepSocketAlive = (socket: Socket) => {
      const started = firstFree.get(socket) ?? this.now();
      firstFree.set(socket, started);
      return this.now() - started < 30000 && keepSocketAlive(socket);
    };
    this.agents.set(url.origin, agent);
    return agent;
  }

  destroy() {
    for (const agent of this.agents.values()) agent.destroy();
    this.agents.clear();
  }
}
