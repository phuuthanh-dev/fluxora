"use client";

import { ArrowLeft, ChevronLeft, Search, Star } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  appCatalog,
  coreNodeDefinitions,
  getAppDefinition,
  matchesNodeLibraryFilter,
  nodeCatalog,
  nodeLibraryFilters,
  nodeLibraryGroups,
  operationsForApp,
  type NodeDefinition,
  type NodeLibraryFilter,
} from "./node-catalog";
import { NodeIcon } from "./node-icon";

const favoritesStorageKey = "fluxora.node-library.favorites";
const recentStorageKey = "fluxora.node-library.recent";
const recentLimit = 5;

export type NodeLibraryHandle = {
  focusSearch: () => void;
};

type NodeLibraryProps = {
  onAdd: (definition: NodeDefinition) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, definition: NodeDefinition) => void;
  onCollapse: () => void;
};

function readStoredNodeTypes(key: string) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const knownTypes = new Set(nodeCatalog.map((definition) => definition.type));
    return parsed.filter((value): value is string => typeof value === "string" && knownTypes.has(value as NodeDefinition["type"]));
  } catch {
    return [];
  }
}

function definitionsFromTypes(types: string[]) {
  return types.flatMap((type) => {
    const definition = nodeCatalog.find((candidate) => candidate.type === type);
    return definition ? [definition] : [];
  });
}

export const NodeLibrary = forwardRef<NodeLibraryHandle, NodeLibraryProps>(function NodeLibrary(
  { onAdd, onDragStart, onCollapse },
  ref,
) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<NodeLibraryFilter>("all");
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [favoriteTypes, setFavoriteTypes] = useState<string[]>([]);
  const [recentTypes, setRecentTypes] = useState<string[]>([]);

  useImperativeHandle(ref, () => ({ focusSearch: () => searchRef.current?.focus() }), []);

  useEffect(() => {
    setFavoriteTypes(readStoredNodeTypes(favoritesStorageKey));
    setRecentTypes(readStoredNodeTypes(recentStorageKey));
  }, []);

  const rememberRecent = (definition: NodeDefinition) => {
    const next = [definition.type, ...recentTypes.filter((type) => type !== definition.type)].slice(0, recentLimit);
    setRecentTypes(next);
    window.localStorage.setItem(recentStorageKey, JSON.stringify(next));
  };

  const addOperation = (definition: NodeDefinition) => {
    if (!definition.available) return;
    rememberRecent(definition);
    onAdd(definition);
  };

  const dragOperation = (event: DragEvent<HTMLButtonElement>, definition: NodeDefinition) => {
    if (!definition.available) return;
    rememberRecent(definition);
    onDragStart(event, definition);
  };

  const toggleFavorite = (definition: NodeDefinition) => {
    const next = favoriteTypes.includes(definition.type)
      ? favoriteTypes.filter((type) => type !== definition.type)
      : [...favoriteTypes, definition.type];
    setFavoriteTypes(next);
    window.localStorage.setItem(favoritesStorageKey, JSON.stringify(next));
  };

  const filteredDefinitions = useMemo(
    () => nodeCatalog.filter((definition) => matchesNodeLibraryFilter(definition, search.trim() ? "all" : filter, search)),
    [filter, search],
  );
  const favoriteDefinitions = useMemo(() => definitionsFromTypes(favoriteTypes).filter((definition) => definition.available), [favoriteTypes]);
  const recentDefinitions = useMemo(() => definitionsFromTypes(recentTypes).filter((definition) => definition.available), [recentTypes]);
  const selectedApp = selectedAppId ? getAppDefinition(selectedAppId) : undefined;
  const selectedOperations = selectedApp
    ? operationsForApp(selectedApp.id).filter((definition) => matchesNodeLibraryFilter(definition, search.trim() || filter === "core" ? "all" : filter, search))
    : [];
  const visibleApps = appCatalog.filter((app) => {
    const operations = operationsForApp(app.id);
    return operations.some((operation) => filteredDefinitions.includes(operation));
  });
  const filteredCore = coreNodeDefinitions().filter((definition) => filteredDefinitions.includes(definition));
  const resultCount = selectedApp ? selectedOperations.length : filteredDefinitions.length;
  const hasSearch = Boolean(search.trim());

  const clearFilters = () => {
    setSearch("");
    setFilter("all");
    setSelectedAppId(null);
  };

  return (
    <aside className="node-palette" id="node-library">
      <div className="node-palette__header">
        <div>
          <p className="section-label">NODE LIBRARY</p>
          <h2>{selectedApp ? selectedApp.label : "Add a step"}</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Collapse node palette" aria-controls="node-library" aria-expanded="true" onClick={onCollapse}><ChevronLeft size={17} /></button>
      </div>
      {selectedApp ? (
        <button className="palette-back" type="button" onClick={() => setSelectedAppId(null)}><ArrowLeft size={14} /> All apps</button>
      ) : (
        <div className="node-palette__summary" aria-label="Node availability">
          <span><i className="status-dot status-dot--ready" />{nodeCatalog.filter((node) => node.available).length} ready</span>
          <span><i className="status-dot" />{nodeCatalog.filter((node) => !node.available).length} roadmap</span>
        </div>
      )}
      <p className="node-palette__hint">{selectedApp ? selectedApp.description : "Choose a core step or open an app to select one operation."}</p>
      <label className="palette-search"><Search size={15} /><span className="visually-hidden">Search apps and operations</span><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search apps and operations" aria-label="Search apps and operations" /><kbd>/</kbd></label>
      <div className="palette-filters" role="group" aria-label="Filter node library">
        {nodeLibraryFilters.map((candidate) => <button key={candidate.id} type="button" className={filter === candidate.id ? "palette-filter palette-filter--active" : "palette-filter"} aria-pressed={filter === candidate.id} onClick={() => { setFilter(candidate.id); if (candidate.id === "core") setSelectedAppId(null); }}>{candidate.label}</button>)}
      </div>
      <div className="palette-results" aria-live="polite">
        <span>{resultCount} {resultCount === 1 ? "operation" : "operations"}</span>
        {(search || filter !== "all" || selectedApp) && <button type="button" onClick={clearFilters}>Clear filters</button>}
      </div>

      {selectedApp ? (
        <OperationSection
          id={`app-${selectedApp.id}`}
          label="Operations"
          description="Choose the exact step this app should perform"
          definitions={selectedOperations}
          favoriteTypes={favoriteTypes}
          onAdd={addOperation}
          onDragStart={dragOperation}
          onToggleFavorite={toggleFavorite}
        />
      ) : hasSearch ? (
        <OperationSection
          id="search-results"
          label="Search results"
          description="Matches across apps, operations, aliases, and node types"
          definitions={filteredDefinitions}
          favoriteTypes={favoriteTypes}
          onAdd={addOperation}
          onDragStart={dragOperation}
          onToggleFavorite={toggleFavorite}
        />
      ) : (
        <>
          {filter === "all" && favoriteDefinitions.length > 0 && <OperationSection id="favorites" label="Favorites" description="Your pinned operations" definitions={favoriteDefinitions} favoriteTypes={favoriteTypes} onAdd={addOperation} onDragStart={dragOperation} onToggleFavorite={toggleFavorite} />}
          {filter === "all" && recentDefinitions.length > 0 && <OperationSection id="recent" label="Recently used" description="Quick access on this browser" definitions={recentDefinitions} favoriteTypes={favoriteTypes} onAdd={addOperation} onDragStart={dragOperation} onToggleFavorite={toggleFavorite} />}
          {(filter === "all" || filter === "core") && nodeLibraryGroups.filter((group) => ["start", "logic", "approval"].includes(group.id)).map((group) => {
            const definitions = filteredCore.filter((definition) => definition.libraryGroup === group.id);
            return definitions.length > 0 ? <OperationSection key={group.id} id={group.id} label={group.label} description={group.description} definitions={definitions} favoriteTypes={favoriteTypes} onAdd={addOperation} onDragStart={dragOperation} onToggleFavorite={toggleFavorite} /> : null;
          })}
          {filter !== "core" && visibleApps.length > 0 && <section className="palette-group palette-apps" aria-labelledby="palette-apps-heading"><header><div><h3 id="palette-apps-heading">Apps & services</h3><p>Select an app, then choose its operation</p></div><span>{visibleApps.length}</span></header><div className="palette-app-grid">{visibleApps.map((app) => {
            const operations = operationsForApp(app.id).filter((definition) => filteredDefinitions.includes(definition));
            const planned = operations.every((definition) => !definition.available);
            return <button className="palette-app" key={app.id} type="button" onClick={() => setSelectedAppId(app.id)} aria-label={`Open ${app.label}, ${operations.length} ${operations.length === 1 ? "operation" : "operations"}${planned ? ", planned" : ""}`}><span className="palette-app__icon"><NodeIcon name={app.icon} size={19} /></span><span><strong>{app.label}</strong><small>{operations.length} {operations.length === 1 ? "operation" : "operations"}</small></span>{planned && <em>Planned</em>}</button>;
          })}</div></section>}
        </>
      )}

      {resultCount === 0 && <div className="palette-empty"><Search size={21} /><strong>No matching operations</strong><p>Try an app name like “Telegram” or clear the current filters.</p><button type="button" onClick={clearFilters}>Show all ready operations</button></div>}
    </aside>
  );
});

