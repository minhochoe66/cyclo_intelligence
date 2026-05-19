# orchestrator

Standalone ROS2 node that owns the control plane — session state, UI
command routing, policy container lifecycle, behaviour-tree driven
execution. Pairs with `cyclo_data` (data plane) over well-defined srv
boundaries.

```
orchestrator/
├── orchestrator_node.py       ROS2 Node entry — class OrchestratorNode.
│                              Step 5-B renamed it from
│                              physical_ai_server.py + class
│                              PhysicalAIServer, per the cyclo_data
│                              <pkg>_node.py convention.
├── launch/                    ros2 launch files.
│   ├── orchestrator.launch.py          OrchestratorNode only.
│   ├── orchestrator_bringup.launch.py  OrchestratorNode + bt_node
│   │                                   + rosbridge + rosbag_recorder
│   │                                   + web_video_server.
│   └── bt_node.launch.py      BT node (Step 5-A — absorbed from
│                              physical_ai_bt/bt_bringup/).
├── config/                    Robot-specific YAML
│                              (ffw_sg2_rev1_config.yaml, etc.).
│                              Top-level key is 'orchestrator'
│                              (Step 2 Import Fixer).
│
├── bt/                        Behaviour Tree subsystem (absorbed
│     │                        from physical_ai_bt in Step 5-A).
│     ├── bt_core.py           NodeStatus, BTNode base classes.
│     ├── bt_node.py           BehaviorTreeNode ROS2 Node
│     │                        (orchestrator_bt_node). Provides
│     │                        /bt/nodes/catalog, /bt/load_and_run,
│     │                        /bt/set_running, /bt/status, and
│     │                        /bt/active_nodes.
│     ├── bt_nodes_loader.py   XML → runtime tree assembly via the
│     │                        dynamic node registry.
│     ├── node_registry.py     Scans actions/controls and builds the
│     │                        BT Manager catalog from class signatures.
│     ├── blackboard.py        Shared-state blackboard.
│     ├── constants.py         Runtime defaults for BT actions.
│     ├── actions/             Built-in and user-defined action nodes.
│     ├── controls/            loop / sequence / base_control.
│     ├── templates/           Copy-and-edit templates for custom
│     │                        Action / Control BT nodes.
│     ├── trees/               Robot-specific tree XML
│     │                        (ffw_sg2_rev1.xml, korea_mat.xml).
│     │                        Installed under share/orchestrator/
│     │                        bt/trees/.
│     └── bringup/             bt_node_params.yaml installed to
│                              share/orchestrator/bt/bringup/.
│
├── internal/                  Node-local utilities — not part of
│     │                        the inter-package import surface
│     │                        (drift D4, Step 2).
│     ├── communication/       ROS2 client wrappers.
│     │   ├── communicator.py              Pub/sub for sensor topics.
│     │   ├── container_service_client.py  InferenceCommand.srv
│     │   │                                 dispatcher (Step 4-F).
│     │   │                                 + stop_training /
│     │   │                                 get_training_status.
│     │   └── cyclo_data_client.py         cyclo_data srv wrapper.
│     ├── device_manager/      Hardware health / heartbeat monitor.
│     └── file_browser/        BrowseFile.srv implementation.
│
├── training/                  Training container client-side.
│   └── zenoh_training_manager.py
│                              Client for the /<backend>/train srv
│                              on policy containers. Left in the
│                              orchestrator package for now.
│
├── timer/                     Shared TimerManager wrapper.
│
├── ui/                        React UI app (Step 1 port from
│                              physical_ai_manager). Built by the
│                              Dockerfile.{arm64,amd64} stage-1
│                              node:22 stage and copied into
│                              /usr/share/nginx/html.
│
└── scripts/                   Orchestrator-specific dev helpers.
    └── test_rosbridge_connection.py
                               Manual rosbridge smoke test.
                               (Data-side CLIs moved to cyclo_data
                               in Step 7.)
```

## Responsibilities — what stays here vs moves to cyclo_data

