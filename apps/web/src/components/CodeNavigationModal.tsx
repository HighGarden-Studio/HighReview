interface CodeLocation {
  file: string;
  line: number;
  column: number;
  text: string;
}

interface CodeNavigationModalProps {
  title: string;
  locations: CodeLocation[];
  onLocationClick: (location: CodeLocation) => void;
  onClose: () => void;
}

export function CodeNavigationModal({
  title,
  locations,
  onLocationClick,
  onClose,
}: CodeNavigationModalProps) {
  // Group locations by file
  const locationsByFile = locations.reduce((acc, location) => {
    if (!acc[location.file]) {
      acc[location.file] = [];
    }
    acc[location.file].push(location);
    return acc;
  }, {} as Record<string, CodeLocation[]>);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-light-surface dark:bg-dark-surface rounded-lg shadow-2xl w-[800px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
          <div>
            <h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {title}
            </h2>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
              {locations.length} location{locations.length === 1 ? '' : 's'} found
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated
                     text-light-text-muted dark:text-dark-text-muted
                     hover:text-light-text-primary dark:hover:text-dark-text-primary
                     transition-colors"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {locations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <svg
                className="w-16 h-16 text-light-text-muted dark:text-dark-text-muted mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <p className="text-light-text-muted dark:text-dark-text-muted">No locations found</p>
            </div>
          ) : (
            <div className="divide-y divide-light-border dark:divide-dark-border">
              {Object.entries(locationsByFile).map(([file, fileLocations]) => (
                <div key={file} className="p-4">
                  {/* File Header */}
                  <div className="flex items-center gap-2 mb-3">
                    <svg
                      className="w-4 h-4 text-light-text-muted dark:text-dark-text-muted flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">
                      {file}
                    </span>
                    <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                      ({fileLocations.length} result{fileLocations.length === 1 ? '' : 's'})
                    </span>
                  </div>

                  {/* Locations for this file */}
                  <div className="space-y-2">
                    {fileLocations.map((location, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          onLocationClick(location);
                          onClose();
                        }}
                        className="w-full text-left p-3 rounded-md
                                 bg-light-surface-elevated dark:bg-dark-surface-elevated
                                 hover:bg-light-border dark:hover:bg-dark-border
                                 border border-transparent hover:border-light-accent-primary dark:hover:border-dark-accent-primary
                                 transition-all group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary">
                            {location.line}:{location.column}
                          </span>
                          <svg
                            className="w-4 h-4 text-light-text-muted dark:text-dark-text-muted
                                     group-hover:text-light-accent-primary dark:group-hover:text-dark-accent-primary
                                     transition-colors"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 7l5 5m0 0l-5 5m5-5H6"
                            />
                          </svg>
                        </div>
                        <code className="text-sm text-light-text-primary dark:text-dark-text-primary font-mono block truncate">
                          {location.text}
                        </code>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-light-border dark:border-dark-border">
          <div className="flex items-center gap-2 text-xs text-light-text-muted dark:text-dark-text-muted">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Click on a location to navigate to it in the editor</span>
          </div>
        </div>
      </div>
    </div>
  );
}