function OperationSection({ id, label, description, definitions, favoriteTypes, onAdd, onDragStart, onToggleFavorite }: {
  id: string;
  label: string;
  description: string;
  definitions: NodeDefinition[];
  favoriteTypes: string[];
  onAdd: (definition: NodeDefinition) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, definition: NodeDefinition) => void;
  onToggleFavorite: (definition: NodeDefinition) => void;
}) {
  if (definitions.length === 0) return null;
  return (
    <section className="palette-group" aria-labelledby={`palette-group-${id}`}>
      <header><div><h3 id={`palette-group-${id}`}>{label}</h3><p>{description}</p></div><span>{definitions.length}</span></header>
      {definitions.map((definition) => {
        const app = definition.appId ? getAppDefinition(definition.appId) : undefined;
        const favorite = favoriteTypes.includes(definition.type);
        return <div className="palette-operation" key={definition.type}>
          <button className={definition.available ? "palette-node" : "palette-node palette-node--planned"} type="button" draggable={definition.available} disabled={!definition.available} onDragStart={(event) => onDragStart(event, definition)} onClick={() => onAdd(definition)} aria-label={`${app ? `${app.label}: ` : ""}${definition.operationLabel} ${definition.description}${definition.available ? "" : " Planned"}`}>
            <span className="palette-node__icon"><NodeIcon name={definition.icon} size={16} /></span>
            <span className="palette-node__body"><span className="palette-node__title"><strong>{definition.operationLabel}</strong>{!definition.available && <em>Planned</em>}</span><small>{app ? `${app.label} · ` : ""}{definition.description}</small></span>
          </button>
          <button className={favorite ? "palette-favorite palette-favorite--active" : "palette-favorite"} type="button" aria-label={`${favorite ? "Remove" : "Add"} ${definition.operationLabel} ${favorite ? "from" : "to"} favorites`} aria-pressed={favorite} onClick={() => onToggleFavorite(definition)}><Star size={13} fill={favorite ? "currentColor" : "none"} /></button>
        </div>;
      })}
    </section>
  );
}
