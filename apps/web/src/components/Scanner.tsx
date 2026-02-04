

interface ScannerProps {
  label?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * A premium scanner-style loading animation
 */
export function Scanner({ label, className = '', size = 'lg' }: ScannerProps) {
  // Size mappings
  const sizeClasses = {
    sm: {
      container: 'w-12 h-12',
      glow: 'blur-lg',
      content: 'inset-2', 
      icon: 'w-5 h-5',
      textSize: 'text-sm',
      dots: 'w-0.5 h-0.5'
    },
    md: {
      container: 'w-16 h-16',
      glow: 'blur-xl',
      content: 'inset-3',
      icon: 'w-6 h-6',
      textSize: 'text-base',
      dots: 'w-1 h-1'
    },
    lg: {
      container: 'w-20 h-20',
      glow: 'blur-2xl',
      content: 'inset-4',
      icon: 'w-8 h-8',
      textSize: 'text-lg',
      dots: 'w-1 h-1'
    }
  };

  const s = sizeClasses[size];

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className={`relative ${s.container} flex items-center justify-center mb-6`}>
        {/* Background Glow */}
        <div className={`absolute inset-0 rounded-full bg-light-accent-primary/20 dark:bg-dark-accent-primary/30 ${s.glow} animate-pulse`} />
        
        {/* Outer Scanner Ring */}
        <div className="absolute inset-0 rounded-full border border-light-accent-primary/20 dark:border-dark-accent-primary/20" />
        
        {/* Main Spinning Light Ring */}
        <div className="absolute inset-0 rounded-full border-t-2 border-light-accent-primary dark:border-dark-accent-primary animate-slow-spin shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
        
        {/* Inner Counter-Spinning Ring */}
        <div className="absolute inset-3 rounded-full border-b-2 border-light-accent-secondary/40 dark:border-dark-accent-secondary/40 animate-reverse-spin" />
        
        {/* Scanner Content Area */}
        <div className={`absolute ${s.content} rounded-full bg-light-surface-elevated/50 dark:bg-dark-surface-elevated/50 backdrop-blur-sm flex items-center justify-center overflow-hidden border border-light-border dark:border-dark-border`}>
          {/* Moving Scanner Vertical Bar */}
          <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-light-accent-primary dark:via-dark-accent-primary to-transparent animate-scanner shadow-[0_0_8px_rgba(59,130,246,0.8)] z-10" />
          
          <svg className={`${s.icon} text-light-accent-primary/80 dark:text-dark-accent-primary/80`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
      </div>
      
      {label && (
        <div className="flex flex-col items-center space-y-1">
          <p className={`text-light-text-primary dark:text-dark-text-primary font-bold ${s.textSize} tracking-tight animate-pulse`}>
            {label}
          </p>
          <div className="flex gap-1">
             <span className={`${s.dots} rounded-full bg-light-accent-primary dark:bg-dark-accent-primary animate-bounce [animation-delay:-0.3s]`}></span>
             <span className={`${s.dots} rounded-full bg-light-accent-primary dark:bg-dark-accent-primary animate-bounce [animation-delay:-0.15s]`}></span>
             <span className={`${s.dots} rounded-full bg-light-accent-primary dark:bg-dark-accent-primary animate-bounce`}></span>
          </div>
        </div>
      )}
    </div>
  );
}
