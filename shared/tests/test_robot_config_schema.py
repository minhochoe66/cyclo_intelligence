from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "shared"))

from shared.robot_configs import schema as robot_schema  # noqa: E402


def test_sh5_config_records_raw_tactile_topics():
    section = robot_schema.load_robot_section("ffw_sh5_rev1")

    tactile_topics = robot_schema.get_tactile_topics(section)
    assert tactile_topics == {
        "left_hand_pressure": {
            "topic": "/left_hand/finger_pressures",
            "msg_type": "robotis_interfaces/msg/HandPressures",
        },
        "right_hand_pressure": {
            "topic": "/right_hand/finger_pressures",
            "msg_type": "robotis_interfaces/msg/HandPressures",
        },
    }

    mcap_topics = robot_schema.get_mcap_record_topics(section)
    assert "/left_hand/finger_pressures" in mcap_topics
    assert "/right_hand/finger_pressures" in mcap_topics
    assert "/zed/zed_node/left/image_rect_color/compressed" not in mcap_topics
    assert "/zed/zed_node/right/image_rect_color/compressed" not in mcap_topics
    assert "/zed/zed_node/left/camera_info" not in mcap_topics
    assert "/zed/zed_node/right/camera_info" not in mcap_topics


def test_sh5_state_and_action_dimensions_match_layout():
    section = robot_schema.load_robot_section("ffw_sh5_rev1")

    state_dim = sum(
        len(cfg["joint_names"])
        for cfg in robot_schema.get_state_groups(section).values()
    )
    action_dim = sum(
        len(cfg["joint_names"])
        for cfg in robot_schema.get_action_groups(section).values()
    )

    assert state_dim == 60
    assert action_dim == 60


def test_tactile_is_optional_for_existing_sg2_config():
    section = robot_schema.load_robot_section("ffw_sg2_rev1")

    assert robot_schema.get_tactile_topics(section) == {}
    assert "/left_hand/finger_pressures" not in robot_schema.get_mcap_record_topics(section)
    assert "/right_hand/finger_pressures" not in robot_schema.get_mcap_record_topics(section)
