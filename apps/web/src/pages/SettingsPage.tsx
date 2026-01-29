import { AIProviderSelector } from '../components/AIProviderSelector';

export function SettingsPage() {
  return (
    <div className="min-h-screen bg-light-background dark:bg-dark-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary">
            Settings
          </h1>
          <p className="text-light-text-secondary dark:text-dark-text-secondary mt-2">
            Configure your HighReview preferences
          </p>
        </div>

        {/* AI Provider Section */}
        <div className="mb-8">
          <AIProviderSelector
            onProviderSelected={(providerId) => {
              console.log('[Settings] Provider selected:', providerId);
            }}
          />
        </div>

        {/* Other Settings */}
        <div className="space-y-6">
          <div className="p-6 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border">
            <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
              Theme
            </h3>
            <select className="px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary">
              <option>System</option>
              <option>Light</option>
              <option>Dark</option>
            </select>
          </div>

          <div className="p-6 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border">
            <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
              Code Editor
            </h3>
            <div className="space-y-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded" defaultChecked />
                <span className="text-sm text-light-text-primary dark:text-dark-text-primary">
                  Enable minimap
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded" defaultChecked />
                <span className="text-sm text-light-text-primary dark:text-dark-text-primary">
                  Show line numbers
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded" defaultChecked />
                <span className="text-sm text-light-text-primary dark:text-dark-text-primary">
                  Enable code folding
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
