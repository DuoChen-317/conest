import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUp,
  CaretRight,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  Info,
  LockSimple,
  MagnifyingGlass,
  SidebarSimple,
  X,
} from "@phosphor-icons/react";
import {
  buildFileIndex,
  fileName,
  parentDirectory,
  resolveDirectory,
  searchDirectory,
  type FileDirectory,
  type ProjectFile,
} from "./file-browser";
import { tr, useLocale } from "./i18n";

export default function FilesBrowser({
  files,
  directory,
  navigate,
  openFile,
}: {
  files: ProjectFile[];
  directory: string;
  navigate: (path: string) => void;
  openFile: (file: ProjectFile) => void;
}) {
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const folderNavId = useId();
  const [foldersOpen, setFoldersOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("conest.files.folders-open");
      if (saved === "true" || saved === "false") return saved === "true";
    } catch {
      /* Folder browsing remains available without browser storage. */
    }
    return !window.matchMedia("(max-width: 760px)").matches;
  });
  useEffect(() => {
    try {
      localStorage.setItem("conest.files.folders-open", String(foldersOpen));
    } catch {
      /* Keep the current preference for this visit. */
    }
  }, [foldersOpen]);
  const locationRef = useRef<HTMLButtonElement>(null);
  const focusLocation = useRef(false);
  const index = useMemo(() => buildFileIndex(files, locale), [files, locale]);
  const current = resolveDirectory(index, directory);
  useEffect(() => {
    if (current.path !== directory) navigate(current.path);
  }, [current.path, directory, navigate]);
  useEffect(() => {
    if (focusLocation.current) {
      locationRef.current?.focus({ preventScroll: true });
      focusLocation.current = false;
    }
  }, [current.path]);
  const searching = !!search.trim();
  const visibleFiles = searching
    ? searchDirectory(files, current.path, search).sort((a, b) =>
        a.path.localeCompare(b.path, locale, { numeric: true }),
      )
    : current.files;
  const folders = searching ? [] : current.folders;
  const segments = current.path ? current.path.split("/") : [];
  function enter(path: string) {
    setSearch("");
    focusLocation.current = path !== current.path;
    navigate(path);
  }

  function folderLinks(folder: FileDirectory, depth = 0): ReactNode {
    return folder.folders.map((child) => (
      <li key={child.path}>
        <button
          type="button"
          className={current.path === child.path ? "selected" : ""}
          aria-current={current.path === child.path ? "page" : undefined}
          style={{ paddingInlineStart: 12 + Math.min(depth, 5) * 12 }}
          title={child.path}
          onClick={() => enter(child.path)}
        >
          {current.path === child.path ? (
            <FolderOpen size={17} aria-hidden="true" />
          ) : (
            <Folder size={17} aria-hidden="true" />
          )}
          <span>{child.name}</span>
        </button>
        {child.folders.length > 0 && <ul>{folderLinks(child, depth + 1)}</ul>}
      </li>
    ));
  }

  return (
    <section
      className="files-panel project-file-browser"
      aria-label={tr("项目资料")}
    >
      <div className="files-toolbar">
        <div className="file-toolbar-heading">
          <button
            type="button"
            className="file-folders-toggle"
            aria-label={foldersOpen ? tr("收起文件夹栏") : tr("展开文件夹栏")}
            title={foldersOpen ? tr("收起文件夹栏") : tr("展开文件夹栏")}
            aria-expanded={foldersOpen}
            aria-controls={folderNavId}
            onClick={() => setFoldersOpen((open) => !open)}
          >
            <SidebarSimple
              size={21}
              weight={foldersOpen ? "duotone" : "regular"}
              aria-hidden="true"
            />
          </button>
          <h2>
            {tr("项目资料")}
            <span>{files.length}</span>
          </h2>
        </div>
        <label className="search">
          <MagnifyingGlass size={17} aria-hidden="true" />
          <input
            aria-label={tr("搜索文件")}
            placeholder={tr("搜索当前文件夹…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="file-search-clear"
              aria-label={tr("清除搜索")}
              onClick={() => setSearch("")}
            >
              <X size={15} />
            </button>
          )}
        </label>
      </div>
      <div
        className={`file-browser-layout${foldersOpen ? "" : " folders-collapsed"}`}
      >
        <nav
          id={folderNavId}
          hidden={!foldersOpen}
          className="file-directory-nav"
          aria-label={tr("文件夹导航")}
        >
          <p>{tr("文件夹")}</p>
          <button
            type="button"
            className={current.path === "" ? "selected" : ""}
            aria-current={current.path === "" ? "page" : undefined}
            onClick={() => enter("")}
          >
            <FolderOpen size={17} aria-hidden="true" />
            <span>{tr("全部文件")}</span>
            <small>{files.length}</small>
          </button>
          <ul>{folderLinks(index.get("")!)}</ul>
        </nav>
        <div className="file-directory-content">
          <div className="file-location-bar">
            <button
              type="button"
              className="file-up-button"
              aria-label={tr("返回上一级文件夹")}
              title={tr("返回上一级文件夹")}
              disabled={!current.path}
              onClick={() => enter(parentDirectory(current.path))}
            >
              <ArrowUp size={17} />
            </button>
            <nav aria-label={tr("文件路径导航")} className="file-breadcrumbs">
              <ol>
                <li>
                  <button
                    type="button"
                    ref={!current.path ? locationRef : undefined}
                    aria-current={!current.path ? "page" : undefined}
                    onClick={() => enter("")}
                  >
                    {tr("全部文件")}
                  </button>
                </li>
                {segments.map((segment, i) => (
                  <li key={i}>
                    <CaretRight size={13} aria-hidden="true" />
                    {i === segments.length - 1 ? (
                      <button
                        type="button"
                        ref={locationRef}
                        aria-current="page"
                        onClick={() => enter(current.path)}
                      >
                        {segment}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          enter(segments.slice(0, i + 1).join("/"))
                        }
                      >
                        {segment}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          </div>
          {searching && (
            <p className="file-search-summary" role="status">
              {tr("找到 {count} 个文件", { count: visibleFiles.length })}
            </p>
          )}
          {folders.length || visibleFiles.length ? (
            <div className="file-table">
              <div className="file-row table-head" aria-hidden="true">
                <span>{tr("文件名")}</span>
                <span>{tr("可见范围")}</span>
                <span>{tr("版本")}</span>
                <span>{tr("大小")}</span>
                <span>{tr("最近更新")}</span>
              </div>
              {folders.map((folder) => (
                <button
                  type="button"
                  className="file-folder-row"
                  key={folder.path}
                  onClick={() => enter(folder.path)}
                >
                  <Folder size={23} weight="duotone" aria-hidden="true" />
                  <b>{folder.name}</b>
                  <span>
                    {tr("{count} 个文件", { count: folder.fileCount })}
                  </span>
                  <CaretRight size={17} aria-hidden="true" />
                </button>
              ))}
              {visibleFiles.map((file) => (
                <button
                  type="button"
                  className="file-row file-document-row"
                  key={file.id}
                  onClick={() => openFile(file)}
                >
                  <span>
                    <FileText size={22} aria-hidden="true" />
                    <span className="file-entry-name">
                      <b>{fileName(file.path)}</b>
                      {searching && (
                        <small>
                          {parentDirectory(file.path) || tr("全部文件")}
                        </small>
                      )}
                    </span>
                  </span>
                  <span>
                    {file.visibility === "private" ? (
                      <>
                        <LockSimple size={14} aria-hidden="true" />
                        {tr("仅自己与自己的 AI")}
                      </>
                    ) : (
                      <>
                        <Globe size={14} aria-hidden="true" />
                        {tr("项目共享")}
                      </>
                    )}
                  </span>
                  <span className="file-version">v{file.version}</span>
                  <span>
                    {file.size < 1024
                      ? `${file.size} B`
                      : `${(file.size / 1024).toFixed(1)} KB`}
                  </span>
                  <span>
                    {new Date(file.updated_at).toLocaleDateString(locale)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="file-browser-empty">
              <FolderOpen size={32} aria-hidden="true" />
              <h3>{searching ? tr("没有匹配的文件") : tr("还没有文件")}</h3>
              <p>
                {searching
                  ? tr("换个关键词，或清除搜索查看文件夹。")
                  : tr(
                      "上传文件或新建文档，也可以在文件路径中填写文件夹名称。",
                    )}
              </p>
              {searching && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setSearch("")}
                >
                  {tr("清除搜索")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <footer className="file-note">
        <Info size={16} aria-hidden="true" />
        {tr("每次修改保存为新版本。发生冲突时，需要先读取最新内容。")}
      </footer>
    </section>
  );
}
