# SH5 Robot Assets Design

## Goal

Render AI Worker SH5 Rev1 in the existing record, inference, and replay 3D views using the same asset layout already used by SG2.

## Existing Pattern

SG2 keeps a generated URDF in `shared/shared/robot_configs/urdf/` and the referenced `ffw_description` STL assets in `shared/shared/robot_configs/ffw_description/meshes/`. The robot config points at the URDF with a relative `urdf_path`, Docker bind-mounts both asset directories into nginx, and the React URDF loader maps `package://ffw_description/...` to `/urdf/ffw_description/...`.

## SH5 Approach

Add `shared/shared/robot_configs/urdf/ffw_sh5_follower.urdf` from `ROBOTIS-GIT/ai_worker` and keep its mesh references resolvable inside the existing vendored `ffw_description` tree. SH5 shares the follower body/arm/head and swerve base meshes with SG2, so reuse the source xacro's `common/follower/swerve` path instead of inventing another base mesh source. Add the new `common/hx5_d20` left and right hand STL files because those are the actual SH5-specific visual assets.

## Integration Points

Set `ffw_sh5_rev1_config.yaml` to `urdf_path: urdf/ffw_sh5_follower.urdf`. Move the UI fallback URDF map into a small pure helper and add `ffw_sh5_rev1` there so the viewer can render before `/get_robot_info` returns. Keep the existing Docker/nginx mounts unchanged.

## Validation

Add a schema test that loads the SH5 config, resolves the URDF path, parses all mesh filenames, and verifies every `ffw_description` STL reference exists in `shared/shared/robot_configs/ffw_description`. Add a focused UI fallback test for the SH5 and SG2 URDF path mapping.
