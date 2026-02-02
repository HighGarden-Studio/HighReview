import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { getMaterialFileIcon } from './MaterialFileIcons';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface FileChangeStats {
  additions: number;
  deletions: number;
  status?: 'added' | 'modified' | 'removed' | 'renamed';
  commentCount?: number; // Number of PR comments on this file
}

interface FileTreeProps {
  nodes: FileNode[];
  onFileClick: (node: FileNode) => void;
  selectedPath?: string;
  changedFiles?: Set<string>;
  fileStats?: Map<string, FileChangeStats>;
  filterMode?: 'all' | 'changed';
  onFilterChange?: (mode: 'all' | 'changed') => void;
}

interface FileTreeNodeProps {
  node: FileNode;
  onFileClick: (node: FileNode) => void;
  selectedPath?: string;
  changedFiles?: Set<string>;
  fileStats?: Map<string, FileChangeStats>;
  filterMode?: 'all' | 'changed';
  depth: number;
}

// Get file icon using Material Icon Theme
function getFileIcon(filename: string) {
  return <span className="flex-shrink-0">{getMaterialFileIcon(filename, false, false)}</span>;
}

function FileTreeNode({ node, onFileClick, selectedPath, changedFiles, fileStats, filterMode, depth }: FileTreeNodeProps) {
  // Check if any child is changed (for directory highlighting)
  const hasChangedChildren = (n: FileNode): boolean => {
    if (n.type === 'file') {
      return changedFiles?.has(n.path) || false;
    }
    return n.children?.some(child => hasChangedChildren(child)) || false;
  };

  const hasChanges = node.type === 'directory' ? hasChangedChildren(node) : (changedFiles?.has(node.path) || false);

  // Auto-expand folders that contain changed files
  const [isExpanded, setIsExpanded] = useState(node.type === 'directory' && hasChanges);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Update isExpanded when changedFiles is loaded for the first time
  useEffect(() => {
    if (node.type === 'directory' && !hasInitialized && changedFiles && changedFiles.size > 0) {
      if (hasChanges) {
        setIsExpanded(true);
      }
      setHasInitialized(true);
    }
  }, [changedFiles, hasChanges, hasInitialized, node.type]);

  const isSelected = selectedPath === node.path;
  const isChanged = changedFiles?.has(node.path) || false;
  const stats = fileStats?.get(node.path);

  // Filter logic: hide if filterMode is 'changed' and no changes
  if (filterMode === 'changed' && !hasChanges) {
    return null;
  }

  const handleClick = () => {
    if (node.type === 'directory') {
      setIsExpanded(!isExpanded);
    } else {
      onFileClick(node);
    }
  };

  const paddingLeft = depth * 8;

  return (
    <div>
      <div
        onClick={handleClick}
        className={`group flex items-center gap-2 px-2 py-1 cursor-pointer transition-all duration-200 ease-out
          ${
            isSelected
              ? '-mx-2 bg-gradient-to-r from-blue-500/15 to-blue-600/10 dark:from-blue-500/20 dark:to-blue-600/15 text-blue-700 dark:text-blue-300 border-l-2 border-blue-500 dark:border-blue-400'
              : isChanged
              ? 'rounded-md bg-amber-50/50 dark:bg-amber-900/5 hover:bg-amber-100/70 dark:hover:bg-amber-900/15 border-l-2 border-transparent hover:border-amber-400/50'
              : 'rounded-md hover:bg-slate-100/60 dark:hover:bg-slate-800/60 border-l-2 border-transparent hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        style={{ paddingLeft: `${paddingLeft + 8}px` }}
      >
        {/* Expand/Collapse Chevron */}
        {node.type === 'directory' ? (
          <ChevronRight
            size={14}
            className={`flex-shrink-0 transition-all duration-200 ${isExpanded ? 'rotate-90' : ''} ${
              isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-400'
            }`}
          />
        ) : (
          <div className="w-3.5 flex-shrink-0" />
        )}

        {/* Folder or File Icon - Material Icon Theme */}
        {node.type === 'directory' ? (
          <span className="flex-shrink-0">
            {getMaterialFileIcon(node.name, true, isExpanded)}
          </span>
        ) : (
          getFileIcon(node.name)
        )}

        {/* Name */}
        <span
          className={`flex-1 text-sm whitespace-nowrap tracking-tight ${
            isSelected
              ? 'font-semibold text-blue-900 dark:text-blue-100'
              : isChanged
              ? 'font-medium text-amber-800 dark:text-amber-200'
              : 'text-slate-700 dark:text-slate-300 font-normal'
          }`}
        >
          {node.name}
        </span>

        {/* File status badge and change stats */}
        {isChanged && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Status badge (M/A/D/R) */}
            {stats?.status && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold leading-none ${
                stats.status === 'added' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                stats.status === 'removed' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                stats.status === 'renamed' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
              }`}>
                {stats.status === 'added' ? 'A' :
                 stats.status === 'removed' ? 'D' :
                 stats.status === 'renamed' ? 'R' :
                 'M'}
              </span>
            )}
            {/* Change stats */}
            {stats && (stats.additions > 0 || stats.deletions > 0) && (
              <div className="flex items-center gap-0.5 text-[10px] font-mono font-medium">
                {stats.additions > 0 && (
                  <span className="text-green-600 dark:text-green-400">+{stats.additions}</span>
                )}
                {stats.deletions > 0 && (
                  <span className="text-red-600 dark:text-red-400">-{stats.deletions}</span>
                )}
              </div>
            )}
            {/* Comment count */}
            {stats && typeof stats.commentCount === 'number' && stats.commentCount > 0 && (
              <div className="flex items-center gap-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                <span>💬</span>
                <span>{stats.commentCount}</span>
              </div>
            )}
            {/* Fallback badge if no stats */}
            {!stats && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-semibold leading-none">
                M
              </span>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {node.type === 'directory' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              onFileClick={onFileClick}
              selectedPath={selectedPath}
              changedFiles={changedFiles}
              fileStats={fileStats}
              filterMode={filterMode}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ nodes, onFileClick, selectedPath, changedFiles, fileStats, filterMode = 'all', onFilterChange }: FileTreeProps) {
  return (
    <div className="h-full flex flex-col bg-[#f3f3f3] dark:bg-[#252526] border-r border-[#e5e5e5] dark:border-[#333333]">
      {/* Header with filter - VS Code style */}
      <div className="px-3 py-2 border-b border-[#e5e5e5] dark:border-[#333333]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold text-[#6c757d] dark:text-[#8c8c8c] uppercase tracking-wider">
            Explorer
          </h3>
          {changedFiles && changedFiles.size > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#ffc107] text-black font-medium">
              {changedFiles.size}
            </span>
          )}
        </div>

        {/* Filter toggle - VS Code style */}
        {onFilterChange && changedFiles && changedFiles.size > 0 && (
          <div className="flex gap-1">
            <button
              onClick={() => onFilterChange('all')}
              className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                filterMode === 'all'
                  ? 'bg-[#e0e0e0] dark:bg-[#3a3a3d] text-[#424242] dark:text-[#cccccc]'
                  : 'text-[#6c757d] dark:text-[#8c8c8c] hover:bg-[#e8e8e8] dark:hover:bg-[#2d2d30]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => onFilterChange('changed')}
              className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                filterMode === 'changed'
                  ? 'bg-[#e0e0e0] dark:bg-[#3a3a3d] text-[#424242] dark:text-[#cccccc]'
                  : 'text-[#6c757d] dark:text-[#8c8c8c] hover:bg-[#e8e8e8] dark:hover:bg-[#2d2d30]'
              }`}
            >
              Changed
            </button>
          </div>
        )}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto px-2 py-1">
        {nodes.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            onFileClick={onFileClick}
            selectedPath={selectedPath}
            changedFiles={changedFiles}
            fileStats={fileStats}
            filterMode={filterMode}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}
