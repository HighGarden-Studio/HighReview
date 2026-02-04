import { useEffect, RefObject } from 'react';

interface UseFileIntersectionOptions {
  threshold?: number;
  debounceMs?: number;
}

export function useFileIntersection(
  fileRefs: Map<string, RefObject<HTMLElement>>,
  onFileInView: (filename: string) => void,
  options: UseFileIntersectionOptions = {}
) {
  const { threshold = 0.3, debounceMs = 150 } = options;

  useEffect(() => {
    let debounceTimeout: any;
    let lastInViewFile: string | null = null;

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      // Find the entry with the largest intersection ratio
      let maxRatio = 0;
      let topFile: string | null = null;

      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
          maxRatio = entry.intersectionRatio;
          const filename = entry.target.getAttribute('data-filename');
          if (filename) {
            topFile = filename;
          }
        }
      });

      // Debounce the callback to avoid rapid firing
      if (topFile && topFile !== lastInViewFile) {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          if (topFile) {
            lastInViewFile = topFile;
            onFileInView(topFile);
          }
        }, debounceMs);
      }
    };

    const observer = new IntersectionObserver(observerCallback, {
      root: null,
      rootMargin: '0px',
      threshold: [0, threshold, 0.5, 1.0],
    });

    // Observe all file elements
    fileRefs.forEach((ref, filename) => {
      if (ref.current) {
        ref.current.setAttribute('data-filename', filename);
        observer.observe(ref.current);
      }
    });

    return () => {
      clearTimeout(debounceTimeout);
      observer.disconnect();
    };
  }, [fileRefs, onFileInView, threshold, debounceMs]);
}
