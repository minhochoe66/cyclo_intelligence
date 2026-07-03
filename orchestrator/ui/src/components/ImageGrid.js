// Copyright 2025 ROBOTIS CO., LTD.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Kiwoong Park

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSelector, useDispatch, useStore } from 'react-redux';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useRosServiceCaller } from '../hooks/useRosServiceCaller';
import ImageGridCell from './ImageGridCell';
import ImageTopicSelectModal from './ImageTopicSelectModal';
import { setImageTopicList, setAssignedImageTopics } from '../features/ros/rosSlice';

// [left(idx 0), center(idx 1), right(idx 2)]
// rotate: true = wrist camera (landscape stream displayed as portrait)
const DEFAULT_LAYOUT = [
  { aspect: '3/4', rotate: true },
  { aspect: '16/9', rotate: false },
  { aspect: '3/4', rotate: true },
];

const emptyAssignment = () => Array(DEFAULT_LAYOUT.length).fill(null);

const normalizeAssignment = (topics) => {
  const normalized = emptyAssignment();
  if (!Array.isArray(topics)) return normalized;
  for (let i = 0; i < Math.min(topics.length, normalized.length); i += 1) {
    normalized[i] = topics[i] || null;
  }
  return normalized;
};

const hasAssignedTopic = (topics) => (
  Array.isArray(topics) && topics.some((topic) => Boolean(topic))
);

const assignTopicsToLayout = (imageTopics) => {
  const assigned = emptyAssignment();
  const assignmentOrder = [1, 0, 2];
  const topics = (Array.isArray(imageTopics) ? imageTopics : []).filter(Boolean);
  for (let i = 0; i < Math.min(topics.length, assignmentOrder.length); i += 1) {
    assigned[assignmentOrder[i]] = topics[i];
  }
  return assigned;
};

const savedTopicsMatchAvailableTopics = (savedTopics, imageTopics) => {
  const available = new Set((Array.isArray(imageTopics) ? imageTopics : []).filter(Boolean));
  return normalizeAssignment(savedTopics)
    .filter(Boolean)
    .every((topic) => available.has(topic));
};

const getSavedAssignmentForRobot = (state, robotType) => {
  const normalizedRobotType = String(robotType || '').trim();
  if (!normalizedRobotType) return null;
  const savedRobotType = String(state.ros.assignedImageTopicsRobotType || '').trim();
  if (savedRobotType !== normalizedRobotType) return null;
  const saved = normalizeAssignment(state.ros.assignedImageTopics);
  return hasAssignedTopic(saved) ? saved : null;
};

