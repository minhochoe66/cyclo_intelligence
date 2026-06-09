// Copyright 2026 ROBOTIS CO., LTD.
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
// Author: Seongwoo Kim

import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import {
  catalogFetchFailed,
  catalogFetchStarted,
  catalogFetchSucceeded,
} from '../features/btmanager/btCatalogSlice';
import { useRosServiceCaller } from './useRosServiceCaller';

const API_BASE = '/api';
const BT_NODE_START_TIMEOUT_MS = 8000;
const BT_NODE_POLL_INTERVAL_MS = 500;

// Fire-once-per-app guard. The slice's `source` field also tracks this,
// but if a component mounts → fetch starts → component unmounts before
// the response arrives, `source` stays at 'loading' and the next mount
// would re-fetch. The module-level ref keeps a single in-flight fetch
// per page load — good enough for PR1.
let fetchStarted = false;

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getBtNodeStatus() {
  const response = await fetch(`${API_BASE}/services/bt_node/status`);
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.detail || `bt_node status failed (${response.status})`);
  }
  return data;
}

async function startBtNode() {
  const response = await fetch(`${API_BASE}/services/bt_node/start`, {
    method: 'POST',
  });
  const data = await readJsonResponse(response);
  if (!response.ok || data.ok === false) {
    throw new Error(data.detail || data.message || 'bt_node start failed');
  }
}

async function ensureBtNodeRunning() {
  let status;
  try {
    status = await getBtNodeStatus();
  } catch {
    // Supervisor API may be unavailable in test/dev setups. Let the ROS
    // service call below decide whether the catalog can be fetched.
    return;
  }

  if (status.state === 'up') return;

  await startBtNode();
  const deadline = Date.now() + BT_NODE_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(BT_NODE_POLL_INTERVAL_MS);
    status = await getBtNodeStatus();
    if (status.state === 'up') return;
  }

  throw new Error('bt_node did not become ready in time');
}

/**
 * Subscribe to the BT node catalog Redux slice and lazy-fetch it from
 * `/bt/nodes/catalog` on first mount. Returns the same shape every time:
 *
 *   { catalog: META[], source: 'fallback'|'loading'|'ros', schemaVersion, error }
 *
 * Components can read `catalog` directly without waiting — the slice is
 * seeded with the static fallback so the palette renders immediately.
 */
export function useBTNodeCatalog() {
  const dispatch = useDispatch();
  const slice = useSelector((state) => state.btCatalog);
  const { getNodeCatalog } = useRosServiceCaller();

  const refreshCatalog = useCallback(async ({ force = false } = {}) => {
    if (fetchStarted && !force) return;
    fetchStarted = true;

    dispatch(catalogFetchStarted());
    try {
      await ensureBtNodeRunning();
      const result = await getNodeCatalog();
      if (!result || !result.success) {
        const msg = (result && result.message) || 'Service returned failure';
        fetchStarted = false;
        dispatch(catalogFetchFailed(msg));
        return;
      }
      let parsed = [];
      try {
        parsed = JSON.parse(result.catalog_json || '[]');
      } catch (e) {
        fetchStarted = false;
        dispatch(catalogFetchFailed(`Invalid catalog JSON: ${e.message}`));
        return;
      }
      if (!Array.isArray(parsed)) {
        fetchStarted = false;
        dispatch(catalogFetchFailed('Catalog JSON is not an array'));
        return;
      }
      dispatch(catalogFetchSucceeded({
        catalog: parsed,
        schemaVersion: result.schema_version || '',
      }));
    } catch (err) {
      try {
        await startBtNode();
        await sleep(BT_NODE_POLL_INTERVAL_MS);
        const result = await getNodeCatalog();
        if (result && result.success) {
          const parsed = JSON.parse(result.catalog_json || '[]');
          if (!Array.isArray(parsed)) {
            throw new Error('Catalog JSON is not an array');
          }
          dispatch(catalogFetchSucceeded({
            catalog: parsed,
            schemaVersion: result.schema_version || '',
          }));
          return;
        }
        throw new Error((result && result.message) || 'Service returned failure');
      } catch (retryErr) {
        // Reset the guard so a later reconnect can try again.
        fetchStarted = false;
        dispatch(catalogFetchFailed(retryErr.message || err.message || String(err)));
      }
    }
  }, [dispatch, getNodeCatalog]);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  return { ...slice, refreshCatalog };
}
