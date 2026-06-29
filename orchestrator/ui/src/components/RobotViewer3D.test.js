import { getFallbackUrdfPath } from '../utils/robotUrdfPaths';

describe('RobotViewer3D URDF fallback paths', () => {
  it('resolves SH5 to its vendored URDF', () => {
    expect(getFallbackUrdfPath('ffw_sh5_rev1')).toBe('/urdf/urdf/ffw_sh5_follower.urdf');
  });

  it('keeps existing SG2 fallback behavior', () => {
    expect(getFallbackUrdfPath('ffw_sg2_rev1')).toBe('/urdf/urdf/ffw_sg2_follower.urdf');
  });
});
