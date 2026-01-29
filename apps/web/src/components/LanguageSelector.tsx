import { useState } from 'react';
import { useLanguage, languageNames } from '../contexts/LanguageContext';

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 rounded-lg font-medium bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors border border-light-border dark:border-dark-border text-sm flex items-center gap-2"
        title="Language / 언어"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
        </svg>
        {languageNames[language]}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-40 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-xl z-20 py-1">
            {(Object.entries(languageNames) as [keyof typeof languageNames, string][]).map(([lang, name]) => (
              <button
                key={lang}
                onClick={() => {
                  setLanguage(lang);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  language === lang
                    ? 'bg-light-accent-primary dark:bg-dark-accent-primary text-white'
                    : 'text-light-text-primary dark:text-dark-text-primary hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
