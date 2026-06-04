#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


SDK_ROOT = Path(__file__).resolve().parents[1]
if str(SDK_ROOT) not in sys.path:
    sys.path.insert(0, str(SDK_ROOT))

from action_chunk_processing import ActionChunkProcessor  # noqa: E402


class ActionChunkProcessorTests(unittest.TestCase):
    def test_empty_buffer_does_not_repeat_last_action(self) -> None:
        processor = ActionChunkProcessor(
            inference_hz=1.0,
            control_hz=1.0,
            postprocess=False,
        )
        processor.push_actions(np.asarray([[1.0, 2.0]], dtype=np.float64))

        first = processor.pop_action()
        second = processor.pop_action()

        np.testing.assert_allclose(first, np.asarray([1.0, 2.0]))
        self.assertIsNone(second)


if __name__ == "__main__":
    unittest.main()
