import { AppInstanceStatus } from '../../src/types/medilink.ts';

class InstanceManager {
  private instances: AppInstanceStatus[] = [
    {
      id: 'instance-alpha',
      name: 'API Node Alpha',
      virtual_port: 3001,
      status: 'ACTIVE',
      requests_handled: 0,
      started_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString(),
    },
    {
      id: 'instance-beta',
      name: 'API Node Beta',
      virtual_port: 3002,
      status: 'ACTIVE',
      requests_handled: 0,
      started_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString(),
    },
  ];
  private rrIndex = 0;

  public routeRequest(): AppInstanceStatus {
    const active = this.instances.filter((i) => i.status === 'ACTIVE');
    if (active.length === 0) {
      // Fail-safe recovery: bring alpha online if both were halted
      this.instances[0].status = 'ACTIVE';
      this.instances[0].last_heartbeat = new Date().toISOString();
      this.instances[0].requests_handled += 1;
      return this.instances[0];
    }

    const chosen = active[this.rrIndex % active.length];
    this.rrIndex = (this.rrIndex + 1) % active.length;
    chosen.requests_handled += 1;
    chosen.last_heartbeat = new Date().toISOString();
    return chosen;
  }

  public setInstanceStatus(instanceId: string, status: 'ACTIVE' | 'STOPPED'): { ok: boolean; message: string } {
    const target = this.instances.find((i) => i.id === instanceId);
    if (!target) {
      return { ok: false, message: 'Instance not found.' };
    }
    if (status === 'STOPPED') {
      const otherActive = this.instances.filter((i) => i.id !== instanceId && i.status === 'ACTIVE');
      if (otherActive.length === 0) {
        return { ok: false, message: 'Cannot stop last remaining active application instance.' };
      }
    }
    target.status = status;
    target.last_heartbeat = new Date().toISOString();
    return { ok: true, message: `${target.name} is now ${status}.` };
  }

  public getInstances(): AppInstanceStatus[] {
    const nowIso = new Date().toISOString();
    return this.instances.map((inst) => ({
      ...inst,
      last_heartbeat: inst.status === 'ACTIVE' ? nowIso : inst.last_heartbeat,
    }));
  }

  public getActiveInstanceLabel(): string {
    const active = this.instances.filter((i) => i.status === 'ACTIVE');
    if (active.length === 2) return 'API Node Alpha & Beta (Load Balanced)';
    if (active.length === 1) return `${active[0].name} (Failover Active)`;
    return 'Offline';
  }
}

export const instanceManager = new InstanceManager();
