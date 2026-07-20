"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
  useLocale,
  type DataTableColumn,
} from "../../../components/ui";
import type {
  HomeSection,
  HomeSectionCreateRequest,
  HomeSectionType,
} from "@commerce-os/api-client";
import { HomeIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { homeLabels, type HomeLocale } from "./labels";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; sections: HomeSection[] };
type Editor = { mode: "create" } | { mode: "edit"; section: HomeSection } | null;

const SECTION_TYPES: HomeSectionType[] = ["HERO_SLIDER", "FEATURED_CATEGORIES", "PRODUCT_SHOWCASE"];

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function HomeExperiencePage() {
  const locale = useLocale() as HomeLocale;
  const t = homeLabels(locale);
  const router = useRouter();

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [editor, setEditor] = useState<Editor>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listHomeSections();
      setState({ status: "ready", sections: result.data });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = state.status === "ready" ? state.sections : [];

  async function handleDelete(section: HomeSection) {
    if (!window.confirm(t.deleteConfirm)) return;
    setBusyId(section.id);
    try {
      await storeApi.deleteHomeSection(section.id);
      setNotice(t.deletedToast);
      await load();
    } catch (error) {
      setNotice(messageForError(error, locale));
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(section: HomeSection) {
    setBusyId(section.id);
    try {
      await storeApi.updateHomeSection(section.id, { enabled: !section.enabled });
      await load();
    } catch (error) {
      setNotice(messageForError(error, locale));
    } finally {
      setBusyId(null);
    }
  }

  async function handleMove(section: HomeSection, direction: -1 | 1) {
    const index = sections.findIndex((item) => item.id === section.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setReordering(true);
    try {
      await storeApi.reorderHomeSections({ orderedIds: next.map((item) => item.id) });
      await load();
    } catch (error) {
      setNotice(messageForError(error, locale));
    } finally {
      setReordering(false);
    }
  }

  function visibilityLabel(section: HomeSection): string {
    if (section.desktopVisible && section.mobileVisible) return t.visibilityBoth;
    if (section.desktopVisible) return t.visibilityDesktop;
    if (section.mobileVisible) return t.visibilityMobile;
    return t.visibilityNone;
  }

  const columns: DataTableColumn<HomeSection>[] = [
    {
      header: t.table.type,
      cell: (section) => <Badge tone="neutral">{t.types[section.type] ?? section.type}</Badge>,
    },
    {
      header: t.table.title,
      cell: (section) =>
        section.title ? (
          <span className="font-medium text-white/90">{section.title}</span>
        ) : (
          <span className="text-white/35">{t.untitled}</span>
        ),
    },
    { header: t.table.visibility, cell: (section) => <span className="text-white/60">{visibilityLabel(section)}</span> },
    {
      header: t.table.status,
      cell: (section) => (
        <Badge tone={section.enabled ? "success" : "neutral"}>
          {section.enabled ? t.enabled : t.disabled}
        </Badge>
      ),
    },
    {
      header: t.table.order,
      cell: (section) => {
        const index = sections.findIndex((item) => item.id === section.id);
        return (
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              aria-label={t.moveUp}
              disabled={reordering || index <= 0}
              onClick={() => void handleMove(section, -1)}
            >
              ↑
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label={t.moveDown}
              disabled={reordering || index === sections.length - 1}
              onClick={() => void handleMove(section, 1)}
            >
              ↓
            </Button>
          </div>
        );
      },
    },
    {
      header: t.table.actions,
      align: "right",
      cell: (section) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => router.push(`/home/${section.id}`)}>
            {t.manage}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busyId === section.id}
            onClick={() => void handleToggle(section)}
          >
            {section.enabled ? t.toggleDisable : t.toggleEnable}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditor({ mode: "edit", section })}>
            {t.editSettings}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busyId === section.id}
            onClick={() => void handleDelete(section)}
          >
            {t.delete}
          </Button>
        </div>
      ),
    },
  ];

  function onSaved(message: string) {
    setEditor(null);
    setNotice(message);
    void load();
  }

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button onClick={() => setEditor({ mode: "create" })}>{t.newSection}</Button>}
      />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button type="button" className="text-emerald-300 underline" onClick={() => setNotice(null)}>
                {t.dismiss}
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      ) : null}

      <SectionCard
        title={t.cardTitle}
        description={
          state.status === "ready" ? t.countLabel.replace("{count}", String(sections.length)) : undefined
        }
        icon={<HomeIcon />}
      >
        {state.status === "loading" ? <SkeletonRows rows={4} /> : null}
        {state.status === "error" ? (
          <Alert
            tone="error"
            title={t.loadError}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                {t.retry}
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : null}
        {state.status === "ready" && sections.length === 0 ? (
          <EmptyState
            tag={t.eyebrow}
            title={t.emptyTitle}
            description={t.emptyDescription}
            icon={<HomeIcon />}
            action={
              <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
                {t.emptyAction}
              </Button>
            }
          />
        ) : null}
        {state.status === "ready" && sections.length > 0 ? (
          <DataTable columns={columns} rows={sections} rowKey={(s) => s.id} caption={t.cardTitle} />
        ) : null}
      </SectionCard>

      {editor ? (
        <SectionEditor
          editor={editor}
          locale={locale}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
        />
      ) : null}
    </>
  );
}