export default function ImageGrid({ isActive = true }) {
  const dispatch = useDispatch();
  const store = useStore();
  const imageTopicList = useSelector((state) => state.ros.imageTopicList);
  const robotType = useSelector((state) => state.tasks.robotType);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [selectedIdx, setSelectedIdx] = React.useState(null);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [topicListError, setTopicListError] = useState(null);
  // Mount-time initial value: prefer whatever this component last persisted
  // for the same robot type (so Record↔Inference page transitions remember
  // the user's selection), otherwise start empty until /image/get_available_list
  // returns the selected robot's YAML-backed observation.images. We
  // deliberately read via store.getState() instead of useSelector so the
  // component does NOT subscribe to this slice — the only writer is this
  // component itself, and round-tripping our own dispatch back into local
  // state used to ping-pong with the persist effect below (React error #185,
  // blank screen on page transition).
  const [asignedImageTopicList, setAsignedImageTopicList] = useState(() => {
    const saved = getSavedAssignmentForRobot(store.getState(), robotType);
    return saved || emptyAssignment();
  });
  // Per-cell rotation override: 0 = landscape, -90 = portrait; undefined = use layout default
  const [rotationOverrides, setRotationOverrides] = useState({});

  const { getImageTopicList } = useRosServiceCaller();

  const layout = DEFAULT_LAYOUT;

  const rotationDegrees = useMemo(
    () => layout.map((cell, idx) => rotationOverrides[idx] ?? (cell.rotate ? -90 : 0)),
    [layout, rotationOverrides]
  );

  const handleRotateClick = useCallback((idx) => {
    setRotationOverrides((prev) => ({
      ...prev,
      [idx]: rotationDegrees[idx] === -90 ? 0 : -90,
    }));
  }, [rotationDegrees]);

  const applyImageTopicsFromConfig = useCallback((imageTopics, { force = false } = {}) => {
    const nextAssignment = assignTopicsToLayout(imageTopics);
    if (!hasAssignedTopic(nextAssignment)) return;
    const saved = getSavedAssignmentForRobot(store.getState(), robotType);
    if (
      !force &&
      saved &&
      savedTopicsMatchAvailableTopics(saved, imageTopics)
    ) {
      return;
    }
    console.log(`Applied camera topics for ${robotType || 'current robot'}:`, nextAssignment);
    setAsignedImageTopicList(nextAssignment);
  }, [robotType, store]);

  useEffect(() => {
    const saved = getSavedAssignmentForRobot(store.getState(), robotType);
    setAsignedImageTopicList(saved || emptyAssignment());
    setRotationOverrides({});
  }, [robotType, store]);

  // Sync list length when layout length changes (extend or trim)
  useEffect(() => {
    setAsignedImageTopicList((prev) => {
      const L = layout.length;
      if (prev.length === L) return prev;
      if (prev.length < L) return [...prev, ...Array(L - prev.length).fill(null)];
      return prev.slice(0, L);
    });
  }, [layout]);

  // Persist topic assignment to Redux so it survives remounts (page swap).
  // Compare against the latest store value via getState() so we never
  // re-trigger this effect from our own dispatch.
  useEffect(() => {
    if (asignedImageTopicList.length === 0) return;
    const current = store.getState().ros.assignedImageTopics;
    const currentRobotType = store.getState().ros.assignedImageTopicsRobotType || '';
    const normalizedRobotType = String(robotType || '').trim();
    const same =
      Array.isArray(current) &&
      current.length === asignedImageTopicList.length &&
      asignedImageTopicList.every((t, i) => t === current[i]);
    if (!same || currentRobotType !== normalizedRobotType) {
      dispatch(setAssignedImageTopics({
        robotType: normalizedRobotType,
        topics: asignedImageTopicList,
      }));
    }
  }, [asignedImageTopicList, dispatch, robotType, store]);

  useEffect(() => {
    const fetchTopicList = async () => {
      setIsLoadingTopics(true);
      setTopicListError(null);
      try {
        const result = await getImageTopicList();
        if (result && result.success) {
          const imageTopics = result.image_topic_list || [];
          dispatch(setImageTopicList(imageTopics));
          applyImageTopicsFromConfig(imageTopics);
          setTopicListError(null);
          toast.success(`Loaded ${imageTopics.length} image topics`);
        } else {
          const errorMsg = result?.message || 'Unknown error occurred';
          setTopicListError(`Service error: ${errorMsg}`);
          dispatch(setImageTopicList([]));
          toast.error(`Failed to load image topics: ${errorMsg}`);
        }
      } catch (error) {
        setTopicListError('Failed to load image topic list');
        dispatch(setImageTopicList([]));
        toast.error('Failed to load image topic list');
      } finally {
        setIsLoadingTopics(false);
      }
    };

    fetchTopicList();
  }, [getImageTopicList, applyImageTopicsFromConfig, dispatch]);

  const handlePlusClick = (idx) => {
    setSelectedIdx(idx);
    setModalOpen(true);
  };

  const handleRefreshTopics = async () => {
    setIsLoadingTopics(true);
    setTopicListError(null);
    try {
      const result = await getImageTopicList();
      if (result && result.success) {
        const imageTopics = result.image_topic_list || [];
        dispatch(setImageTopicList(imageTopics));
        applyImageTopicsFromConfig(imageTopics, { force: true });
        setTopicListError(null);
        toast.success(`Refreshed: ${imageTopics.length} image topics`);
      } else {
        const errorMsg = result?.message || 'Unknown error occurred';
        setTopicListError(`Service error: ${errorMsg}`);
        dispatch(setImageTopicList([]));
        toast.error(`Failed to refresh topics: ${errorMsg}`);
      }
    } catch (error) {
      setTopicListError('Failed to load image topic list');
      dispatch(setImageTopicList([]));
      toast.error('Failed to refresh image topics');
    } finally {
      setIsLoadingTopics(false);
    }
  };

  const handleTopicSelect = (topic) => {
    setAsignedImageTopicList(asignedImageTopicList.map((t, i) => (i === selectedIdx ? topic : t)));
    setModalOpen(false);
    setSelectedIdx(null);
  };

  const handleCellClose = (idx) => {
    setAsignedImageTopicList(asignedImageTopicList.map((t, i) => (i === idx ? null : t)));
  };

  const classImageGridArea = clsx(
    'flex', 'flex-row', 'justify-center', 'items-center',
    'gap-[0.5vw]', 'w-full', 'h-full', 'max-w-full', 'max-h-full', 'overflow-hidden'
  );

  const classImageGridCell = (idx) =>
    clsx('min-w-0', 'min-h-0', 'flex', 'items-center', 'justify-center', 'relative', {
      'flex-[7_1_0]': idx === 1,
      'flex-[3_1_0]': idx !== 1,
    });

  const classTopicLabel = clsx(
    'absolute', 'bottom-2', 'left-2', 'text-xs', 'text-white',
    'bg-black', 'bg-opacity-50', 'px-2', 'py-1', 'rounded', 'z-10'
  );

  return (
    <div className="w-full h-full overflow-hidden">
      <div className={classImageGridArea}>
        {layout.map((cell, idx) => (
          <div key={idx} className={classImageGridCell(idx)} data-cell-idx={idx}>
            <ImageGridCell
              topic={asignedImageTopicList[idx]}
              aspect={cell.aspect}
              rotationDegrees={rotationDegrees[idx]}
              onRotateClick={handleRotateClick}
              idx={idx}
              onClose={handleCellClose}
              onPlusClick={handlePlusClick}
              isActive={isActive}
            />
            <div className={classTopicLabel}>{asignedImageTopicList[idx] || ''}</div>
          </div>
        ))}
        {modalOpen && (
          <ImageTopicSelectModal
            topicList={imageTopicList}
            onSelect={handleTopicSelect}
            onClose={() => setModalOpen(false)}
            isLoading={isLoadingTopics}
            onRefresh={handleRefreshTopics}
            errorMessage={topicListError}
          />
        )}
      </div>
    </div>
  );
}
