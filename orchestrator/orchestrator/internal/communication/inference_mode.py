#!/usr/bin/env python3
#
# Copyright 2026 ROBOTIS CO., LTD.
#
# Licensed under the Apache License, Version 2.0

"""Inference output-mode helpers shared by UI and BT command dispatch."""

from __future__ import annotations


SIMULATION_MODE = "simulation"
ROBOT_MODE = "robot"


def normalize_inference_mode(value) -> str:
    mode = str(value or "").strip().lower()
    if mode in {ROBOT_MODE, "robot_mode", "publish", "publish_to_robot"}:
        return ROBOT_MODE
    return SIMULATION_MODE


def publish_to_robot_from_task_info(task_info) -> bool:
    """Return true only when a command explicitly asks for robot publish."""
    mode = getattr(task_info, "inference_mode", "")
    if mode:
        return normalize_inference_mode(mode) == ROBOT_MODE

    tags = getattr(task_info, "tags", []) or []
    for tag in tags:
        normalized = str(tag or "").strip().lower()
        if normalized in {"inference_mode:robot", "publish_to_robot:true"}:
            return True
        if normalized in {"inference_mode:simulation", "publish_to_robot:false"}:
            return False

    return bool(getattr(task_info, "publish_to_robot", False))
