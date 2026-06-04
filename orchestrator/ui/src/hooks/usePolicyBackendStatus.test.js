import { getPolicyBackendReadiness } from './usePolicyBackendStatus';

describe('getPolicyBackendReadiness', () => {
  it('treats the common main and engine runtime services as ready', () => {
    const readiness = getPolicyBackendReadiness({
      image_pulled: true,
      container_state: 'running',
      services: [
        {
          name: 'main-runtime',
          state: 'up',
          uptime_s: 60,
        },
        {
          name: 'engine-process',
          state: 'up',
          uptime_s: 60,
        },
      ],
    });

    expect(readiness).toEqual({
      ready: true,
      state: 'ready',
      message: 'Backend ready',
    });
  });
});