function SectionEditor({
  editor,
  locale,
  onClose,
  onSaved,
}: {
  editor: NonNullable<Editor>;
  locale: HomeLocale;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const t = homeLabels(locale);
  const f = t.form;
  const isEdit = editor.mode === "edit";
  const section = isEdit ? editor.section : null;
  const [type, setType] = useState<HomeSectionType>(section?.type ?? "HERO_SLIDER");

  const cfg = (section?.config ?? {}) as Record<string, unknown>;
  const cfgSource = (cfg.source ?? {}) as Record<string, unknown>;
  const cfgParams = (cfgSource.params ?? {}) as Record<string, unknown>;

  const [title, setTitle] = useState(section?.title ?? "");
  const [subtitle, setSubtitle] = useState(section?.subtitle ?? "");
  const [enabled, setEnabled] = useState(section?.enabled ?? true);
  const [desktopVisible, setDesktopVisible] = useState(section?.desktopVisible ?? true);
  const [mobileVisible, setMobileVisible] = useState(section?.mobileVisible ?? true);
  const [autoplayMs, setAutoplayMs] = useState(cfg.autoplayMs != null ? String(cfg.autoplayMs) : "");
  const [layout, setLayout] = useState<string>((cfg.layout as string) ?? "CAROUSEL");
  const [maxItems, setMaxItems] = useState(cfg.maxItems != null ? String(cfg.maxItems) : "12");
  const [sourceKind, setSourceKind] = useState<string>((cfgSource.kind as string) ?? "MANUAL");
  const [rule, setRule] = useState<string>((cfgSource.rule as string) ?? "NEW_PRODUCTS");
  const [categorySlug, setCategorySlug] = useState((cfgParams.categorySlug as string) ?? "");
  const [brand, setBrand] = useState((cfgParams.brand as string) ?? "");
  const [attributeCode, setAttributeCode] = useState((cfgParams.attributeCode as string) ?? "");
  const [attributeValue, setAttributeValue] = useState((cfgParams.attributeValue as string) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function buildConfig(): Record<string, unknown> {
    if (type === "HERO_SLIDER") {
      const ms = Number.parseInt(autoplayMs, 10);
      return Number.isFinite(ms) && ms > 0 ? { autoplayMs: ms } : {};
    }
    if (type === "FEATURED_CATEGORIES") return {};
    // PRODUCT_SHOWCASE
    const source =
      sourceKind === "MANUAL"
        ? { kind: "MANUAL" }
        : {
            kind: "DYNAMIC",
            rule,
            params: {
              ...(categorySlug ? { categorySlug } : {}),
              ...(brand ? { brand } : {}),
              ...(attributeCode ? { attributeCode } : {}),
              ...(attributeValue ? { attributeValue } : {}),
            },
          };
    const max = Number.parseInt(maxItems, 10);
    return { layout, maxItems: Number.isFinite(max) ? max : 12, source };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const config = buildConfig();
      if (isEdit && section) {
        await storeApi.updateHomeSection(section.id, {
          title: toNullable(title),
          subtitle: toNullable(subtitle),
          enabled,
          desktopVisible,
          mobileVisible,
          config,
        });
        onSaved(t.updatedToast);
      } else {
        const payload: HomeSectionCreateRequest = {
          type,
          title: toNullable(title),
          subtitle: toNullable(subtitle),
          enabled,
          desktopVisible,
          mobileVisible,
          config,
        };
        await storeApi.createHomeSection(payload);
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
      closeLabel={t.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t.cancel}
          </Button>
          <Button type="submit" form="home-section-form" disabled={saving}>
            {saving ? t.saving : isEdit ? t.save : t.create}
          </Button>
        </>
      }
    >
      <form id="home-section-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}

        {isEdit ? (
          <p className="text-sm text-white/60">
            {f.typeLabel}: <span className="font-medium text-white/90">{t.types[type]}</span>
          </p>
        ) : (
          <Select
            id="home-type"
            label={f.typeLabel}
            value={type}
            onChange={(event) => setType(event.target.value as HomeSectionType)}
            disabled={saving}
            options={SECTION_TYPES.map((value) => ({ value, label: t.types[value] }))}
          />
        )}

        <Input
          id="home-title"
          label={f.titleLabel}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={saving}
        />
        <Input
          id="home-subtitle"
          label={f.subtitleLabel}
          value={subtitle}
          onChange={(event) => setSubtitle(event.target.value)}
          disabled={saving}
        />

        <div className="flex flex-wrap gap-4">
          <Checkbox label={f.enabledLabel} checked={enabled} onChange={setEnabled} disabled={saving} />
          <Checkbox label={f.desktopVisibleLabel} checked={desktopVisible} onChange={setDesktopVisible} disabled={saving} />
          <Checkbox label={f.mobileVisibleLabel} checked={mobileVisible} onChange={setMobileVisible} disabled={saving} />
        </div>

        {type === "HERO_SLIDER" ? (
          <Input
            id="home-autoplay"
            type="number"
            label={f.autoplayLabel}
            value={autoplayMs}
            onChange={(event) => setAutoplayMs(event.target.value)}
            disabled={saving}
          />
        ) : null}

        {type === "PRODUCT_SHOWCASE" ? (
          <>
            <Select
              id="home-layout"
              label={f.layoutLabel}
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              disabled={saving}
              options={[
                { value: "CAROUSEL", label: f.layoutCarousel },
                { value: "GRID", label: f.layoutGrid },
              ]}
            />
            <Input
              id="home-max"
              type="number"
              label={f.maxItemsLabel}
              value={maxItems}
              onChange={(event) => setMaxItems(event.target.value)}
              disabled={saving}
            />
            <Select
              id="home-source"
              label={f.sourceLabel}
              value={sourceKind}
              onChange={(e) => setSourceKind(e.target.value)}
              disabled={saving}
              options={[
                { value: "MANUAL", label: f.sourceManual },
                { value: "DYNAMIC", label: f.sourceDynamic },
              ]}
            />
            {sourceKind === "DYNAMIC" ? (
              <>
                <Select
                  id="home-rule"
                  label={f.ruleLabel}
                  value={rule}
                  onChange={(e) => setRule(e.target.value)}
                  disabled={saving}
                  options={Object.entries(f.rules).map(([value, label]) => ({ value, label }))}
                />
                {rule === "CATEGORY" ? (
                  <Input id="home-catslug" label={f.categorySlugLabel} value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} disabled={saving} />
                ) : null}
                {rule === "BRAND" ? (
                  <Input id="home-brand" label={f.brandLabel} value={brand} onChange={(e) => setBrand(e.target.value)} disabled={saving} />
                ) : null}
                {rule === "ATTRIBUTE" ? (
                  <>
                    <Input id="home-attrcode" label={f.attributeCodeLabel} value={attributeCode} onChange={(e) => setAttributeCode(e.target.value)} disabled={saving} />
                    <Input id="home-attrval" label={f.attributeValueLabel} value={attributeValue} onChange={(e) => setAttributeValue(e.target.value)} disabled={saving} />
                  </>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </form>
    </Modal>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-white/70">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="h-4 w-4 accent-emerald-400"
      />
      {label}
    </label>
  );
}
