from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_main_dockerfiles_install_compose_v2():
    for dockerfile in (
        REPO_ROOT / "docker" / "Dockerfile.arm64",
        REPO_ROOT / "docker" / "Dockerfile.amd64",
    ):
        contents = dockerfile.read_text()

        assert "docker-compose-v2" in contents, (
            f"{dockerfile.name} must install docker-compose-v2 so "
            "supervisor_api can recreate policy containers with docker compose"
        )


def test_main_compose_mounts_shared_s6_runner():
    contents = (REPO_ROOT / "docker" / "docker-compose.yml").read_text()

    assert (
        "./s6-services/common/ros2_service_run.sh:"
        "/usr/local/lib/s6-services/ros2_service_run.sh:ro"
    ) in contents


def test_interactive_bashrc_includes_simple_ros_zenoh_block():
    dockerfiles = (
        REPO_ROOT / "docker" / "Dockerfile.arm64",
        REPO_ROOT / "docker" / "Dockerfile.amd64",
        REPO_ROOT / "cyclo_brain" / "policy" / "lerobot" / "Dockerfile.arm64",
        REPO_ROOT / "cyclo_brain" / "policy" / "lerobot" / "Dockerfile.amd64",
        REPO_ROOT / "cyclo_brain" / "policy" / "groot" / "Dockerfile.arm64",
        REPO_ROOT / "cyclo_brain" / "policy" / "groot" / "Dockerfile.amd64",
    )
    required = (
        "export ROS_DOMAIN_ID=30",
        "export RMW_IMPLEMENTATION=rmw_zenoh_cpp",
        "export ZENOH_CONFIG_OVERRIDE='transport/shared_memory/enabled=true'",
        "# export ZENOH_CONFIG_OVERRIDE='transport/shared_memory/enabled=true;mode=\\\"client\\\";connect/endpoints=[\\\"tcp/192.168.60.139:7447\\\"]'",
    )
    removed = (
        "export ZENOH_ROUTER_IP=${ZENOH_ROUTER_IP:-127.0.0.1}",
        "export ZENOH_ROUTER_PORT=${ZENOH_ROUTER_PORT:-7447}",
        "if [ \"${ZENOH_ROUTER_IP}\" = \"127.0.0.1\" ]",
        "export ZENOH_TRANSPORT_SHM_ENABLED=${ZENOH_TRANSPORT_SHM_ENABLED:-true}",
        "export ZENOH_SHM_ENABLED=${ZENOH_SHM_ENABLED:-true}",
    )

    for dockerfile in dockerfiles:
        contents = dockerfile.read_text()
        for expected in required:
            assert expected in contents, f"{dockerfile} is missing {expected}"
        for unexpected in removed:
            assert unexpected not in contents, f"{dockerfile} still has {unexpected}"


def test_dockerfiles_prepend_ros_zenoh_block_before_existing_bashrc():
    dockerfiles = (
        REPO_ROOT / "docker" / "Dockerfile.arm64",
        REPO_ROOT / "docker" / "Dockerfile.amd64",
        REPO_ROOT / "cyclo_brain" / "policy" / "lerobot" / "Dockerfile.arm64",
        REPO_ROOT / "cyclo_brain" / "policy" / "lerobot" / "Dockerfile.amd64",
        REPO_ROOT / "cyclo_brain" / "policy" / "groot" / "Dockerfile.arm64",
        REPO_ROOT / "cyclo_brain" / "policy" / "groot" / "Dockerfile.amd64",
    )

    for dockerfile in dockerfiles:
        contents = dockerfile.read_text()
        write_block_index = contents.index("> /tmp/cyclo_bashrc")
        existing_bashrc_index = contents.index("cat /root/.bashrc >> /tmp/cyclo_bashrc")
        assert write_block_index < existing_bashrc_index, (
            f"{dockerfile} must write Cyclo env before appending the base bashrc"
        )


def test_ros_zenoh_runtime_env_file_is_not_referenced_by_images_or_s6():
    paths = (
        REPO_ROOT / "docker" / "Dockerfile.arm64",
        REPO_ROOT / "docker" / "Dockerfile.amd64",
        REPO_ROOT / "cyclo_brain" / "policy" / "lerobot" / "Dockerfile.arm64",
        REPO_ROOT / "cyclo_brain" / "policy" / "lerobot" / "Dockerfile.amd64",
        REPO_ROOT / "cyclo_brain" / "policy" / "groot" / "Dockerfile.arm64",
        REPO_ROOT / "cyclo_brain" / "policy" / "groot" / "Dockerfile.amd64",
        REPO_ROOT / "docker" / "s6-services" / "common" / "ros2_service_run.sh",
        REPO_ROOT / "cyclo_brain" / "policy" / "common" / "s6-services" / "main-runtime" / "run",
        REPO_ROOT / "cyclo_brain" / "policy" / "common" / "s6-services" / "engine-process" / "run",
        REPO_ROOT / "cyclo_brain" / "policy" / "groot" / "s6-services" / "main-runtime" / "run",
        REPO_ROOT / "cyclo_brain" / "policy" / "groot" / "s6-services" / "engine-process" / "run",
    )

    for path in paths:
        contents = path.read_text()
        assert "CYCLO_ROS_ENV_FILE" not in contents, f"{path} references the old env file hook"
        assert "ros_zenoh.env" not in contents, f"{path} references the old runtime env file"


