import { useCallback, useEffect, useRef, useState } from "react";
import { getCameraPreviewUrl } from "../services/cameraApi";

/**
 * Shared short-lived MJPEG preview-token lifecycle. Surveillance cards and
 * camera-backed editors use this one path so neither can expose or reimplement
 * the underlying RTSP stream.
 */
export default function useCameraPreviewUrl(cameraCode, enabled = true) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [retry, setRetry] = useState(0);
  const imageRetryTimer = useRef(null);

  useEffect(() => {
    if (imageRetryTimer.current) clearTimeout(imageRetryTimer.current);
    imageRetryTimer.current = null;
    setPreviewUrl(null);
    setRetry(0);
  }, [cameraCode, enabled]);

  useEffect(
    () => () => {
      if (imageRetryTimer.current) clearTimeout(imageRetryTimer.current);
    },
    []
  );

  useEffect(() => {
    let active = true;
    let retryTimer = null;
    setPreviewUrl(null);
    if (!enabled || !cameraCode) return undefined;

    const retryDelay = Math.min(1000 * (retry + 1), 5000);

    getCameraPreviewUrl(cameraCode)
      .then((url) => {
        if (!active) return;
        if (url) {
          setPreviewUrl(url);
          return;
        }
        retryTimer = setTimeout(() => setRetry((n) => n + 1), retryDelay);
      })
      .catch(() => {
        if (!active) return;
        setPreviewUrl(null);
        retryTimer = setTimeout(() => setRetry((n) => n + 1), retryDelay);
      });

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [cameraCode, enabled, retry]);

  const reportImageError = useCallback(() => {
    setPreviewUrl(null);
    if (imageRetryTimer.current) clearTimeout(imageRetryTimer.current);
    const delay = Math.min(1000 * (retry + 1), 5000);
    imageRetryTimer.current = setTimeout(() => {
      imageRetryTimer.current = null;
      setRetry((n) => n + 1);
    }, delay);
  }, [retry]);

  const retryNow = useCallback(() => {
    if (imageRetryTimer.current) clearTimeout(imageRetryTimer.current);
    imageRetryTimer.current = null;
    setPreviewUrl(null);
    setRetry((n) => n + 1);
  }, []);

  return {
    previewUrl,
    reportImageError,
    retryNow,
    exhausted: enabled && retry >= 3,
  };
}
