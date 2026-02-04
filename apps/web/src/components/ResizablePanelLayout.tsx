import { ReactNode } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';

interface ResizablePanelLayoutProps {
  fileTree: ReactNode;
  beforeCode: ReactNode;
  afterCode: ReactNode;
  infoPanel: ReactNode;
}

export function ResizablePanelLayout({
  fileTree,
  beforeCode,
  afterCode,
  infoPanel,
}: ResizablePanelLayoutProps) {
  return (
    <Group
      orientation="horizontal"
      key="split-view-layout"
      className="h-full"
    >
      {/* File Tree Panel */}
      <Panel
        defaultSize={20}
        minSize={15}
        maxSize={40}
        className="bg-light-surface-elevated dark:bg-dark-surface-elevated"
      >
        {fileTree}
      </Panel>

      <Separator className="w-1 bg-light-border dark:bg-dark-border hover:bg-light-accent-primary dark:hover:bg-dark-accent-primary transition-colors" />

      {/* Before Code Panel */}
      <Panel
        defaultSize={25}
        minSize={20}
        className="bg-light-surface dark:bg-dark-surface"
      >
        {beforeCode}
      </Panel>

      <Separator className="w-1 bg-light-border dark:border-dark-border hover:bg-light-accent-primary dark:hover:bg-dark-accent-primary transition-colors" />

      {/* After Code Panel */}
      <Panel
        defaultSize={25}
        minSize={20}
        className="bg-light-surface dark:bg-dark-surface"
      >
        {afterCode}
      </Panel>

      <Separator className="w-1 bg-light-border dark:border-dark-border hover:bg-light-accent-primary dark:hover:bg-dark-accent-primary transition-colors" />

      {/* Info Panel */}
      <Panel
        defaultSize={30}
        minSize={20}
        maxSize={50}
        className="bg-light-surface-elevated dark:bg-dark-surface-elevated"
      >
        {infoPanel}
      </Panel>
    </Group>
  );
}
