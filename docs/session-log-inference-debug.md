# FFW-SG2 Gazebo + Cyclo Intelligence — Session Log & Handoff

Carry this into a new chat to pick up where this session left off. Machine:
`aicenter02-Dell-Pro-Max-16-Plus-MB16250`.

Status legend: ✅ confirmed working · ⚠️ carried over from old setup, not fully
re-verified · ❓ open question / unresolved · 🔴 currently blocking

---

## 1. Current status (as of end of this session)

- Gazebo + ai_worker: ✅ running, robot visible, all 3 fake camera topics publishing
- cyclo_intelligence container: ✅ running, UI reachable, robot type `ffw_sg2_rev1`
  connected
- Zenoh: ✅ working (same-wmachine shared-memory mode)
- Policy download: ✅ diffusion checkpoint downloaded and Policy Path resolved
- Inference: 🔴 **blocked** — `diffusers` package was missing in the `lerobot_server`
  container's actual runtime venv. Just reinstalled it in the *correct* location
  (see §5). **Not yet re-tested.**
- ⚠️ New observation, not yet investigated: last UI screenshot showed **Model
  dropdown = "ACT"** while **Policy Path** pointed at the *Diffusion* checkpoint
  (`/workspace/model/lerobot/diffusion_ffw_ltable_merge/models/diffusion_ffw_ltable_merge`).
  This mismatch may itself cause a failure or silently load the wrong policy head.
  **Check the Model dropdown is set to Diffusion before the next test.**

---

## 2. System map (confirmed facts)

Two independent repos/containers, both needed:

| Repo | Role | Status |
|---|---|---|
| `~/Desktop/Projects/P03_AI_Worker_Gazebo/ai_worker` | Gazebo simulation, robot description, Zenoh daemon runs here | Unchanged from original setup |
| `~/cyclo_intelligence` (i.e. `$HOME/cyclo_intelligence`) | Replaces `physical_ai_tools`. Orchestrator UI, data tools, policy containers (lerobot/groot) | New stack, docs at docs.robotis.com/docs/systems/aiworker/imitation_learning |

Containers seen running (`docker ps`):
- `ai_worker` — Gazebo/ROS2 side
- `cyclo_intelligence` — main UI/orchestrator container
- `lerobot_server` — policy backend, started on demand via `docker/container.sh start-lerobot` or UI's "LeRobot Docker: ON" toggle

Key paths inside `lerobot_server`:
- `/lerobot/.venv/` — **dedicated virtualenv the actual inference process runs
  under**. `python3`/`pip` on the container's default PATH do *not* point here by
  default in a plain `docker exec ... bash` shell — this caused the diffusers bug,
  see §5.
- `/workspace/model/lerobot/` — "user-visible" model dropbox, mounted from
  `./workspace` on host (relative to `cyclo_intelligence/docker/`). This is what
  the UI's Policy Path folder-browser reads from.
- `/root/.cache/huggingface/` — mounted from `./huggingface` on host. Raw HF
  cache/blob store, NOT the same as the model dropbox above. Don't rely on this
  for Policy Path — use `--local-dir` downloads into `/workspace/model/lerobot/`
  instead.

Web UI: `http://localhost:7080/` (not port 80 — that was an early wrong guess).

---

## 3. Full startup sequence (every session)

### Terminal 1 — Zenoh router (ai_worker container, leave running)
```bash
cd ~/Desktop/Projects/P03_AI_Worker_Gazebo/ai_worker/docker
./container.sh enter
ros2 run rmw_zenoh_cpp rmw_zenohd
```
Only one Zenoh daemon runs for the whole setup.

### Terminal 2 — Gazebo (ai_worker container, leave running)
```bash
cd ~/Desktop/Projects/P03_AI_Worker_Gazebo/ai_worker/docker
./container.sh enter
ros2 launch ffw_bringup ffw_sg2_follower_ai_gazebo.launch.py
```
Wait for the GUI to show the robot standing before proceeding.

### Terminal 3 — sanity check + cam_head fake publisher
```bash
cd ~/Desktop/Projects/P03_AI_Worker_Gazebo/ai_worker/docker
./container.sh enter
ros2 node list          # check no duplicates
python3 /workspace/fake_camera_publisher.py \
  --node-name fake_cam_head \
  --topic /zed/zed_node/left/image_rect_color/compressed
```
Still required — Gazebo has no real camera sensors, this is unrelated to
cyclo_intelligence and hasn't changed.

### Terminal 4 — wrist_left camera (leave running)
```bash
cd ~/Desktop/Projects/P03_AI_Worker_Gazebo/ai_worker/docker
./container.sh enter
python3 /workspace/fake_camera_publisher.py \
  --node-name fake_cam_wrist_left \
  --topic /camera_left/camera_left/color/image_rect_raw/compressed
```