def test_s6_services_source_root_bashrc():
    paths = (
        REPO_ROOT / "docker" / "s6-services" / "common" / "ros2_service_run.sh",
        REPO_ROOT / "cyclo_brain" / "policy" / "common" / "s6-services" / "main-runtime" / "run",
        REPO_ROOT / "cyclo_brain" / "policy" / "common" / "s6-services" / "engine-process" / "run",
        REPO_ROOT / "cyclo_brain" / "policy" / "groot" / "s6-services" / "main-runtime" / "run",
        REPO_ROOT / "cyclo_brain" / "policy" / "groot" / "s6-services" / "engine-process" / "run",
    )

    for path in paths:
        contents = path.read_text()
        assert "source /root/.bashrc" in contents, f"{path} does not source /root/.bashrc"
        assert "export ROS_DOMAIN_ID=${ROS_DOMAIN_ID:-30}" in contents
        assert (
            "export ZENOH_CONFIG_OVERRIDE=${ZENOH_CONFIG_OVERRIDE:-transport/shared_memory/enabled=true}"
            in contents
        )
        assert "export ZENOH_ROUTER_IP=${ZENOH_ROUTER_IP:-127.0.0.1}" not in contents


def test_compose_does_not_override_ros_zenoh_runtime_env():
    contents = (REPO_ROOT / "docker" / "docker-compose.yml").read_text()

    removed_entries = (
        "ROS_DOMAIN_ID=${ROS_DOMAIN_ID:-30}",
        "RMW_IMPLEMENTATION=rmw_zenoh_cpp",
        "CYCLO_ROS_ENV_FILE=",
        "ZENOH_ROUTER_IP=127.0.0.1",
        "ZENOH_ROUTER_PORT=7447",
        "ZENOH_CONFIG_OVERRIDE=transport/shared_memory/enabled=true",
        "ZENOH_TRANSPORT_SHM_ENABLED=true",
        "ZENOH_SHM_ENABLED=true",
    )
    for entry in removed_entries:
        assert entry not in contents


def test_policy_compose_keeps_image_defaults_in_images():
    compose = (REPO_ROOT / "docker" / "docker-compose.yml").read_text()
    duplicated_entries = (
        "ZENOH_SDK_PATH=/zenoh_sdk",
        "ROBOT_CLIENT_SDK_PATH=/robot_client_sdk",
        "ACTION_CHUNK_PROCESSING_SDK_PATH=/action_chunk_processing_sdk",
        "POLICY_BACKEND=lerobot",
        "POLICY_ENGINE_MODULE=lerobot_engine",
        "POLICY_BACKEND=groot",
        "POLICY_ENGINE_MODULE=groot_engine",
        "GROOT_TRT_ENABLED=false",
        "CONTROL_HZ=100",
        "INFERENCE_HZ=15",
        "TARGET_CHUNK_SIZE=none",
        "REFILL_MARGIN_S=0.2",
        "REFILL_LATENCY_WARMUP_SAMPLES=1",
        "REFILL_LATENCY_SAMPLE_MAX_S=2.0",
        "HF_HOME=/root/.cache/huggingface",
        "HUGGINGFACE_HUB_CACHE=/root/.cache/huggingface/hub",
        "TRANSFORMERS_CACHE=/root/.cache/huggingface/hub",
    )
    for entry in duplicated_entries:
        assert entry not in compose

    policy_dockerfiles = (
        REPO_ROOT / "cyclo_brain" / "policy" / "lerobot" / "Dockerfile.arm64",
        REPO_ROOT / "cyclo_brain" / "policy" / "lerobot" / "Dockerfile.amd64",
        REPO_ROOT / "cyclo_brain" / "policy" / "groot" / "Dockerfile.arm64",
        REPO_ROOT / "cyclo_brain" / "policy" / "groot" / "Dockerfile.amd64",
    )
    for dockerfile in policy_dockerfiles:
        contents = dockerfile.read_text()
        assert "ENV ZENOH_SDK_PATH=/zenoh_sdk" in contents
        assert "ENV ROBOT_CLIENT_SDK_PATH=/robot_client_sdk" in contents
        assert "ENV ACTION_CHUNK_PROCESSING_SDK_PATH=/action_chunk_processing_sdk" in contents
