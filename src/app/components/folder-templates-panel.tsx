"use client";

import { useState } from "react";
import { InlineActionForm } from "@/app/components/forms";
import {
  applyFolderTemplateAction,
  deleteFolderTemplateAction,
  saveFolderTemplateAction,
} from "@/app/actions/folder-templates";
import {
  BUILTIN_FOLDER_TEMPLATES,
  describeTree,
  parseTemplateTree,
} from "@/lib/folder-templates";

type SavedTemplate = {
  id: string;
  name: string;
  treeJson: string;
};

export function FolderTemplatesPanel({
  workspaceId,
  parentId,
  currentFolderId,
  currentFolderName,
  canEdit,
  canSave,
  savedTemplates,
}: {
  workspaceId: string;
  /** Apply under this parent (null = workspace root) */
  parentId: string | null;
  currentFolderId: string | null;
  currentFolderName: string | null;
  canEdit: boolean;
  canSave: boolean;
  savedTemplates: SavedTemplate[];
}) {
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  if (!canEdit && !canSave) return null;

  return (
    <div className="mt-4 border-t border-[#0A3D45]/10 pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A3D45]/70 underline-offset-2 hover:underline"
      >
        Templates
        <span
          aria-hidden
          className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open ? (
        <div className="mt-3 space-y-4">
          {canEdit ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0A3D45]/45">
                Starters
              </p>
              <ul className="space-y-2">
                {BUILTIN_FOLDER_TEMPLATES.map((t) => (
                  <li key={t.id}>
                    <InlineActionForm
                      className="rounded-xl bg-[#0A3D45]/4 p-2.5"
                      action={applyFolderTemplateAction}
                      submitLabel="Use"
                      submitClassName="min-h-9 w-full text-xs"
                    >
                      <input type="hidden" name="workspaceId" value={workspaceId} />
                      <input type="hidden" name="templateId" value={t.id} />
                      {parentId ? (
                        <input type="hidden" name="parentId" value={parentId} />
                      ) : null}
                      <p className="text-sm font-semibold text-[#0A3D45]">{t.name}</p>
                      <p className="mb-2 text-xs text-[#0A3D45]/55">{t.description}</p>
                    </InlineActionForm>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {canEdit && savedTemplates.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0A3D45]/45">
                Saved
              </p>
              <ul className="space-y-2">
                {savedTemplates.map((t) => {
                  const tree = parseTemplateTree(t.treeJson) ?? [];
                  return (
                    <li
                      key={t.id}
                      className="rounded-xl bg-[#0A3D45]/4 p-2.5"
                    >
                      <p className="text-sm font-semibold text-[#0A3D45]">{t.name}</p>
                      <p className="mb-2 text-xs text-[#0A3D45]/55 line-clamp-2">
                        {describeTree(tree) || "Empty"}
                      </p>
                      <div className="flex gap-2">
                        <InlineActionForm
                          className="flex-1"
                          action={applyFolderTemplateAction}
                          submitLabel="Use"
                          submitClassName="min-h-9 w-full text-xs"
                        >
                          <input type="hidden" name="workspaceId" value={workspaceId} />
                          <input type="hidden" name="templateId" value={t.id} />
                          {parentId ? (
                            <input type="hidden" name="parentId" value={parentId} />
                          ) : null}
                        </InlineActionForm>
                        {canSave ? (
                          <InlineActionForm
                            className="shrink-0"
                            action={deleteFolderTemplateAction}
                            submitLabel="Delete"
                            submitClassName="min-h-9 text-xs"
                          >
                            <input type="hidden" name="workspaceId" value={workspaceId} />
                            <input type="hidden" name="templateId" value={t.id} />
                          </InlineActionForm>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {canSave ? (
            <div>
              <button
                type="button"
                onClick={() => setSaveOpen((v) => !v)}
                className="text-xs font-semibold text-[#1a7a82] underline-offset-2 hover:underline"
              >
                {saveOpen ? "Cancel save" : "Save current folders as template…"}
              </button>
              {saveOpen ? (
                <InlineActionForm
                  className="mt-2 flex flex-col gap-2"
                  action={saveFolderTemplateAction}
                  submitLabel="Save template"
                  submitClassName="min-h-9 w-full text-xs"
                >
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  {currentFolderId ? (
                    <input type="hidden" name="fromFolderId" value={currentFolderId} />
                  ) : null}
                  <input
                    name="name"
                    required
                    placeholder={
                      currentFolderName
                        ? `Template from ${currentFolderName}`
                        : "e.g. Sprint layout"
                    }
                    className="rowgon-input min-h-9 text-sm"
                  />
                  <p className="text-[11px] text-[#0A3D45]/50">
                    {currentFolderId
                      ? `Saves “${currentFolderName}” and its subfolders.`
                      : "Saves the whole active folder tree."}
                  </p>
                </InlineActionForm>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
