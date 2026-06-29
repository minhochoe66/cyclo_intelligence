# SH5 Robot Assets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI Worker SH5 Rev1 URDF and HX5-D20 hand mesh assets so existing 3D viewers render SH5 like SG2.

**Architecture:** Reuse the SG2 asset model: generated URDF under `shared/shared/robot_configs/urdf`, STL files under `shared/shared/robot_configs/ffw_description/meshes`, and `package://ffw_description` web resolution through the existing URDF loader. SH5 config and UI fallback point at the new URDF basename.

**Tech Stack:** Python pytest, YAML robot config schema, React Three Fiber, `urdf-loader`, vendored STL/URDF assets.

---

### Task 1: Asset Resolution Test

**Files:**
- Modify: `shared/tests/test_robot_config_schema.py`
- Read: `shared/shared/robot_configs/ffw_sh5_rev1_config.yaml`

**Step 1: Write the failing test**

Add a test that loads `ffw_sh5_rev1`, asserts `get_urdf_path()` ends with `shared/robot_configs/urdf/ffw_sh5_follower.urdf`, parses the URDF XML, extracts all `package://ffw_description/*.stl` mesh references, and asserts each maps to an existing file under `shared/shared/robot_configs/ffw_description`.

**Step 2: Run test to verify it fails**

Run: `pytest shared/tests/test_robot_config_schema.py::test_sh5_urdf_path_and_mesh_assets_resolve -q`

Expected: FAIL because `urdf_path` is empty and `ffw_sh5_follower.urdf` is not present.

### Task 2: Add SH5 Assets and Config

**Files:**
- Modify: `shared/shared/robot_configs/ffw_sh5_rev1_config.yaml`
- Create: `shared/shared/robot_configs/urdf/ffw_sh5_follower.urdf`
- Create: `shared/shared/robot_configs/ffw_description/meshes/common/hx5_d20/**.stl`
- Create: `shared/shared/robot_configs/ffw_description/meshes/common/follower/swerve/**.stl`

**Step 1: Import SH5 URDF**

Copy the generated SH5 URDF from `ROBOTIS-GIT/ai_worker` `origin/main:ffw_description/urdf/ffw_sh5_rev1_follower/ffw_sh5_follower.urdf`.

**Step 2: Normalize missing mesh references**

The generated URDF references `package://ffw_description/meshes/ffw_sh5_rev1_follower/*.stl`, but the source xacro uses `package://ffw_description/meshes/common/follower/swerve/*.stl`. Replace those SH5-specific base/wheel/lift mesh paths with the source xacro's swerve paths.

**Step 3: Import STL assets**

Copy all STL files from `origin/main:ffw_description/meshes/common/hx5_d20/` and `origin/main:ffw_description/meshes/common/follower/swerve/` into the matching `shared/shared/robot_configs/ffw_description/meshes/` paths.

**Step 4: Set config URDF path**

Set `urdf_path: urdf/ffw_sh5_follower.urdf` in `shared/shared/robot_configs/ffw_sh5_rev1_config.yaml`.

**Step 5: Run the focused test**

Run: `pytest shared/tests/test_robot_config_schema.py::test_sh5_urdf_path_and_mesh_assets_resolve -q`

Expected: PASS.

### Task 3: UI Fallback

**Files:**
- Modify: `orchestrator/ui/src/components/RobotViewer3D.js`
- Create: `orchestrator/ui/src/utils/robotUrdfPaths.js`
- Create: `orchestrator/ui/src/components/RobotViewer3D.test.js`

**Step 1: Write the failing test**

Add a test that verifies `ffw_sh5_rev1` resolves to `/urdf/urdf/ffw_sh5_follower.urdf` and `ffw_sg2_rev1` remains unchanged.

**Step 2: Implement fallback helper**

Move the fallback basename map into `robotUrdfPaths.js`, include SH5, and import the helper from `RobotViewer3D.js`.

**Step 3: Run frontend test**

Run: `npm test -- --runInBand --watchAll=false RobotViewer3D.test.js` from `orchestrator/ui`.

Expected: PASS.

### Task 4: Final Verification

**Files:**
- All modified files

**Step 1: Run backend schema tests**

Run: `pytest shared/tests/test_robot_config_schema.py -q`

Expected: PASS.

**Step 2: Run focused UI tests**

Run: `npm test -- --runInBand --watchAll=false RobotViewer3D.test.js`

Expected: PASS.

**Step 3: Inspect git status**

Run: `git status --short`

Expected: only the SH5 asset, config, UI fallback, and plan/test files changed.
