import { CollapseAll16, Launch16 } from '@carbon/icons-react';
import { InlineLoading, SkeletonText } from 'carbon-components-react';
import TreeView, { TreeNode, TreeNodeProps } from 'carbon-components-react/lib/components/TreeView';
import cx from 'classnames';
import { Stack } from 'office-ui-fabric-react';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { DriveIcon } from '../components';
import { getConfig } from '../config';
import { useFolderFilesMeta } from '../hooks/useFolderFilesMeta';
import { selectHeaders, selectDriveFile } from '../reduxSlices/doc';
import {
  selectError,
  selectLoading,
  selectMapIdToChildren,
  selectMapIdToFile,
} from '../reduxSlices/files';
import {
  activate,
  expand,
  collapse,
  selectActiveId,
  selectExpanded,
  selectSelected,
  selectShowFiles,
  setShowFiles,
  unsetShowFiles,
} from '../reduxSlices/siderTree';
import {
  DriveFile,
  fileIsFolderOrFolderShortcut,
  MarkdownLink,
  mdLink,
  MimeTypes,
  parseFolderChildrenDisplaySettings,
} from '../utils';
import { DocHeader, TreeHeading, isTreeHeading } from '../utils/docHeaders';
import styles from './Sider.module.scss';
import { HeaderExtraActionsForMobile } from '.';

function renderChildren(
  activeId: string,
  mapIdToFile: Record<string, DriveFile>,
  mapIdToChildren: Record<string, DriveFile[]>,
  onFolderShowFiles: (file: DriveFile) => void,
  showFiles: Record<string, boolean>,
  parentId?: string,
  expanded?: ReadonlySet<string>,
  handleToggle?: (
    event: any,
    node: {
      id: string;
      isExpanded: boolean;
    }
  ) => void
) {
  if (!parentId) {
    return null;
  }

  let files = mapIdToChildren[parentId];
  if (!mapIdToChildren[parentId]) {
    return null;
  }
  if (mapIdToFile[parentId]) {
    const childrenDisplaySettings = parseFolderChildrenDisplaySettings(mapIdToFile[parentId]);
    if (!childrenDisplaySettings.displayInSidebar) {
      files = [];
    }
  }

  const filesFolder: DriveFile[] = files.filter((file) => {
    return file.mimeType === MimeTypes.GoogleFolder;
  });
  let filesNotFolder: DriveFile[] = [];
  if (showFiles[parentId]) {
    filesNotFolder = files.filter((file) => {
      return file.mimeType !== MimeTypes.GoogleFolder;
    });
  }

  const folderViews = filesFolder.map((file: DriveFile) => {
    const childrenNode = renderChildren(
      activeId,
      mapIdToFile,
      mapIdToChildren,
      onFolderShowFiles,
      showFiles,
      file.id,
      expanded,
      handleToggle
    );

    const isExpanded = expanded?.has(file.id ?? '');
    /* It would be nice to have ... for a leaf node
       to show its files.
       The problem is that to actually show the files
       that requires making it a tree node with a triangle
       which is a confusing UX
    const leafFolder =
      expanded?.has(parentId) &&
      !!file.id && (mapIdToChildren[file.id] ?? []).filter((file) => {
        return file.mimeType === MimeTypes.GoogleFolder;
      }).length === 0;
      */
    let label: React.ReactNode = nodeLabel(file, isExpanded, onFolderShowFiles);

    if ((childrenNode?.length ?? 0) > 0) {
      const nodeProps: TreeNodeProps = {
        isExpanded: isExpanded,
        onToggle: handleToggle,
        label,
        value: file.id!,
        onSelect: () => {
          if (file.id === activeId) {
            onFolderShowFiles(file);
          } else {
            selectFile(file)();
          }
        },
      };
      return (
        <TreeNode key={file.id} id={file.id} {...nodeProps}>
          {childrenNode}
        </TreeNode>
      );
    } else {
      const nodeProps: TreeNodeProps = {
        isExpanded: false,
        label,
        value: file.id!,
        onSelect: selectFile(file),
      };
      return <TreeNode key={file.id} id={file.id} {...nodeProps} />;
    }
  });

  const fileViews = filesNotFolder.map((file: DriveFile) => {
    let label: React.ReactNode = nodeLabel(file);
    const nodeProps: TreeNodeProps = {
      isExpanded: false,
      label,
      value: file.id!,
      onSelect: selectFile(file),
    };
    return <TreeNode key={file.id} id={file.id} {...nodeProps} />;
  });

  return folderViews.concat(fileViews);
}

