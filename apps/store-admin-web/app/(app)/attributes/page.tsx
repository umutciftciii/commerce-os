"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  SectionCard,
  Select,
  SkeletonRows,
  Textarea,
  useLocale,
  type DataTableColumn,
} from "../../../components/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type {
  AttributeDefinition,
  AttributeDefinitionCreateRequest,
  AttributeGroup,
  AttributeOption,
} from "@commerce-os/api-client";
import { AttributeIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

type DataType = AttributeDefinition["dataType"];
type Status = AttributeDefinition["status"];

// Seçenek destekleyen tipler (gateway ile birebir; OPTION_DATA_TYPES).
const OPTION_DATA_TYPES: DataType[] = ["SELECT", "MULTI_SELECT", "COLOR"];
const DATA_TYPES: DataType[] = [
  "TEXT",
  "TEXTAREA",
  "RICH_TEXT",
  "INTEGER",
  "DECIMAL",
  "BOOLEAN",
  "DATE",
  "URL",
  "SELECT",
  "MULTI_SELECT",
  "COLOR",
  "IMAGE",
  "FILE",
];
const CODE_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; attributes: AttributeDefinition[]; groups: AttributeGroup[] };

type AttrEditor = { mode: "create" } | { mode: "edit"; attribute: AttributeDefinition } | null;
type GroupEditor = { mode: "create" } | { mode: "edit"; group: AttributeGroup } | null;