| Area | Owner | Why |
| --- | --- | --- |
| Session state (`on_recording`, `on_inference`, `operation_mode`, etc.) | orchestrator | central state the UI polls via `/task/status` |
| UI command routing (`/send_command`) | orchestrator | UI-side boundary — orchestrator translates to the appropriate downstream srv |
| Robot control plane publishers | orchestrator | synchronous `JointTrajectory` / `Twist` commands from tree nodes |
| Policy container lifecycle | orchestrator | `InferenceCommand` dispatch, client ownership |
| Behaviour tree catalog + execution | orchestrator | `bt_node` owns `/bt/nodes/catalog`, `/bt/load_and_run`, `/bt/set_running`, `/bt/status`, `/bt/active_nodes` |
| Recording / conversion / HF / editing | cyclo_data | data-plane workers (Step 3 atomic swaps) |
| Dataset visualisation | cyclo_data | `video_file_server`, replay handlers |

## Key srv / topic surface

| Direction | srv / topic | Notes |
| --- | --- | --- |
| UI → orchestrator | `SendCommand.srv` | START_RECORDING / START_INFERENCE / etc. — routed by `user_interaction_callback` to cyclo_data / policy containers |
| orchestrator → policy | `InferenceCommand.srv` | `ContainerServiceClient.inference_command(CMD_*, ...)` |
| orchestrator → cyclo_data | `RecordingCommand` / `StartConversion` / `HfOperation` / `EditDataset` | `CycloDataClient` wraps each |
| cyclo_data → orchestrator | `/data/status` topic | Relayed into `/task/status` for the UI |

## BT node lifecycle

`BehaviorTreeNode` (`bt/bt_node.py`) runs as the `bt_node` executable.
The normal bringup launch starts it so catalog and runtime services stay
available while BT Manager is open:
```
ros2 launch orchestrator orchestrator_bringup.launch.py
```

For isolated debugging, launch only the BT node with:
```
ros2 launch orchestrator bt_node.launch.py robot_type:=ffw_sg2_rev1
```

The tree XML is loaded from `share/orchestrator/bt/trees/<tree>.xml`;
params come from `share/orchestrator/bt/bringup/bt_node_params.yaml`.

BT Manager Start/Stop controls tree execution, not the `bt_node` process:

- **Start** serializes the current graph and calls `/bt/load_and_run`.
- **Stop** calls `/bt/set_running` with `false`.
- When a tree completes, `bt_node` remains alive so the catalog and refresh
  flow keep working.

## Custom BT nodes

User-defined nodes are plain Python files under
`orchestrator/orchestrator/bt/actions/` or
`orchestrator/orchestrator/bt/controls/`. The BT registry scans those
folders dynamically, so editing `actions/__init__.py` or `controls/__init__.py`
is not required for BT Manager discovery or XML execution. Those files are
only for package-level imports.

Start from the templates in `orchestrator/orchestrator/bt/templates/`
(installed to `share/orchestrator/bt/templates/`):

- `action_template.py` subclasses `BaseAction`, defines constructor kwargs,
  implements `tick()`, and resets local runtime state.
- `control_template.py` subclasses `BaseControl`, defines constructor kwargs,
  ticks children, reports active child IDs, and resets its child index.

Class names become XML tags. Constructor kwargs become BT Manager ports; type
hints and defaults become port types and default values. No `META`,
`NODE_TAG`, `PORT_METADATA`, or description block is required.

Simple nodes need only an `__init__()`, `tick()`, and optional `reset()`.
Use `from_xml_params(context, name, params)` only when a node needs runtime
dependencies from the loader, such as the ROS node, topic config, joint names,
or helper methods. Built-in examples include `Rotate`, `JointControl`, and
`SendCommand`.

After adding or deleting a node file, click **Refresh Nodes** in BT Manager.
If running from an installed package instead of a source-mounted workspace,
rebuild/restart first so the new file exists in the install space.

## BT Manager XML saving

BT Manager saves XML files through `cyclo_data`'s HTTP file server
(`/bt/save_tree`) into `orchestrator/orchestrator/bt/trees/`. A duplicate file
name is rejected by default to prevent accidental overwrite; the UI shows an
explicit **Overwrite** action only after the server reports a name conflict.

## Entry points

After `colcon build`:

- `orchestrator_node` — main orchestrator node (Step 5-B rename).
- `bt_node` — behaviour tree runner (Step 5-A).

Both dropped into `install/orchestrator/lib/orchestrator/`.