function nodeLabel(
  file: DriveFile,
  isExpanded?: boolean,
  onFolderShowFiles?: (file: DriveFile) => void
): React.ReactNode {
  let isChildrenHidden = false;
  const childrenDisplaySettings = parseFolderChildrenDisplaySettings(file);
  if (!childrenDisplaySettings.displayInSidebar && file.mimeType === MimeTypes.GoogleFolder) {
    isChildrenHidden = true;
  }

  let itemType: 'hidden_folder' | 'folder' | 'link' | 'file';
  let parsedLink: MarkdownLink | null = null;
  if (fileIsFolderOrFolderShortcut(file)) {
    if (isChildrenHidden) {
      itemType = 'hidden_folder';
    } else {
      itemType = 'folder';
    }
  } else {
    parsedLink = mdLink.parse(file.name);
    if (parsedLink) {
      itemType = 'link';
    } else {
      itemType = 'file';
    }
  }

  let label: JSX.Element | null = null;
  switch (itemType) {
    case 'folder':
      label = (
        <a
          href={`/view/${file.id}`}
          style={{ textDecoration: 'none', color: 'black' }}
          onClick={(ev) => {
            ev.preventDefault();
          }}
        >
          {file.name}
        </a>
      );
      if (isExpanded) {
        label = <ExpandedFolder file={file} label={label} onFolderShowFiles={onFolderShowFiles} />;
      }
      break;
    case 'hidden_folder':
      label = (
        <Stack verticalAlign="center" horizontal tokens={{ childrenGap: 8 }}>
          <CollapseAll16 />
          <span>{file.name}</span>
        </Stack>
      );
      break;
    case 'link':
      label = (
        <Stack
          verticalAlign="center"
          horizontal
          tokens={{ childrenGap: 8 }}
          style={{ cursor: 'pointer' }}
        >
          <Launch16 />
          <span>{parsedLink!.title}</span>
        </Stack>
      );
      break;
    case 'file':
      label = (
        <Stack verticalAlign="center" horizontal tokens={{ childrenGap: 8 }}>
          <DriveIcon file={file} />
          <span>{file.name}</span>
        </Stack>
      );
      break;
  }

  return label;
}

function ExpandedFolder(props: {
  onFolderShowFiles?: (file: DriveFile) => void;
  label: JSX.Element;
  file: DriveFile;
}) {
  const { onFolderShowFiles, label, file } = props;
  const filesMeta = useFolderFilesMeta(file.id);
  const nonFolderCount = useMemo(() => {
    return (filesMeta.files ?? []).filter((file) => file.mimeType !== MimeTypes.GoogleFolder)
      .length;
  }, [filesMeta]);

  return nonFolderCount === 0 ? (
    label
  ) : (
    <>
      <a
        style={{ cursor: 'pointer' }}
        onClick={(ev) => {
          ev.stopPropagation();
          onFolderShowFiles?.(file);
        }}
      >
        ...
      </a>
      &nbsp;
      {label}
    </>
  );
}

function selectFile(file: gapi.client.drive.File) {
  return () => {
    mdLink.handleFileLinkClick(file);
  };
}