### Terminal 5 — wrist_right camera (leave running)
```bash
cd ~/Desktop/Projects/P03_AI_Worker_Gazebo/ai_worker/docker
./container.sh enter
python3 /workspace/fake_camera_publisher.py \
  --node-name fake_cam_wrist_right \
  --topic /camera_right/camera_right/color/image_rect_raw/compressed
```

### Terminal 6 — verify all three cameras
```bash
cd ~/Desktop/Projects/P03_AI_Worker_Gazebo/ai_worker/docker
./container.sh enter
ros2 node list
```
Confirms `fake_cam_head`, `fake_cam_wrist_left`, `fake_cam_wrist_right` +
Gazebo/controller nodes, no duplicates.

### Terminal 7 — cyclo_intelligence
```bash
cd $HOME/cyclo_intelligence
./docker/container.sh start     # skip if already running
./docker/container.sh enter
```
One-time per container (persists in `~/.bashrc` inside container — check it's not
already there before appending again):
```bash
echo "export ZENOH_CONFIG_OVERRIDE='transport/shared_memory/enabled=true'" >> ~/.bashrc
source ~/.bashrc
```
Launch:
```bash
cyclo_intelligence
```

### Terminal 8 — lerobot policy backend
```bash
cd $HOME/cyclo_intelligence
docker/container.sh start-lerobot
docker ps | grep lerobot_server
```
(Can also be toggled from the UI's "LeRobot Docker" ON/OFF/Restart panel.)

### Open the UI
`http://localhost:7080/` → select **FFW-SG2** → confirm `Connected` → **Inference**
page.

---

## 4. Model / policy setup

Switched mid-session from the original ACT checkpoint to a Diffusion policy:

- **Old (original runbook):** `JSHNSL/act_ffw_ltable`, ACT, 19-dim state/action,
  `cam_head` only, trained @ 10 fps, chunk_size=100
- **Current:** `JSHNSL/humanoid-imitation-learning`, specifically the
  `models/diffusion_ffw_ltable_merge` checkpoint inside that repo

### How the model got downloaded (working method)
The UI's Policy Path field rejects full HF URLs — only accepts bare
`repo_name` or `namespace/repo_name`, no `/tree/main/...` suffix, no subpath in
that field directly. Downloaded manually via CLI instead:

```bash
docker exec -it lerobot_server bash
hf download JSHNSL/humanoid-imitation-learning \
  --include "models/diffusion_ffw_ltable_merge/*" \
  --local-dir /workspace/model/lerobot/diffusion_ffw_ltable_merge
```
(Note: `huggingface-cli` is deprecated in this container's `huggingface_hub`
version — use `hf` instead.)

Resulting path (confirmed via `find ... -name config.json`):
```
/workspace/model/lerobot/diffusion_ffw_ltable_merge/models/diffusion_ffw_ltable_merge
```
This is the exact folder entered into Policy Path (contains `config.json`,
`model.safetensors`).

**⚠️ Not yet verified:** the actual `fps`/`chunk_size` this diffusion checkpoint
was trained at. Inference Hz is currently set to `10` (leftover from the ACT
config) — should be checked against `train_config.json` in that same folder
before trusting inference output. Control Hz is `100`, unchanged.

---

## 5. Errors encountered this session, chronologically

### 5a. Policy Path rejected — wrong format ✅ resolved
**Error:** `Repo id must be in the form 'repo_name' or 'namespace/repo_name': '...'.
Use \`repo_type\` argument if needed.`
**Cause:** Pasted the full browser URL (`https://huggingface.co/.../tree/main/...`)
into Policy Path instead of a bare repo id.
**Fix:** Downloaded the checkpoint manually via CLI (see §4) and pointed Policy
Path at the resulting local folder instead of relying on the UI's own
download-by-repo-id mechanism.

### 5b. `huggingface-cli` deprecated ✅ resolved
**Error:** `huggingface-cli is deprecated and no longer works. Use hf instead.`
**Fix:** Use `hf download ...` — same flags, new command name.

### 5c. `'diffusers' is required but not installed` 🔴 fix applied, not yet re-tested
**Error (in UI):** `'diffusers' is required but not installed. Install it with:
pip install 'lerobot[diffusion]' (or uv pip install 'lerobot[diffusion]')`
**Cause:** Base `lerobot` install in the `lerobot_server` image doesn't include the
optional `diffusion` extra — ACT/other policy types don't need it, Diffusion does.
**First attempt (insufficient):** Ran `pip install 'lerobot[diffusion]'` in a plain
`docker exec -it lerobot_server bash` shell. Installed successfully, but error
persisted identically after container restart.
**Root cause found:** The container runs its actual inference process under a
dedicated venv at `/lerobot/.venv/`, **not** the default `python3`/`pip` on PATH
in a bare exec shell. Confirmed via:
```bash
docker exec -it lerobot_server python3 -c "import diffusers"   # → ModuleNotFoundError
which python3                                                   # → /lerobot/.venv/bin/python3 (once inside container as root)
find / -maxdepth 4 -iname "activate"                            # → /lerobot/.venv/bin/activate
```
Wait — actually `which python3` *did* resolve to the venv path even in the plain
exec shell, so the mismatch is subtler than "wrong PATH". The working theory is
that the very first `pip install` (the one run right after `docker exec -it
lerobot_server bash`, before any `source activate`) landed in a **different**
pip/python than the one actually importing at runtime — worth re-confirming this
distinction rather than assuming it's fully explained. **Correct fix applied:**
```bash
docker exec -it lerobot_server bash
source /lerobot/.venv/bin/activate
pip install 'lerobot[diffusion]'
# or equivalently, without activating:
/lerobot/.venv/bin/pip install 'lerobot[diffusion]'
```
Verify before moving on:
```bash
/lerobot/.venv/bin/python3 -c "import diffusers; print(diffusers.__version__)"
```
**This is where the session ended** — the venv-targeted install command was given
but its output was not yet pasted back for confirmation.

### 5d. Torch got swapped during the diffusers install ❓ open, needs check
**Observation:** `pip install 'lerobot[diffusion]'` uninstalled the container's
original `torch 2.6.0a0+df5bbc09d1.nv24.12` (an NVIDIA NGC-custom build tuned for
that image's CUDA/driver setup) and replaced it with generic PyPI
`torch-2.11.0` + `torchvision-0.26.0`, bundling its own CUDA 13 libraries.
**Risk:** if the container's actual GPU driver was set up around the CUDA
version the original NGC torch build expected, the new generic torch may not
correctly detect/use the GPU.
**Check needed (not yet run with the venv python specifically):**
```bash
docker exec -it lerobot_server /lerobot/.venv/bin/python3 -c \
  "import torch; print(torch.__version__, torch.cuda.is_available())"
```
Also saw a batch of unrelated dependency-conflict warnings during install
(`nvidia-modelopt`, `numba`, `nvidia-dali-cuda120`, `thinc`, `lightning-thunder`
all wanting `numpy<2`, now have `numpy 2.2.6`) — likely harmless/unrelated to the
LeRobot policy pipeline, but not confirmed.

---

## 6. Open items for the next session

1. **Run the venv-targeted diffusers install verification:**
   ```bash
   docker exec -it lerobot_server /lerobot/.venv/bin/python3 -c "import diffusers; print(diffusers.__version__)"
   ```
2. **Check GPU still works after the torch swap** (command above in §5d).
3. **Restart lerobot_server and retest inference:**
   ```bash
   docker restart lerobot_server
   ```
4. **Fix the Model dropdown / Policy Path mismatch** — UI showed "Model: ACT"
   while Policy Path pointed at a Diffusion checkpoint. Set Model to Diffusion
   before the next Start Inference attempt.
5. **Verify Inference Hz (currently 10)** against the diffusion checkpoint's own
   `train_config.json` in
   `/workspace/model/lerobot/diffusion_ffw_ltable_merge/models/diffusion_ffw_ltable_merge/`
   — this value was carried over from the old ACT setup and never re-checked
   against the new model.
6. **Durability of the diffusers fix:** the manual `pip install` inside the venv
   lives in the container's writable layer, so it survives `docker restart` but
   **not** a container recreate (`docker compose up --build`, or if
   `container.sh start-lerobot` ever recreates rather than starts). If Diffusion
   becomes the regular policy going forward, add the `[diffusion]` extra to
   `cyclo_brain/policy/lerobot/Dockerfile.${ARCH}` so it's baked in permanently.
7. **Never resolved from earlier in the project:** whether the old
   `follower_mobile:/odom` tensor-size bug (19 vs 22 dims) has an equivalent in
   cyclo_intelligence's robot config, since the config no longer lives at a
   colcon install path. Only relevant if a tensor-shape error shows up once
   inference actually runs — hasn't been hit yet in this session.

---

## 7. Reference — key commands

```bash
# Enter lerobot policy container
docker exec -it lerobot_server bash

# Use the container's actual runtime venv explicitly
/lerobot/.venv/bin/python3
/lerobot/.venv/bin/pip install <pkg>

# Restart just the policy container (keeps writable-layer changes like pip installs)
docker restart lerobot_server

# Download a specific HF subfolder straight to the model dropbox
hf download <namespace>/<repo> \
  --include "<subpath>/*" \
  --local-dir /workspace/model/lerobot/<local-name>

# Check container identity/age (recreated vs merely restarted)
docker inspect <container> --format '{{.Created}}'
docker inspect <container> --format '{{.State.StartedAt}}'
```
