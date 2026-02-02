import { useState, useEffect } from 'react';

interface AIProvider {
  name: string;
  available: boolean;
  instructions: string;
  models?: string[];
}

interface AIProvidersResponse {
  providers: Record<string, AIProvider>;
  selected: string | null;
  selectedModel: string | null;
}

interface AIProviderSelectorProps {
  onProviderSelected?: (providerId: string) => void;
  compact?: boolean;
}

export function AIProviderSelector({ onProviderSelected, compact = false }: AIProviderSelectorProps) {
  const [providers, setProviders] = useState<Record<string, AIProvider>>({});
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/providers');
      if (!response.ok) {
        throw new Error(`Failed to load providers: ${response.statusText}`);
      }

      const data: AIProvidersResponse = await response.json();
      setProviders(data.providers);
      setSelectedProvider(data.selected);
      setSelectedModel(data.selectedModel);
    } catch (err: any) {
      console.error('[AIProviderSelector] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectProvider = async (providerId: string, model?: string) => {
    if (!providers[providerId]?.available) {
      alert(`${providers[providerId]?.name || providerId} is not installed.\n\n${providers[providerId]?.instructions}`);
      return;
    }

    setSaving(true);
    setError(null);

    const targetModel = model || (providerId === selectedProvider ? selectedModel : providers[providerId].models?.[0]);

    try {
      const response = await fetch('/api/ai/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: providerId,
          model: targetModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to set provider: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[AIProviderSelector] Provider set:', data);

      setSelectedProvider(providerId);
      setSelectedModel(targetModel || null);

      if (onProviderSelected) {
        onProviderSelected(providerId);
      }
    } catch (err: any) {
      console.error('[AIProviderSelector] Error:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
        <div className="w-4 h-4 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin"></div>
        Loading AI providers...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
        <p className="text-sm text-red-600 dark:text-red-400">Error: {error}</p>
        <button
          onClick={loadProviders}
          className="mt-2 text-sm text-red-600 dark:text-red-400 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const providerIds = Object.keys(providers);
  const availableCount = providerIds.filter(id => providers[id].available).length;

  if (compact) {
    // Compact view for navbar or settings
    return (
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary">
          AI Provider:
        </label>
        <select
          value={selectedProvider || ''}
          onChange={(e) => selectProvider(e.target.value)}
          disabled={saving}
          className="px-3 py-1.5 text-sm rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary disabled:opacity-50"
        >
          {providerIds.map(id => (
            <option key={id} value={id} disabled={!providers[id].available}>
              {providers[id].name} {!providers[id].available && '(Not installed)'}
            </option>
          ))}
        </select>
        
        {/* Model Selector for Compact View if Selected Provider has Models */}
        {selectedProvider && providers[selectedProvider]?.models && providers[selectedProvider].models!.length > 0 && (
          <select
            value={selectedModel || ''}
            onChange={(e) => selectProvider(selectedProvider, e.target.value)}
            disabled={saving}
            className="ml-2 px-3 py-1.5 text-sm rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary disabled:opacity-50"
          >
            {providers[selectedProvider].models!.map(model => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  }

  // Full card view
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary">
            AI Provider
          </h2>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
            Select your AI provider for code review and assistance
          </p>
        </div>
        <button
          onClick={loadProviders}
          disabled={loading}
          className="px-3 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary transition-colors disabled:opacity-50"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Status */}
      <div className="p-3 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border">
        <div className="flex items-center gap-2 text-sm">
          <div className={`w-2 h-2 rounded-full ${availableCount > 0 ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-light-text-primary dark:text-dark-text-primary font-medium">
            {availableCount} of {providerIds.length} providers available
          </span>
        </div>
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {providerIds.map(id => {
          const provider = providers[id];
          const isSelected = id === selectedProvider;

          return (
            <div
              key={id}
              className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-light-accent-primary dark:border-dark-accent-primary bg-light-accent-primary/5 dark:bg-dark-accent-primary/5'
                  : provider.available
                  ? 'border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface hover:border-light-accent-primary/50 dark:hover:border-dark-accent-primary/50'
                  : 'border-light-border dark:border-dark-border bg-light-surface/50 dark:bg-dark-surface/50 opacity-60'
              }`}
              onClick={() => !saving && selectProvider(id)}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-base font-semibold text-light-text-primary dark:text-dark-text-primary">
                  {provider.name}
                </h3>
                {isSelected && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-light-accent-primary dark:bg-dark-accent-primary text-white">
                    Active
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2 h-2 rounded-full ${provider.available ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className={`text-xs font-medium ${provider.available ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {provider.available ? 'Installed' : 'Not Installed'}
                </span>
              </div>

              {provider.models && provider.models.length > 0 && provider.available && (
                <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                  <label className="block text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium mb-1">
                    Model
                  </label>
                  <select
                    value={isSelected ? (selectedModel || '') : (provider.models[0] || '')}
                    onChange={(e) => isSelected && selectProvider(id, e.target.value)}
                    disabled={!isSelected || saving}
                    className="w-full px-2 py-1 text-xs rounded border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-1 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary disabled:opacity-50"
                  >
                    {provider.models.map(model => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!provider.available && (
                <div className="mt-3 p-2 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated">
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium mb-1">
                    Installation:
                  </p>
                  <code className="block text-xs text-light-text-primary dark:text-dark-text-primary font-mono whitespace-pre-wrap break-all">
                    {provider.instructions}
                  </code>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {saving && (
        <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
          <div className="w-4 h-4 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin"></div>
          Saving configuration...
        </div>
      )}
    </div>
  );
}
