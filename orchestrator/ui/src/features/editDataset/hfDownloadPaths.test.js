import { DEFAULT_PATHS } from '../../constants/paths';
import {
  getDefaultDownloadPath,
  isManagedDownloadPath,
} from './hfDownloadPaths';

describe('hfDownloadPaths', () => {
  test('routes model downloads to the workspace model root', () => {
    expect(getDefaultDownloadPath('model')).toBe(
      DEFAULT_PATHS.HF_MODEL_DOWNLOAD_PATH
    );
  });

  test('keeps dataset downloads under the workspace dataset root', () => {
    expect(getDefaultDownloadPath('dataset')).toBe(
      DEFAULT_PATHS.HF_DATASET_DOWNLOAD_PATH
    );
  });

  test('tracks all automatic download destinations but leaves custom paths alone', () => {
    expect(isManagedDownloadPath(DEFAULT_PATHS.HF_DATASET_DOWNLOAD_PATH)).toBe(true);
    expect(isManagedDownloadPath(DEFAULT_PATHS.HF_MODEL_DOWNLOAD_PATH)).toBe(true);
    expect(isManagedDownloadPath('/workspace/custom_models')).toBe(false);
  });
});
