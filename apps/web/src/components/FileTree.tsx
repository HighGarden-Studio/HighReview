import { useState, useEffect } from 'react';
import {
  FileCode2,
  FileJson,
  FileImage,
  FileText,
  File,
  Folder,
  FolderOpen,
  ChevronRight,
  Database,
  FileType,
  Braces,
  FileSpreadsheet,
  Archive,
  Settings,
  GitBranch,
  Layout,
  Palette,
  PackageOpen,
} from 'lucide-react';

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

// Get file icon based on extension with Lucide icons (VS Code style)
function getFileIcon(filename: string, isChanged: boolean) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const name = filename.toLowerCase();
  const iconSize = 16;
  const iconClass = 'flex-shrink-0';

  // Special file names
  if (name === 'package.json' || name === 'package-lock.json') {
    return <PackageOpen size={iconSize} className={`${iconClass} text-green-600 dark:text-green-400`} />;
  }
  if (name === 'tsconfig.json' || name === 'jsconfig.json') {
    return <Settings size={iconSize} className={`${iconClass} text-blue-600 dark:text-blue-400`} />;
  }
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) {
    return <Archive size={iconSize} className={`${iconClass} text-cyan-600 dark:text-cyan-400`} />;
  }
  if (name === '.gitignore' || name === '.gitattributes') {
    return <GitBranch size={iconSize} className={`${iconClass} text-orange-600 dark:text-orange-400`} />;
  }
  if (name === 'readme.md' || name === 'readme') {
    return <FileText size={iconSize} className={`${iconClass} text-blue-500 dark:text-blue-300`} />;
  }

  // Extension-based icons
  switch (ext) {
    // TypeScript / JavaScript
    case 'ts':
    case 'tsx':
      return <FileCode2 size={iconSize} className={`${iconClass} text-blue-600 dark:text-blue-400`} />;
    case 'js':
    case 'jsx':
    case 'mjs':
      return <FileCode2 size={iconSize} className={`${iconClass} text-yellow-500 dark:text-yellow-400`} />;

    // Styles
    case 'css':
      return <Palette size={iconSize} className={`${iconClass} text-blue-500 dark:text-blue-300`} />;
    case 'scss':
    case 'sass':
      return <Palette size={iconSize} className={`${iconClass} text-pink-500 dark:text-pink-400`} />;
    case 'less':
      return <Palette size={iconSize} className={`${iconClass} text-blue-400 dark:text-blue-300`} />;

    // Markup
    case 'html':
    case 'htm':
      return <Layout size={iconSize} className={`${iconClass} text-orange-600 dark:text-orange-400`} />;
    case 'xml':
      return <FileType size={iconSize} className={`${iconClass} text-orange-500 dark:text-orange-300`} />;

    // Markdown
    case 'md':
    case 'markdown':
      return <FileText size={iconSize} className={`${iconClass} text-gray-700 dark:text-gray-300`} />;

    // JSON / Config
    case 'json':
      return <FileJson size={iconSize} className={`${iconClass} text-yellow-600 dark:text-yellow-400`} />;
    case 'yaml':
    case 'yml':
      return <Braces size={iconSize} className={`${iconClass} text-red-600 dark:text-red-400`} />;
    case 'toml':
      return <Braces size={iconSize} className={`${iconClass} text-gray-600 dark:text-gray-400`} />;

    // Images
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'bmp':
    case 'ico':
      return <FileImage size={iconSize} className={`${iconClass} text-purple-500 dark:text-purple-400`} />;
    case 'svg':
      return <FileImage size={iconSize} className={`${iconClass} text-yellow-600 dark:text-yellow-400`} />;

    // Programming languages
    case 'py':
      return <FileCode2 size={iconSize} className={`${iconClass} text-blue-500 dark:text-blue-300`} />;
    case 'java':
      return <FileCode2 size={iconSize} className={`${iconClass} text-red-600 dark:text-red-400`} />;
    case 'go':
      return <FileCode2 size={iconSize} className={`${iconClass} text-cyan-500 dark:text-cyan-400`} />;
    case 'rs':
      return <FileCode2 size={iconSize} className={`${iconClass} text-orange-700 dark:text-orange-400`} />;
    case 'rb':
      return <FileCode2 size={iconSize} className={`${iconClass} text-red-700 dark:text-red-400`} />;
    case 'php':
      return <FileCode2 size={iconSize} className={`${iconClass} text-indigo-600 dark:text-indigo-400`} />;
    case 'c':
    case 'h':
      return <FileCode2 size={iconSize} className={`${iconClass} text-blue-700 dark:text-blue-400`} />;
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
      return <FileCode2 size={iconSize} className={`${iconClass} text-blue-600 dark:text-blue-300`} />;
    case 'sh':
    case 'bash':
    case 'zsh':
      return <FileCode2 size={iconSize} className={`${iconClass} text-green-700 dark:text-green-400`} />;

    // Text files
    case 'txt':
    case 'log':
      return <FileText size={iconSize} className={`${iconClass} text-gray-500 dark:text-gray-400`} />;

    // Database
    case 'sql':
    case 'db':
    case 'sqlite':
      return <Database size={iconSize} className={`${iconClass} text-blue-700 dark:text-blue-400`} />;

    // Spreadsheet
    case 'csv':
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet size={iconSize} className={`${iconClass} text-green-600 dark:text-green-400`} />;

    // Archives
    case 'zip':
    case 'rar':
    case 'tar':
    case 'gz':
    case '7z':
      return <Archive size={iconSize} className={`${iconClass} text-yellow-700 dark:text-yellow-500`} />;

    // Default file icon
    default:
      if (isChanged) {
        return <File size={iconSize} className={`${iconClass} text-amber-500 dark:text-amber-400`} />;
      }
      return <File size={iconSize} className={`${iconClass} text-gray-500 dark:text-gray-400`} />;
  }
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

  const paddingLeft = depth * 12;

  return (
    <div>
      <div
        onClick={handleClick}
        className={`group flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-all rounded-md mx-1
          ${
            isSelected
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
              : isChanged
              ? 'bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        style={{ paddingLeft: `${paddingLeft + 8}px` }}
      >
        {/* Expand/Collapse Chevron */}
        {node.type === 'directory' ? (
          <ChevronRight
            size={16}
            className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''} ${
              isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          />
        ) : (
          <div className="w-4 flex-shrink-0" />
        )}

        {/* Folder or File Icon */}
        {node.type === 'directory' ? (
          isExpanded ? (
            <FolderOpen
              size={16}
              className={`flex-shrink-0 ${
                hasChanges
                  ? 'text-amber-500 dark:text-amber-400'
                  : 'text-blue-500 dark:text-blue-400'
              }`}
            />
          ) : (
            <Folder
              size={16}
              className={`flex-shrink-0 ${
                hasChanges
                  ? 'text-amber-500 dark:text-amber-400'
                  : 'text-blue-500 dark:text-blue-400'
              }`}
            />
          )
        ) : (
          getFileIcon(node.name, isChanged)
        )}

        {/* Name */}
        <span
          className={`flex-1 text-sm truncate min-w-0 ${
            isSelected
              ? 'font-medium'
              : isChanged
              ? 'font-medium text-amber-700 dark:text-amber-300'
              : 'text-slate-700 dark:text-slate-300'
          }`}
        >
          {node.name}
        </span>

        {/* File status badge and change stats */}
        {isChanged && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Status badge (M/A/D/R) */}
            {stats?.status && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
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
              <div className="flex items-center gap-1 text-xs font-mono">
                {stats.additions > 0 && (
                  <span className="text-green-600 dark:text-green-400">+{stats.additions}</span>
                )}
                {stats.deletions > 0 && (
                  <span className="text-red-600 dark:text-red-400">-{stats.deletions}</span>
                )}
              </div>
            )}
            {/* Fallback badge if no stats */}
            {!stats && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
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
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700">
      {/* Header with filter */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Files
          </h3>
          {changedFiles && changedFiles.size > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
              {changedFiles.size} changed
            </span>
          )}
        </div>

        {/* Filter toggle */}
        {onFilterChange && changedFiles && changedFiles.size > 0 && (
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => onFilterChange('all')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                filterMode === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              All Files
            </button>
            <button
              onClick={() => onFilterChange('changed')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                filterMode === 'changed'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Changed Only
            </button>
          </div>
        )}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-2">
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
