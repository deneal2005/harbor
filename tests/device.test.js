import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLowEndDevice, motionEnabled } from '../src/utils/device.js';

const device = (nav) => vi.stubGlobal('navigator', nav);
afterEach(() => vi.unstubAllGlobals());

describe('animations default on, except on low-end devices', () => {
  it('medium and high-end devices animate by default; the setting still wins', () => {
    device({ hardwareConcurrency: 4, deviceMemory: 8 });
    expect(isLowEndDevice()).toBe(false);
    expect(motionEnabled('auto')).toBe(true);
    expect(motionEnabled(undefined)).toBe(true);
    expect(motionEnabled('off')).toBe(false);
  });
  it('low memory, few cores or data saver count as low-end; "on" overrides', () => {
    for (const nav of [{ hardwareConcurrency: 2, deviceMemory: 8 }, { hardwareConcurrency: 8, deviceMemory: 2 }, { hardwareConcurrency: 8, connection: { saveData: true } }, { hardwareConcurrency: 8, connection: { effectiveType: '2g' } }]) {
      device(nav);
      expect(isLowEndDevice()).toBe(true);
      expect(motionEnabled('auto')).toBe(false);
      expect(motionEnabled('on')).toBe(true);
    }
  });
  it('browsers that report nothing are treated as capable', () => {
    device({});
    expect(isLowEndDevice()).toBe(false);
  });
});