export default function AttributesPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.attributes;
  const c = dict.common;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attrEditor, setAttrEditor] = useState<AttrEditor>(null);
  const [groupEditor, setGroupEditor] = useState<GroupEditor>(null);
  const [optionsFor, setOptionsFor] = useState<AttributeDefinition | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [attrs, groups] = await Promise.all([
        storeApi.listAttributes(),
        storeApi.listAttributeGroups(),
      ]);
      setState({ status: "ready", attributes: attrs.data, groups: groups.data });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const attributes = state.status === "ready" ? state.attributes : [];
  const groups = state.status === "ready" ? state.groups : [];

  const statusLabels = t.statusLabels as Record<Status, string>;
  const dataTypeLabels = t.dataTypeLabels as Record<DataType, string>;

  const columns: DataTableColumn<AttributeDefinition>[] = [
    {
      header: t.table.name,
      cell: (a) => <span className="font-medium text-white/90">{a.name}</span>,
    },
    {
      header: t.table.code,
      cell: (a) => <span className="font-mono text-xs text-white/45">{a.code}</span>,
    },
    {
      header: t.table.dataType,
      cell: (a) => <span className="text-white/60">{dataTypeLabels[a.dataType]}</span>,
    },
    {
      header: t.table.scope,
      cell: (a) => (
        <Badge tone={a.scope === "PLATFORM" ? "info" : "neutral"}>
          {a.scope === "PLATFORM" ? t.platformBadge : t.storeBadge}
        </Badge>
      ),
    },
    {
      header: t.table.status,
      cell: (a) => (
        <Badge tone={a.status === "ACTIVE" ? "success" : "neutral"}>{statusLabels[a.status]}</Badge>
      ),
    },
    {
      header: t.table.actions,
      align: "right",
      cell: (a) => {
        const editable = a.scope === "STORE";
        return (
          <div className="flex justify-end gap-2">
            {OPTION_DATA_TYPES.includes(a.dataType) ? (
              <Button variant="secondary" size="sm" onClick={() => setOptionsFor(a)}>
                {t.optionsAction}
              </Button>
            ) : null}
            {editable ? (
              <Button variant="secondary" size="sm" onClick={() => setAttrEditor({ mode: "edit", attribute: a })}>
                {t.editAction}
              </Button>
            ) : (
              <span className="text-xs text-white/30">{t.platformReadonly}</span>
            )}
          </div>
        );
      },
    },
  ];

  const groupColumns: DataTableColumn<AttributeGroup>[] = [
    { header: t.groupTable.name, cell: (g) => <span className="font-medium text-white/90">{g.name}</span> },
    {
      header: t.groupTable.sortOrder,
      align: "right",
      cell: (g) => <span className="text-white/45">{g.sortOrder}</span>,
    },
    {
      header: t.groupTable.actions,
      align: "right",
      cell: (g) => (
        <Button variant="secondary" size="sm" onClick={() => setGroupEditor({ mode: "edit", group: g })}>
          {t.editAction}
        </Button>
      ),
    },
  ];

  function onSaved(message: string) {
    setAttrEditor(null);
    setGroupEditor(null);
    setNotice(message);
    void load();
  }

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setGroupEditor({ mode: "create" })}>
              {t.newGroup}
            </Button>
            <Button onClick={() => setAttrEditor({ mode: "create" })}>{t.newAttribute}</Button>
          </div>
        }
      />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button type="button" className="text-emerald-300 underline" onClick={() => setNotice(null)}>
                {c.actions.dismiss}
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      ) : null}

      <SectionCard
        title={t.attributesCard}
        description={
          state.status === "ready" ? format(t.count, { count: attributes.length }) : t.attributesCardDescription
        }
        icon={<AttributeIcon />}
      >
        {state.status === "loading" ? <SkeletonRows rows={4} /> : null}
        {state.status === "error" ? (
          <Alert
            tone="error"
            title={t.loadError}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                {c.actions.retry}
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : null}
        {state.status === "ready" && attributes.length === 0 ? (
          <EmptyState
            tag={t.emptyTag}
            title={t.emptyTitle}
            description={t.emptyDescription}
            icon={<AttributeIcon />}
            action={
              <Button size="sm" onClick={() => setAttrEditor({ mode: "create" })}>
                {t.emptyAction}
              </Button>
            }
          />
        ) : null}
        {state.status === "ready" && attributes.length > 0 ? (
          <DataTable columns={columns} rows={attributes} rowKey={(a) => a.id} caption={t.attributesCard} />
        ) : null}
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title={t.groupsCard}
          description={
            state.status === "ready" ? format(t.groupCount, { count: groups.length }) : t.groupsCardDescription
          }
          icon={<AttributeIcon />}
        >
          {state.status === "ready" && groups.length === 0 ? (
            <p className="py-4 text-sm text-white/40">{t.groupsEmpty}</p>
          ) : null}
          {state.status === "ready" && groups.length > 0 ? (
            <DataTable columns={groupColumns} rows={groups} rowKey={(g) => g.id} caption={t.groupsCard} />
          ) : null}
        </SectionCard>
      </div>

      {attrEditor ? (
        <AttributeEditor editor={attrEditor} onClose={() => setAttrEditor(null)} onSaved={onSaved} />
      ) : null}
      {groupEditor ? (
        <GroupEditor editor={groupEditor} onClose={() => setGroupEditor(null)} onSaved={onSaved} />
      ) : null}
      {optionsFor ? (
        <OptionsManager attribute={optionsFor} onClose={() => setOptionsFor(null)} />
      ) : null}
    </>
  );
}