function Sider_({ isExpanded = true }: { isExpanded?: boolean }) {
  const dispatch = useDispatch();

  const loading = useSelector(selectLoading);
  const error = useSelector(selectError);
  const mapIdToFile = useSelector(selectMapIdToFile);
  const mapIdToChildren = useSelector(selectMapIdToChildren);
  const expanded = useSelector(selectExpanded);
  const selected = useSelector(selectSelected);
  const headers = useSelector(selectHeaders);
  const file = useSelector(selectDriveFile);
  const showFiles = useSelector(selectShowFiles);

  const id = useSelector(selectActiveId) ?? getConfig().REACT_APP_ROOT_ID;

  const handleToggle = useCallback(
    (ev: React.MouseEvent, node: TreeNodeProps) => {
      // handleToggle is called before onSelect
      // This will stop the event from getting to onSelect
      ev.stopPropagation();
      if (node.isExpanded) {
        dispatch(expand({ arg: [node.id ?? ''], mapIdToFile }));
      } else {
        dispatch(collapse([node.id ?? '']));
      }
    },
    [dispatch, mapIdToFile]
  );

  useEffect(() => {
    if (mapIdToFile[id]) {
      dispatch(activate({ arg: id, mapIdToFile: mapIdToFile }));
    }
  }, [id, mapIdToFile, dispatch]);

  function entryNode(heading: DocHeader): JSX.Element {
    const label = <a href={'#' + heading.id}>{heading.text}</a>;
    return <TreeNode key={heading.id} id={'tree-' + heading.id} label={label} />;
  }

  function treeNode(heading: DocHeader, inner) {
    const label = <a href={'#' + heading.id}>{heading.text}</a>;
    return (
      <TreeNode key={heading.id} id={'tree-' + heading.id} isExpanded={true} label={label}>
        {inner}
      </TreeNode>
    );
  }

  function toTreeElements(node: TreeHeading | DocHeader): JSX.Element {
    return isTreeHeading(node) ? treeNode(node, node.entries.map(toTreeElements)) : entryNode(node);
  }
  const headerTreeNodes = (headers ?? []).slice().map(toTreeElements);

  function onFolderShowFiles(file: DriveFile) {
    if (showFiles[file.id!]) {
      dispatch(unsetShowFiles(file.id!));
    } else {
      dispatch(setShowFiles(file.id!));
    }
  }

  return (
    <div className={cx(styles.sider, { [styles.isExpanded]: isExpanded })}>
      <HeaderExtraActionsForMobile />
      {loading && (
        <div className={styles.skeleton}>
          <SkeletonText paragraph />
        </div>
      )}
      {!loading && error && (
        <div className={styles.skeleton}>
          <InlineLoading description={`Error: ${error.message}`} status="error" />
        </div>
      )}
      {!loading && !error && (
        <TreeView label="Table of Contents" selected={selected} active={id} id={'tree-toc'}>
          {renderChildren(
            id,
            mapIdToFile,
            mapIdToChildren,
            onFolderShowFiles,
            showFiles,
            getConfig().REACT_APP_ROOT_ID,
            expanded,
            handleToggle
          )}
        </TreeView>
      )}
      {headerTreeNodes.length > 0 && (
        <div style={{ marginTop: '30px' }}>
          <Stack
            style={{ display: 'flex', justifyContent: 'center' }}
            verticalAlign="center"
            horizontal
          >
            <p>{file?.name}</p>
          </Stack>
          <TreeView
            label="Document Headers"
            selected={[headerTreeNodes[0].key?.toString() ?? 0]}
            id="tree-document-headers"
          >
            {headerTreeNodes}
          </TreeView>
        </div>
      )}
    </div>
  );
}

export const Sider = React.memo(Sider_);

function Content_({
  isExpanded = true,
  children,
}: {
  isExpanded?: boolean;
  children?: React.ReactNode;
}) {
  return <div className={cx(styles.content, { [styles.isExpanded]: isExpanded })}>{children}</div>;
}

export const Content = React.memo(Content_);
