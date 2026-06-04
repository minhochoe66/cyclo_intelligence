import { DEFAULT_PATHS } from '../../constants/paths';

const MANAGED_DOWNLOAD_PATHS = new Set([
  DEFAULT_PATHS.HF_MODEL_DOWNLOAD_PATH,
  DEFAULT_PATHS.HF_DATASET_DOWNLOAD_PATH,
]);

export const getDefaultDownloadPath = (downloadType) => {
  if (downloadType !== 'model') {
    return DEFAULT_PATHS.HF_DATASET_DOWNLOAD_PATH;
  }

  return DEFAULT_PATHS.HF_MODEL_DOWNLOAD_PATH;
};

export const isManagedDownloadPath = (path) =>
  MANAGED_DOWNLOAD_PATHS.has((path || '').replace(/\/$/, ''));
