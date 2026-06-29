const ROBOT_URDF_BASENAMES = {
  ffw_sg2_rev1: 'ffw_sg2_follower.urdf',
  ffw_sg2_rev2: 'ffw_sg2_follower.urdf',
  ffw_sh5_rev1: 'ffw_sh5_follower.urdf',
  ffw_bg2_rev4: 'ffw_bg2_rev4_follower.urdf',
};

export function getFallbackUrdfPath(robotType) {
  const basename = ROBOT_URDF_BASENAMES[robotType];
  return basename ? `/urdf/urdf/${basename}` : null;
}
