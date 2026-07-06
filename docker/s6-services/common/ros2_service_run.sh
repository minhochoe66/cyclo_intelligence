#!/bin/bash
# Reusable ROS2 service run script template.
# Launches a ROS2 command for any s6 longrun service defined under
# /etc/s6-overlay/s6-rc.d/<name>/run.
#
# Usage (from the service's run script):
#     exec /command/with-contenv env \
#         SERVICE_NAME=<name> \
#         ROS2_COMMAND="ros2 launch <pkg> <file>.launch.py" \
#         bash /usr/local/lib/s6-services/ros2_service_run.sh
#
# If ROS2_COMMAND is not set, defaults to:
#     ros2 launch orchestrator ${SERVICE_NAME}.launch.py

set -e

SERVICE_NAME="${SERVICE_NAME}"
if [ -z "${SERVICE_NAME}" ]; then
    echo "Error: SERVICE_NAME environment variable must be set" >&2
    exit 1
fi

# Shared runtime ROS/Zenoh env. Users edit /root/.bashrc, then restart the
# container or this s6 service. The image writes Cyclo's env block at the top
# of /root/.bashrc; PS1 is set as a fallback for bashrc files guarded by PS1.
if [ -f /root/.bashrc ]; then
    echo "[${SERVICE_NAME}] Loading ROS/Zenoh env from /root/.bashrc"
    _cyclo_saved_ps1="${PS1-}"
    _cyclo_saved_ifs="${IFS}"
    _cyclo_saved_opts="$(set +o)"
    PS1="${PS1:-cyclo-s6}"
    set +e
    # shellcheck source=/root/.bashrc
    source /root/.bashrc
    _cyclo_bashrc_rc=$?
    eval "${_cyclo_saved_opts}"
    IFS="${_cyclo_saved_ifs}"
    if [ -n "${_cyclo_saved_ps1+x}" ]; then
        PS1="${_cyclo_saved_ps1}"
    else
        unset PS1
    fi
    unset _cyclo_saved_ps1 _cyclo_saved_ifs _cyclo_saved_opts
    if [ "${_cyclo_bashrc_rc}" -ne 0 ]; then
        echo "[${SERVICE_NAME}] Warning: /root/.bashrc returned ${_cyclo_bashrc_rc}; applying built-in defaults for missing values"
    fi
    unset _cyclo_bashrc_rc
else
    echo "[${SERVICE_NAME}] /root/.bashrc not found; using built-in defaults"
fi

# Default ROS env (override via shared/container environment).
export ROS_DOMAIN_ID=${ROS_DOMAIN_ID:-30}
export RMW_IMPLEMENTATION=${RMW_IMPLEMENTATION:-rmw_zenoh_cpp}
export ZENOH_CONFIG_OVERRIDE=${ZENOH_CONFIG_OVERRIDE:-transport/shared_memory/enabled=true}
export ZENOH_SHM_ENABLED=${ZENOH_SHM_ENABLED:-true}
export ZENOH_TRANSPORT_SHM_ENABLED=${ZENOH_TRANSPORT_SHM_ENABLED:-true}
export ROS_DISTRO=${ROS_DISTRO:-jazzy}
export COLCON_WS=${COLCON_WS:-/root/ros2_ws}
export VENV_PATH=${VENV_PATH:-/opt/venv}
export ROS_ROOT=${ROS_ROOT:-/opt/ros}
export PYTHON_SITE_PACKAGES=${PYTHON_SITE_PACKAGES:-${VENV_PATH}/lib/python3.12/site-packages}
export PATH=${VENV_PATH}/bin:${PATH}
export PYTHONPATH=${PYTHON_SITE_PACKAGES}:${PYTHONPATH}

# s6-overlay debug logging
export S6_VERBOSITY=${S6_VERBOSITY:-1}

echo "[${SERVICE_NAME}] Starting service..."
echo "[${SERVICE_NAME}] ROS_DOMAIN_ID=${ROS_DOMAIN_ID}"
echo "[${SERVICE_NAME}] ROS_DISTRO=${ROS_DISTRO}"
echo "[${SERVICE_NAME}] RMW_IMPLEMENTATION=${RMW_IMPLEMENTATION}"
echo "[${SERVICE_NAME}] ZENOH_CONFIG_OVERRIDE=${ZENOH_CONFIG_OVERRIDE}"
echo "[${SERVICE_NAME}] COLCON_WS=${COLCON_WS}"
echo "[${SERVICE_NAME}] PID: $$"

# Record process group id so the finish script can target the whole group.
PGID=$(ps -o pgid= -p $$ | tr -d ' ')
echo "[${SERVICE_NAME}] Process group: ${PGID}"
echo "${PGID}" > /run/${SERVICE_NAME}.pgid || true

# Source ROS2 environment
source ${ROS_ROOT}/${ROS_DISTRO}/setup.bash
source ${COLCON_WS}/install/setup.bash

# Determine the command to execute
if [ -n "${ROS2_COMMAND}" ]; then
    ROS2_CMD="${ROS2_COMMAND}"
    echo "[${SERVICE_NAME}] Executing custom command: ${ROS2_CMD}"
else
    ROS2_CMD="ros2 launch orchestrator ${SERVICE_NAME}.launch.py"
    echo "[${SERVICE_NAME}] Executing default command: ${ROS2_CMD}"
fi

# Execute the ROS2 command. 'exec' ensures the command becomes PID 1 of
# this service so s6 can signal it and its children. stdout/stderr are
# piped to the matching <name>-log consumer via producer-for/consumer-for.
# /root/.bashrc has already been sourced above; keep the command shell
# non-interactive so the bashrc block is not applied twice.
exec bash -c "${ROS2_CMD}"