function AttributeEditor({
  editor,
  onClose,
  onSaved,
}: {
  editor: Exclude<AttrEditor, null>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.attributes;
  const c = dict.common;
  const f = t.form;
  const isEdit = editor.mode === "edit";
  const dataTypeLabels = t.dataTypeLabels as Record<DataType, string>;
  const statusLabels = t.statusLabels as Record<Status, string>;

  const [code, setCode] = useState(isEdit ? editor.attribute.code : "");
  const [name, setName] = useState(isEdit ? editor.attribute.name : "");
  const [dataType, setDataType] = useState<DataType>(isEdit ? editor.attribute.dataType : "TEXT");
  const [unit, setUnit] = useState(isEdit ? (editor.attribute.unit ?? "") : "");
  const [description, setDescription] = useState(isEdit ? (editor.attribute.description ?? "") : "");
  const [status, setStatus] = useState<Status>(isEdit ? editor.attribute.status : "ACTIVE");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (name.trim().length === 0) return setError(f.requiredName);
    if (!isEdit && !CODE_PATTERN.test(code.trim())) return setError(f.requiredCode);

    setSaving(true);
    try {
      if (isEdit) {
        await storeApi.updateAttribute(editor.attribute.id, {
          name: name.trim(),
          unit: unit.trim() === "" ? null : unit.trim(),
          description: description.trim() === "" ? null : description.trim(),
          status,
        });
        onSaved(t.updatedToast);
      } else {
        const payload: AttributeDefinitionCreateRequest = {
          code: code.trim(),
          name: name.trim(),
          dataType,
          unit: unit.trim() === "" ? null : unit.trim(),
          description: description.trim() === "" ? null : description.trim(),
          status,
        };
        await storeApi.createAttribute(payload);
        onSaved(t.createdToast);
      }
    } catch (caught) {
      setError(messageForError(caught, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? f.editTitle : f.createTitle}
      description={isEdit ? f.editSubtitle : f.createSubtitle}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {c.actions.cancel}
          </Button>
          <Button type="submit" form="attribute-form" disabled={saving}>
            {saving ? c.states.saving : isEdit ? f.submitEdit : f.submitCreate}
          </Button>
        </>
      }
    >
      <form id="attribute-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div>
          <Input
            id="attribute-code"
            label={f.codeLabel}
            placeholder={f.codePlaceholder}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={saving || isEdit}
            required={!isEdit}
          />
          <p className="mt-1.5 text-xs text-white/30">{isEdit ? f.codeLockedHint : f.codeHint}</p>
        </div>
        <Input
          id="attribute-name"
          label={f.nameLabel}
          placeholder={f.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving}
          required
        />
        <div>
          <Select
            id="attribute-datatype"
            label={f.dataTypeLabel}
            options={DATA_TYPES.map((dt) => ({ value: dt, label: dataTypeLabels[dt] }))}
            value={dataType}
            onChange={(e) => setDataType(e.target.value as DataType)}
            disabled={saving || isEdit}
          />
          {isEdit ? <p className="mt-1.5 text-xs text-white/30">{f.dataTypeLockedHint}</p> : null}
        </div>
        <Input
          id="attribute-unit"
          label={f.unitLabel}
          placeholder={f.unitPlaceholder}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          disabled={saving}
        />
        <Textarea
          id="attribute-description"
          label={f.descriptionLabel}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={saving}
          rows={2}
        />
        <Select
          id="attribute-status"
          label={f.statusLabel}
          options={(Object.keys(statusLabels) as Status[]).map((s) => ({ value: s, label: statusLabels[s] }))}
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          disabled={saving}
        />
      </form>
    </Modal>
  );
}

function GroupEditor({
  editor,
  onClose,
  onSaved,
}: {
  editor: Exclude<GroupEditor, null>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.attributes;
  const c = dict.common;
  const f = t.groupForm;
  const isEdit = editor.mode === "edit";

  const [name, setName] = useState(isEdit ? editor.group.name : "");
  const [description, setDescription] = useState(isEdit ? (editor.group.description ?? "") : "");
  const [sortOrder, setSortOrder] = useState(isEdit ? String(editor.group.sortOrder) : "0");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (name.trim().length === 0) return setError(f.requiredName);
    const parsed = Number.parseInt(sortOrder, 10);
    const safeSort = Number.isNaN(parsed) ? 0 : parsed;
    setSaving(true);
    try {
      if (isEdit) {
        await storeApi.updateAttributeGroup(editor.group.id, {
          name: name.trim(),
          description: description.trim() === "" ? null : description.trim(),
          sortOrder: safeSort,
        });
        onSaved(t.groupUpdatedToast);
      } else {
        await storeApi.createAttributeGroup({
          name: name.trim(),
          description: description.trim() === "" ? null : description.trim(),
          sortOrder: safeSort,
        });
        onSaved(t.groupCreatedToast);
      }
    } catch (caught) {
      setError(messageForError(caught, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? f.editTitle : f.createTitle}
      description={isEdit ? f.editSubtitle : f.createSubtitle}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {c.actions.cancel}
          </Button>
          <Button type="submit" form="group-form" disabled={saving}>
            {saving ? c.states.saving : isEdit ? f.submitEdit : f.submitCreate}
          </Button>
        </>
      }
    >
      <form id="group-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Input
          id="group-name"
          label={f.nameLabel}
          placeholder={f.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving}
          required
        />
        <Textarea
          id="group-description"
          label={f.descriptionLabel}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={saving}
          rows={2}
        />
        <div>
          <Input
            id="group-sort"
            type="number"
            label={f.sortOrderLabel}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            disabled={saving}
          />
          <p className="mt-1.5 text-xs text-white/30">{f.sortOrderHint}</p>
        </div>
      </form>
    </Modal>
  );
}

function OptionsManager({ attribute, onClose }: { attribute: AttributeDefinition; onClose: () => void }) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.attributes;
  const o = t.options;
  const c = dict.common;
  const isColor = attribute.dataType === "COLOR";

  const [options, setOptions] = useState<AttributeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [colorHex, setColorHex] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await storeApi.listAttributeOptions(attribute.id);
      setOptions(res.data);
      setLoadError(null);
    } catch (error) {
      setLoadError(messageForError(error, locale));
    } finally {
      setLoading(false);
    }
  }, [attribute.id, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (value.trim().length === 0) return setFormError(o.requiredValue);
    if (label.trim().length === 0) return setFormError(o.requiredLabel);
    const parsed = Number.parseInt(sortOrder, 10);
    setSaving(true);
    try {
      await storeApi.createAttributeOption(attribute.id, {
        value: value.trim(),
        label: label.trim(),
        colorHex: isColor && colorHex.trim() !== "" ? colorHex.trim() : null,
        sortOrder: Number.isNaN(parsed) ? 0 : parsed,
        status: "ACTIVE",
      });
      setValue("");
      setLabel("");
      setColorHex("");
      setSortOrder("0");
      await load();
    } catch (error) {
      setFormError(messageForError(error, locale));
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<AttributeOption>[] = [
    { header: o.table.value, cell: (opt) => <span className="font-mono text-xs text-white/60">{opt.value}</span> },
    { header: o.table.label, cell: (opt) => <span className="text-white/90">{opt.label}</span> },
    {
      header: o.table.color,
      cell: (opt) =>
        opt.colorHex ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: opt.colorHex }} />
            <span className="font-mono text-xs text-white/45">{opt.colorHex}</span>
          </span>
        ) : (
          <span className="text-white/30">—</span>
        ),
    },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={o.title}
      description={format(o.subtitle, { name: attribute.name })}
      closeLabel={c.actions.dismiss}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {c.actions.dismiss}
        </Button>
      }
    >
      <div className="space-y-4">
        {loadError ? <Alert tone="error">{loadError}</Alert> : null}
        {loading ? (
          <SkeletonRows rows={2} />
        ) : options.length === 0 ? (
          <p className="text-sm text-white/40">{o.empty}</p>
        ) : (
          <DataTable columns={columns} rows={options} rowKey={(opt) => opt.id} caption={o.title} />
        )}

        <form onSubmit={onAdd} className="space-y-3 border-t border-white/[0.06] pt-4" noValidate>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <div className="grid grid-cols-2 gap-3">
            <Input id="option-value" label={o.valueLabel} placeholder={o.valuePlaceholder} value={value} onChange={(e) => setValue(e.target.value)} disabled={saving} />
            <Input id="option-label" label={o.labelLabel} placeholder={o.labelPlaceholder} value={label} onChange={(e) => setLabel(e.target.value)} disabled={saving} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {isColor ? (
              <Input id="option-color" label={o.colorLabel} placeholder={o.colorPlaceholder} value={colorHex} onChange={(e) => setColorHex(e.target.value)} disabled={saving} />
            ) : (
              <span />
            )}
            <Input id="option-sort" type="number" label={o.sortOrderLabel} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} disabled={saving} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? c.states.saving : o.addOption}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
